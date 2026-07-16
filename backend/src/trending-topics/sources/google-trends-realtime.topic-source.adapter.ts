import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Browser } from 'playwright';
import { RedisService } from '../../redis/redis.service';
import { RssTopicSourceAdapter } from './rss-topic-source.adapter';
import type { TopicSourceAdapter } from './topic-source.adapter';
import type {
  TopicCandidate,
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from './topic-source.types';

/**
 * Google Trends 实时趋势源 —— 通过 Playwright 无头浏览器渲染
 * https://trends.google.com/trending?geo=XX&hours=24 抓取实时（Trending Now）
 * 数据。与 RSS 每日热搜（RssTopicSourceAdapter 的 'google-trends' kind）是两个
 * 不同数据集：realtime 量大（~30+/地区）但单条只有标题（无 approx_traffic 数字、
 * 无内嵌新闻），故 heatScore 按排名位置派生。
 *
 * 设计要点：
 * - sourceId 'google-trends-realtime' 独立，不复用 'google-trends'（避免与
 *   RssTopicSourceAdapter 的 first-match 派发冲突）。
 * - Playwright 浏览器单例：lazy launch（首次 fetch 才启动）、动态 import 缺包
 *   不崩 boot、idle 10min 回收、并发信号量限流。
 * - PLAYWRIGHT_ENABLED=false / 缺 Chromium 时 visible:false 且 fail-open 回退
 *   到 RSS 每日源（status:'degraded'），绝不崩溃后端。
 * - 缓存走 Redis（gt:realtime:{geo}:{hours}，TTL 默认 60s），存全量列表让
 *   paginate 切片，不按 page 驱动浏览器导航。
 */
@Injectable()
export class GoogleTrendsRealtimeAdapter
  implements TopicSourceAdapter, OnModuleDestroy
{
  private readonly logger = new Logger(GoogleTrendsRealtimeAdapter.name);
  private readonly enabled: boolean;
  private readonly proxyEnabled: boolean;
  private readonly proxyUrl: string | undefined;
  private readonly fallbackToRss: boolean;
  private readonly cacheTtl: number;
  private readonly defaultHours: number;

  private browser: Browser | null = null;
  private launchPromise: Promise<Browser | null> | null = null;
  private lastActivityAt = 0;
  private idleWatcher: NodeJS.Timeout | null = null;
  private activeRenders = 0;
  private closed = false;

  private static readonly GEO_OPTIONS = [
    { value: '', label: '全球' },
    { value: 'HK', label: '香港' },
    { value: 'TW', label: '台湾' },
    { value: 'US', label: '美国' },
    { value: 'GB', label: '英国' },
    { value: 'JP', label: '日本' },
    { value: 'KR', label: '韩国' },
    { value: 'CN', label: '中国' },
  ];

  private static readonly HOURS_OPTIONS = [
    { value: 4, label: '4 小时' },
    { value: 24, label: '24 小时' },
    { value: 48, label: '48 小时' },
    { value: 72, label: '72 小时' },
  ];

  private static readonly VALID_HOURS = new Set(
    GoogleTrendsRealtimeAdapter.HOURS_OPTIONS.map((o) => o.value),
  );

  private static readonly CACHE_TTL_DEFAULT = 60;
  private static readonly NAV_TIMEOUT_MS = 30_000;
  private static readonly SELECTOR_TIMEOUT_MS = 15_000;
  private static readonly IDLE_CLOSE_MS = 10 * 60_000;
  private static readonly MAX_CONCURRENT = 3;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly rssAdapter: RssTopicSourceAdapter,
  ) {
    this.enabled =
      (this.config.get<string>('PLAYWRIGHT_ENABLED') || '').toLowerCase() ===
      'true';
    this.proxyEnabled =
      (
        this.config.get<string>('GOOGLE_TRENDS_REALTIME_PROXY_ENABLED') || ''
      ).toLowerCase() === 'true';
    this.proxyUrl =
      this.config.get<string>('HTTP_PROXY') ||
      this.config.get<string>('http_proxy') ||
      undefined;
    this.fallbackToRss =
      (
        this.config.get<string>('GOOGLE_TRENDS_REALTIME_FALLBACK_TO_RSS') ||
        'true'
      ).toLowerCase() === 'true';
    const ttl = Number(
      this.config.get<string>('GOOGLE_TRENDS_REALTIME_CACHE_TTL'),
    );
    this.cacheTtl =
      Number.isFinite(ttl) && ttl > 0
        ? ttl
        : GoogleTrendsRealtimeAdapter.CACHE_TTL_DEFAULT;
    const hours = Number(this.config.get<string>('GOOGLE_TRENDS_HOURS'));
    this.defaultHours =
      Number.isFinite(hours) &&
      GoogleTrendsRealtimeAdapter.VALID_HOURS.has(hours)
        ? hours
        : 24;

    // 关闭依赖 enableShutdownHooks()（main.ts）触发的 onModuleDestroy：cms-ng-service.sh
    // SIGTERM 后 sleep 2 再 SIGKILL，窗口正好覆盖 shutdown 的 2s 硬上限；idleWatcher
    // （10min）兜底回收。不再单独注册信号处理器，避免 fire-and-forget 与
    // onModuleDestroy 竞争导致 2s cap 未被 await。
  }

  listDefinitions(context: TopicSourceContext): TopicSourceDefinition[] {
    void context;
    // 廉价同步，无 I/O —— fetch 派发时每次都会调（不带 includeParameterOptions），
    // 故不得在此查 DB/网络。
    return [
      {
        id: 'google-trends-realtime',
        label: 'Google Trends 实时',
        category: 'trending',
        icon: 'trending',
        aggregate: false,
        manualRefresh: true,
        visible: this.enabled,
        parameters: [
          {
            key: 'geo',
            label: '地区',
            kind: 'select',
            defaultValue: 'HK',
            options: GoogleTrendsRealtimeAdapter.GEO_OPTIONS,
          },
          {
            key: 'hours',
            label: '时间窗口',
            kind: 'select',
            defaultValue: 24,
            options: GoogleTrendsRealtimeAdapter.HOURS_OPTIONS,
          },
        ],
      },
    ];
  }

  async fetch(
    sourceId: string,
    context: TopicSourceContext,
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage> {
    if (sourceId !== 'google-trends-realtime') {
      throw new Error(`Unsupported source: ${sourceId}`);
    }

    const geo =
      query.params?.geo === undefined ? 'HK' : String(query.params.geo);
    const hours = Number(query.params?.hours ?? this.defaultHours);
    if (
      !Number.isFinite(hours) ||
      !GoogleTrendsRealtimeAdapter.VALID_HOURS.has(hours)
    ) {
      throw new BadRequestException(
        `hours 必须是 ${[...GoogleTrendsRealtimeAdapter.VALID_HOURS].join('/')} 之一`,
      );
    }

    const cacheKey = `gt:realtime:${geo || 'global'}:${hours}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const items = JSON.parse(cached) as TopicCandidate[];
        return this.paginate(items, query.page, query.limit);
      } catch {
        // 缓存损坏 -> 落到实时抓取
      }
    }

    const items = await this.scrape(geo, hours).catch((err: Error) => {
      this.logger.warn(`Playwright 抓取失败: ${err.message}`);
      return null;
    });

    if (items && items.length > 0) {
      await this.redis.set(cacheKey, JSON.stringify(items), this.cacheTtl);
      return this.paginate(items, query.page, query.limit);
    }

    return this.fallback(
      context,
      query,
      items === null ? '抓取异常' : '无结果',
    );
  }

  /** 渲染页面并提取实时趋势标题列表。 */
  private async scrape(geo: string, hours: number): Promise<TopicCandidate[]> {
    if (!this.enabled) return [];
    if (this.activeRenders >= GoogleTrendsRealtimeAdapter.MAX_CONCURRENT) {
      throw new Error('并发 realtime 抓取已达上限');
    }
    this.activeRenders += 1;
    const url = `https://trends.google.com/trending?geo=${encodeURIComponent(geo)}&hours=${hours}`;
    try {
      const browser = await this.ensureBrowser();
      if (!browser) {
        throw new Error('浏览器不可用');
      }
      this.lastActivityAt = Date.now();
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
      });
      try {
        const page = await context.newPage();
        // 阻断图片/媒体/字体/样式加速渲染（JS/XHR 必须放行，Angular 靠它出数据）
        await page.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
            void route.abort();
          } else {
            void route.continue();
          }
        });
        // 不用 networkidle：Google Trends 长连接会卡死
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: GoogleTrendsRealtimeAdapter.NAV_TIMEOUT_MS,
        });
        await page.waitForSelector('a[href*="/trends/explore"]', {
          timeout: GoogleTrendsRealtimeAdapter.SELECTOR_TIMEOUT_MS,
          // explore 链接是图标按钮，常在折叠区/视口外不可见；只要 attached 即可
          // （evaluate 直接读 DOM，不依赖可见性）。
          state: 'attached',
        });
        // 锚定稳定的 explore 链接 + URL q= 参数取标题，不依赖 Angular 自动生成的 class
        const titles = await page.evaluate(() => {
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
              'a[href*="/trends/explore?q="]',
            ),
          );
          return anchors
            .map((a) => new URL(a.href).searchParams.get('q') || '')
            .map((q) => q.trim())
            .filter(Boolean);
        });
        const seen = new Set<string>();
        const items: TopicCandidate[] = [];
        for (const title of titles) {
          if (seen.has(title)) continue;
          seen.add(title);
          items.push({
            title,
            description: title,
            source: 'google-trends-realtime',
            heatScore: 0,
            tags: [],
            articles: [],
          });
        }
        // 去重后再按最终 unique count 派生 heatScore；若用 raw titles.length（含重复）
        // 作分母会膨胀、压缩分数区间，导致末条 > 50。
        for (let i = 0; i < items.length; i += 1) {
          items[i].heatScore = this.rankToScore(i, items.length);
        }
        return items;
      } finally {
        await context.close().catch(() => {});
      }
    } finally {
      this.activeRenders -= 1;
      this.lastActivityAt = Date.now();
    }
  }

  /** 按排名位置派生 heatScore：第 0 条=98，末条=50，线性递减。 */
  private rankToScore(rank: number, total: number): number {
    if (total <= 1) return 98;
    return Math.round(98 - (rank / (total - 1)) * 48);
  }

  /** 降级：Playwright 失败时回退 RSS 每日源（status:'degraded'），全失败则 unavailable。 */
  private async fallback(
    context: TopicSourceContext,
    query: TopicSourceQuery,
    reason: string,
  ): Promise<TopicSourcePage> {
    if (this.fallbackToRss) {
      try {
        const fb = await this.rssAdapter.fetch('google-trends', context, query);
        return {
          ...fb,
          status: 'degraded',
          warnings: [
            `Google Trends 实时数据暂时不可用（${reason}），已回退到每日 RSS 源`,
            ...(fb.warnings || []),
          ],
        };
      } catch (err) {
        this.logger.warn(`RSS 回退也失败: ${(err as Error).message}`);
      }
    }
    return {
      ...this.paginate([], query.page, query.limit),
      status: 'unavailable',
      warnings: [`Google Trends 实时暂时不可用: ${reason}`],
    };
  }

  private async ensureBrowser(): Promise<Browser | null> {
    if (!this.enabled) return null;
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (this.launchPromise) return this.launchPromise;
    this.launchPromise = this.launchBrowser();
    try {
      this.browser = await this.launchPromise;
      return this.browser;
    } finally {
      this.launchPromise = null;
    }
  }

  private async launchBrowser(): Promise<Browser | null> {
    try {
      // 动态加载（lazy require）：playwright 包缺失时也不崩 boot，仅 fail-open。
      // 用 require 而非 await import()：jest 默认环境对动态 import() 支持有限，
      // 而 require 能被 jest.mock 正常拦截。
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium } = require('playwright') as typeof import('playwright');
      const args = [
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationDetection',
      ];
      // 后端以 root 运行时需要 --no-sandbox；非 root 不加（更安全）
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        args.push('--no-sandbox');
      }
      const browser = await chromium.launch({
        headless: true,
        args,
        proxy:
          this.proxyEnabled && this.proxyUrl
            ? { server: this.proxyUrl }
            : undefined,
      });
      this.logger.log('Playwright Chromium 已启动');
      this.startIdleWatcher();
      return browser;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Playwright 启动失败（fail-open）: ${msg}`);
      return null;
    }
  }

  private startIdleWatcher(): void {
    if (this.idleWatcher) return;
    this.idleWatcher = setInterval(() => {
      if (
        this.browser &&
        this.activeRenders === 0 &&
        Date.now() - this.lastActivityAt >
          GoogleTrendsRealtimeAdapter.IDLE_CLOSE_MS
      ) {
        this.logger.log('关闭空闲 Playwright 浏览器');
        this.browser.close().catch(() => {});
        this.browser = null;
        if (this.idleWatcher) {
          clearInterval(this.idleWatcher);
          this.idleWatcher = null;
        }
      }
    }, 60_000);
    this.idleWatcher.unref?.();
  }

  private async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.idleWatcher) {
      clearInterval(this.idleWatcher);
      this.idleWatcher = null;
    }
    const browser = this.browser;
    this.browser = null;
    if (browser) {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          browser.close(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 2000);
          }),
        ]);
      } catch {
        // browser.close 失败已尽力，进程即将退出
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  private paginate(
    items: TopicCandidate[],
    requestedPage = 1,
    requestedLimit = 10,
  ): TopicSourcePage {
    const page = Math.max(1, requestedPage);
    const limit = Math.min(50, Math.max(1, requestedLimit));
    const start = (page - 1) * limit;
    return {
      items: items.slice(start, start + limit),
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit) || 1,
      status: 'available',
      fetchedAt: new Date().toISOString(),
    };
  }
}
