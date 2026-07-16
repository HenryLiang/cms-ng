jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

// adapter 运行时 import RssTopicSourceAdapter（NestJS DI token），后者又 import
// https-proxy-agent / rss-parser（ESM，jest 默认不转换 node_modules），故一并
// mock 掉，与 rss-topic-source.adapter.spec.ts 一致。
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

jest.mock('rss-parser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { chromium } from 'playwright';
import { GoogleTrendsRealtimeAdapter } from './google-trends-realtime.topic-source.adapter';
import type { RssTopicSourceAdapter } from './rss-topic-source.adapter';
import type { RedisService } from '../../redis/redis.service';

// adapter 构造时若 PLAYWRIGHT_ENABLED=true 会注册 SIGTERM/SIGINT 监听器；
// 多个 case 实例化会累积，放宽上限避免假告警。
process.setMaxListeners(50);

describe('GoogleTrendsRealtimeAdapter', () => {
  function buildConfig(overrides: Record<string, string> = {}): ConfigService {
    const defaults: Record<string, string> = {
      PLAYWRIGHT_ENABLED: 'true',
      GOOGLE_TRENDS_REALTIME_PROXY_ENABLED: 'false',
      GOOGLE_TRENDS_REALTIME_FALLBACK_TO_RSS: 'true',
      GOOGLE_TRENDS_REALTIME_CACHE_TTL: '60',
      GOOGLE_TRENDS_HOURS: '24',
    };
    const merged = { ...defaults, ...overrides };
    return { get: jest.fn((k: string) => merged[k]) } as unknown as ConfigService;
  }

  function buildPageChain(evaluateResult: unknown = [
    'canada wildfires 2026',
    'weather tomorrow',
    'fever game',
  ]) {
    const page = {
      route: jest.fn(),
      goto: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(evaluateResult),
      close: jest.fn(),
    };
    const context = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      isConnected: () => true,
      close: jest.fn().mockResolvedValue(undefined),
    };
    return { page, context, browser };
  }

  function buildRedis(getResult: string | null = null) {
    return {
      get: jest.fn().mockResolvedValue(getResult),
      set: jest.fn().mockResolvedValue(undefined),
      isAvailable: true,
    };
  }

  function buildRssAdapter() {
    return {
      fetch: jest.fn(),
      listDefinitions: jest.fn(),
    } as unknown as RssTopicSourceAdapter;
  }

  afterEach(() => jest.clearAllMocks());

  it('toggles source visibility with PLAYWRIGHT_ENABLED', () => {
    const on = new GoogleTrendsRealtimeAdapter(
      buildConfig({ PLAYWRIGHT_ENABLED: 'true' }),
      buildRedis() as unknown as RedisService,
      buildRssAdapter(),
    );
    expect(on.listDefinitions({})[0].visible).toBe(true);

    const off = new GoogleTrendsRealtimeAdapter(
      buildConfig({ PLAYWRIGHT_ENABLED: 'false' }),
      buildRedis() as unknown as RedisService,
      buildRssAdapter(),
    );
    expect(off.listDefinitions({})[0].visible).toBe(false);
  });

  it('declares geo + hours parameters', () => {
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      buildRedis() as unknown as RedisService,
      buildRssAdapter(),
    );
    const def = adapter.listDefinitions({})[0];
    expect(def.id).toBe('google-trends-realtime');
    expect(def.manualRefresh).toBe(true);
    expect(def.parameters?.map((p) => p.key)).toEqual(['geo', 'hours']);
    const hours = def.parameters?.find((p) => p.key === 'hours');
    expect(hours?.options?.map((o) => o.value)).toEqual([4, 24, 48, 72]);
  });

  it('scrapes the realtime page and normalizes items with rank-based heatScore', async () => {
    const { page, browser } = buildPageChain();
    (chromium.launch as jest.Mock).mockResolvedValue(browser);
    const redis = buildRedis();
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      redis as unknown as RedisService,
      buildRssAdapter(),
    );

    const result = await adapter.fetch(
      'google-trends-realtime',
      {},
      { page: 1, limit: 10, params: { geo: 'US', hours: 24 } },
    );

    expect(page.goto).toHaveBeenCalledWith(
      'https://trends.google.com/trending?geo=US&hours=24',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(result.status).toBe('available');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: 'canada wildfires 2026',
        source: 'google-trends-realtime',
        heatScore: 98,
      }),
    );
    expect(result.items[2].heatScore).toBe(50);
    expect(redis.set).toHaveBeenCalledWith(
      'gt:realtime:US:24',
      expect.any(String),
      60,
    );
  });

  it('derives heatScore from deduped count, not raw anchor count', async () => {
    // 页面可能对同一主题重复 emit explore 链接；heatScore 必须按去重后数量派生
    const { browser } = buildPageChain([
      'wildfires',
      'weather',
      'wildfires',
      'fever',
    ]);
    (chromium.launch as jest.Mock).mockResolvedValue(browser);
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      buildRedis() as unknown as RedisService,
      buildRssAdapter(),
    );

    const result = await adapter.fetch(
      'google-trends-realtime',
      {},
      { params: { geo: 'US', hours: 24 } },
    );

    // 4 raw -> 3 unique；末条按 unique count 派生应为 50，而非 raw count 的 66
    expect(result.items).toHaveLength(3);
    expect(result.items[0].heatScore).toBe(98);
    expect(result.items[2].heatScore).toBe(50);
  });

  it('serves a Redis cache hit without launching Playwright', async () => {
    const { page, browser } = buildPageChain();
    (chromium.launch as jest.Mock).mockResolvedValue(browser);
    const cached = JSON.stringify([
      {
        title: 'cached trend',
        description: 'cached trend',
        source: 'google-trends-realtime',
        heatScore: 90,
        tags: [],
        articles: [],
      },
    ]);
    const redis = buildRedis(cached);
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      redis as unknown as RedisService,
      buildRssAdapter(),
    );

    const result = await adapter.fetch(
      'google-trends-realtime',
      {},
      { params: { geo: 'US', hours: 24 } },
    );

    expect(page.goto).not.toHaveBeenCalled();
    expect(result.items[0].title).toBe('cached trend');
  });

  it('rejects invalid hours with BadRequestException', async () => {
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      buildRedis() as unknown as RedisService,
      buildRssAdapter(),
    );
    await expect(
      adapter.fetch(
        'google-trends-realtime',
        {},
        { params: { hours: 99 } },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('falls back to the RSS daily source (degraded) when Playwright fails', async () => {
    (chromium.launch as jest.Mock).mockRejectedValue(
      new Error('chromium missing'),
    );
    const rss = buildRssAdapter();
    (rss.fetch as jest.Mock).mockResolvedValue({
      items: [{ title: 'rss daily trend' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      status: 'available',
    });
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      buildRedis() as unknown as RedisService,
      rss,
    );

    const result = await adapter.fetch(
      'google-trends-realtime',
      { userId: 'u1' },
      { params: { geo: 'US', hours: 24 } },
    );

    expect(rss.fetch).toHaveBeenCalledWith('google-trends', { userId: 'u1' }, expect.anything());
    expect(result.status).toBe('degraded');
    expect(result.warnings?.[0]).toContain('回退');
  });

  it('returns unavailable when both Playwright and RSS fail', async () => {
    (chromium.launch as jest.Mock).mockRejectedValue(
      new Error('chromium missing'),
    );
    const rss = buildRssAdapter();
    (rss.fetch as jest.Mock).mockRejectedValue(new Error('rss down'));
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      buildRedis() as unknown as RedisService,
      rss,
    );

    const result = await adapter.fetch(
      'google-trends-realtime',
      {},
      { params: { geo: 'US', hours: 24 } },
    );

    expect(result.status).toBe('unavailable');
    expect(result.items).toEqual([]);
  });

  it('clamps limit to 50 and slices the cached list', async () => {
    const cached = JSON.stringify(
      Array.from({ length: 60 }, (_, i) => ({
        title: `t${i}`,
        description: `t${i}`,
        source: 'google-trends-realtime',
        heatScore: 50,
        tags: [],
        articles: [],
      })),
    );
    const adapter = new GoogleTrendsRealtimeAdapter(
      buildConfig(),
      buildRedis(cached) as unknown as RedisService,
      buildRssAdapter(),
    );

    const result = await adapter.fetch(
      'google-trends-realtime',
      {},
      { page: 1, limit: 100, params: { geo: 'US', hours: 24 } },
    );

    expect(result.limit).toBe(50);
    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(60);
    expect(result.totalPages).toBe(2);
  });
});
