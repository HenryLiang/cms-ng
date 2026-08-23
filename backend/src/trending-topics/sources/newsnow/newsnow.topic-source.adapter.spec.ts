/**
 * 通过 mock newsnow-http.client(单点 HTTP 出口)驱动真实 registry +
 * vendored 抓取器 + adapter 全链路:定义暴露、白名单、缓存、分页、
 * heatScore 派生、fail-open。
 */
jest.mock('./newsnow-http.client', () => {
  const actual = jest.requireActual('./newsnow-http.client');
  return {
    ...actual,
    myFetch: jest.fn(),
    fetchResponseCookies: jest.fn().mockResolvedValue(['SUB=mock-cookie']),
  };
});

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsnowTopicSourceAdapter } from './newsnow.topic-source.adapter';
import { myFetch } from './newsnow-http.client';
import { NEWSNOW_SOURCE_ENTRIES } from './newsnow-source.registry';

const mockMyFetch = myFetch as unknown as jest.Mock;

function buildConfig(overrides: Record<string, string> = {}): ConfigService {
  const merged = { ...overrides };
  return {
    get: jest.fn((k: string) => merged[k]),
  } as unknown as ConfigService;
}

const TOUTIAO_FIXTURE = {
  data: [
    { ClusterIdStr: 'c1', Title: '头条第一条', HotValue: '1' },
    { ClusterIdStr: 'c2', Title: '头条第二条', HotValue: '2' },
    { ClusterIdStr: 'c3', Title: '头条第三条', HotValue: '3' },
  ],
};

/** 给定 URL 子串 -> 响应;未匹配的 URL 抛错(防止 fixture 覆盖意外依赖)。 */
function mockResponsesByUrl(
  routes: Array<{ match: string; value: unknown }>,
): void {
  mockMyFetch.mockImplementation((url: string) => {
    for (const route of routes) {
      if (String(url).includes(route.match))
        return Promise.resolve(route.value);
    }
    return Promise.reject(new Error(`smoke 未预期的请求: ${url}`));
  });
}

describe('NewsnowTopicSourceAdapter', () => {
  beforeEach(() => {
    mockMyFetch.mockReset();
  });

  describe('listDefinitions', () => {
    it('默认启用:全量暴露 newsnow- 前缀源,元数据合法且 id 唯一', () => {
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());
      const definitions = adapter.listDefinitions({});

      expect(definitions.length).toBe(NEWSNOW_SOURCE_ENTRIES.length);
      const ids = new Set(definitions.map((d) => d.id));
      expect(ids.size).toBe(definitions.length);
      for (const definition of definitions) {
        expect(definition.id).toMatch(/^newsnow-/);
        expect(definition.label).toBeTruthy();
        expect(['news', 'trending', 'social', 'culture', 'history']).toContain(
          definition.category,
        );
        expect([
          'newspaper',
          'trending',
          'flame',
          'video',
          'social',
          'calendar',
        ]).toContain(definition.icon);
      }
    });

    it('NEWSNOW_ENABLED=false 时不暴露任何源', () => {
      const adapter = new NewsnowTopicSourceAdapter(
        buildConfig({ NEWSNOW_ENABLED: 'false' }),
      );
      expect(adapter.listDefinitions({})).toEqual([]);
    });

    it('NEWSNOW_SOURCES 白名单只暴露指定源', () => {
      const adapter = new NewsnowTopicSourceAdapter(
        buildConfig({
          NEWSNOW_SOURCES: 'newsnow-toutiao, newsnow-baidu, ,',
        }),
      );
      const definitions = adapter.listDefinitions({});
      // 白名单过滤保持 registry 声明顺序(baidu 在前)
      expect(definitions.map((d) => d.id)).toEqual([
        'newsnow-baidu',
        'newsnow-toutiao',
      ]);
    });
  });

  describe('fetch', () => {
    it('走真实 vendored 抓取器:映射 TopicCandidate 且 heatScore 按排名递减', async () => {
      mockResponsesByUrl([
        { match: 'toutiao.com/hot-event', value: TOUTIAO_FIXTURE },
      ]);
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());

      const page = await adapter.fetch(
        'newsnow-toutiao',
        {},
        { page: 1, limit: 2 },
      );

      expect(page.status).toBe('available');
      expect(page.total).toBe(3);
      expect(page.totalPages).toBe(2);
      expect(page.items).toHaveLength(2);
      expect(page.items[0]).toMatchObject({
        title: '头条第一条',
        source: 'newsnow-toutiao',
        heatScore: 98,
      });
      expect(page.items[1].heatScore).toBeLessThan(page.items[0].heatScore);
      expect(page.items[0].articles[0]).toMatchObject({
        title: '头条第一条',
        url: 'https://www.toutiao.com/trending/c1/',
      });
    });

    it('缓存命中:同源第二次 fetch 不再外呼', async () => {
      mockResponsesByUrl([
        { match: 'toutiao.com/hot-event', value: TOUTIAO_FIXTURE },
      ]);
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());

      await adapter.fetch('newsnow-toutiao', {}, { page: 1, limit: 10 });
      await adapter.fetch('newsnow-toutiao', {}, { page: 1, limit: 10 });

      expect(mockMyFetch).toHaveBeenCalledTimes(1);
    });

    it('空标题与重复标题被过滤,heatScore 以去重后的排名派生', async () => {
      mockResponsesByUrl([
        {
          match: 'toutiao.com/hot-event',
          value: {
            data: [
              { ClusterIdStr: 'a', Title: '正常' },
              { ClusterIdStr: 'b', Title: '正常' }, // 重复
              { ClusterIdStr: 'c', Title: '   ' }, // 空标题
              { ClusterIdStr: 'd', Title: '末条' },
            ],
          },
        },
      ]);
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());

      const page = await adapter.fetch('newsnow-toutiao', {}, {});

      expect(page.items.map((i) => i.title)).toEqual(['正常', '末条']);
      expect(page.items[0].heatScore).toBe(98);
      expect(page.items[1].heatScore).toBe(50);
    });

    it('抓取失败 fail-open:空页 + unavailable + warnings,不抛异常', async () => {
      mockMyFetch.mockRejectedValue(new Error('connect ETIMEDOUT'));
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());

      const page = await adapter.fetch('newsnow-baidu', {}, {});

      expect(page.status).toBe('unavailable');
      expect(page.items).toEqual([]);
      expect(page.warnings?.[0]).toContain('百度热搜');
      expect(page.warnings?.[0]).toContain('ETIMEDOUT');
    });

    it('未知源抛 BadRequest', async () => {
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());
      await expect(
        adapter.fetch('newsnow-not-exist', {}, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('总开关关闭时 fetch 拒绝', async () => {
      const adapter = new NewsnowTopicSourceAdapter(
        buildConfig({ NEWSNOW_ENABLED: 'false' }),
      );
      await expect(
        adapter.fetch('newsnow-toutiao', {}, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('单源条数上限 30(与上游一致)', async () => {
      mockResponsesByUrl([
        {
          match: 'toutiao.com/hot-event',
          value: {
            data: Array.from({ length: 40 }, (_, i) => ({
              ClusterIdStr: `c${i}`,
              Title: `标题${i}`,
            })),
          },
        },
      ]);
      const adapter = new NewsnowTopicSourceAdapter(buildConfig());

      const page = await adapter.fetch('newsnow-toutiao', {}, { limit: 50 });

      expect(page.total).toBe(30);
    });
  });
});
