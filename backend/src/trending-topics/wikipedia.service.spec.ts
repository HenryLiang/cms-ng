import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WikipediaService } from './wikipedia.service';
import { RedisService } from '../redis/redis.service';
import { ProxyAgent } from 'undici';

// Mock undici ProxyAgent（service 内动态 import）—— 与 twitter.service.spec 同模式
jest.mock('undici', () => ({
  ProxyAgent: jest.fn((url: string) => ({ proxyUrl: url })),
}));

describe('WikipediaService', () => {
  let service: WikipediaService;
  let redis: { get: jest.Mock; set: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WikipediaService,
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                WIKIPEDIA_PROXY_ENABLED: 'false',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<WikipediaService>(WikipediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Wikipedia events 响应样本：含一个年份页（应跳过）+ 一个有缩略图的实质 page + 一个古代事件
  const wikiResponse = {
    events: [
      {
        text: '埃及軍方宣佈終止憲法，推翻首位民選總統穆爾西。',
        year: 2013,
        pages: [
          {
            normalizedtitle: '2013年',
            extract: '2013年是一個平年，第一天是星期二。',
          },
          {
            normalizedtitle: '穆爾西',
            extract: '穆爾西是埃及首位民選總統。',
            description: 'President of Egypt from 2012 to 2013',
            thumbnail: { source: 'https://upload.example/morsi.jpg' },
            content_urls: {
              desktop: { page: 'https://zh.wikipedia.org/wiki/穆爾西' },
            },
          },
        ],
      },
      {
        text: '某古代事件。',
        year: 500,
        pages: [{ normalizedtitle: '古代條目', extract: '古代條目摘要。' }],
      },
    ],
  };

  it('describes and fetches the historical source through the generic interface', async () => {
    redis.get.mockResolvedValue(JSON.stringify([]));

    const definitions = await service.listDefinitions({});
    const result = await service.fetch(
      'this-day',
      {},
      { params: { region: 'HK', date: '2026-07-03' } },
    );

    expect(definitions).toEqual([
      expect.objectContaining({ id: 'this-day', category: 'history' }),
    ]);
    expect(redis.get).toHaveBeenCalledWith('wiki:otd:zh:zh-hk:7-3');
    expect(result).toEqual(expect.objectContaining({ status: 'available' }));
  });

  describe('fetchOnThisDay', () => {
    it('throws BadRequestException for unsupported region', async () => {
      await expect(
        service.fetchOnThisDay('JP', undefined, 1, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid date format', async () => {
      await expect(
        service.fetchOnThisDay('CN', '2026/07/03', 1, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns cached items without calling API', async () => {
      const cached = [{ title: '【2013年】cached', source: 'this-day' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.items).toEqual(cached);
    });

    it('fetches, normalizes (skipping year pages), caches on cache miss', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => wikiResponse });

      const result = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      // 缓存键按 lang+variant 区分
      expect(redis.set).toHaveBeenCalledWith(
        'wiki:otd:zh:zh-cn:7-3',
        expect.any(String),
        86400,
      );
      // 调用了 zh.wikipedia.org，并带 zh-cn Accept-Language（简体）
      expect(fetchMock).toHaveBeenCalledWith(
        'https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events/7/3',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Accept-Language': 'zh-cn' }),
        }),
      );

      expect(result.items).toHaveLength(2);
      // 2013 事件：跳过年份页"2013年"，bestPage 取有缩略图的"穆爾西"
      const modern = result.items.find((i: any) => i.year === 2013);
      expect(modern.title).toBe(
        '【2013年】埃及軍方宣佈終止憲法，推翻首位民選總統穆爾西。',
      );
      expect(modern.description).toBe('穆爾西是埃及首位民選總統。'); // 跳过年份页 extract
      expect(modern.source).toBe('this-day');
      expect(modern.tags).toEqual(['穆爾西']); // 年份页"2013年"被剔除
      expect(modern.coverImage).toBe('https://upload.example/morsi.jpg');
      expect(modern.articles).toEqual([
        {
          title: '穆爾西',
          source: 'this-day',
          snippet: '穆爾西是埃及首位民選總統。',
          url: 'https://zh.wikipedia.org/wiki/穆爾西',
        },
      ]);
      expect(modern.type).toBe('事件'); // 5 类型合并后的类型标签
    });

    it('sorts by heatScore descending (modern events rank higher than ancient)', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => wikiResponse });

      const result = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      // 2013 事件 heatScore 应高于 500 年事件（recency 更高）
      expect(result.items[0].heatScore).toBeGreaterThanOrEqual(
        result.items[1].heatScore,
      );
      expect(result.items[0].year).toBe(2013);
    });

    it('HK uses zh-hk variant (traditional Chinese)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      });

      await service.fetchOnThisDay('HK', '2026-07-03', 1, 10);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events/7/3',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Accept-Language': 'zh-hk' }),
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(
        'wiki:otd:zh:zh-hk:7-3',
        expect.any(String),
        86400,
      );
    });

    it('US and EU use en without Accept-Language, sharing the same cache key', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      });

      await service.fetchOnThisDay('US', '2026-07-03', 1, 10);
      const usInit = fetchMock.mock.calls[0][1];
      expect(usInit.headers['Accept-Language']).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/7/3',
        expect.anything(),
      );

      await service.fetchOnThisDay('EU', '2026-07-03', 1, 10);
      // US 与 EU 共用 en 源 → 同一缓存键
      expect(redis.set).toHaveBeenCalledWith(
        'wiki:otd:en:default:7-3',
        expect.any(String),
        86400,
      );
    });

    it('paginates results', async () => {
      const many = Array.from({ length: 25 }, (_, i) => ({
        text: `事件${i}`,
        year: 2000,
        pages: [],
      }));
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: many }),
      });

      const page1 = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);
      const page2 = await service.fetchOnThisDay('CN', '2026-07-03', 2, 10);

      expect(page1.items).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);
      expect(page2.page).toBe(2);
      expect(page2.items).toHaveLength(10);
    });

    it('defaults to today when date omitted', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      });

      await service.fetchOnThisDay('CN', undefined, 1, 10);

      const url = fetchMock.mock.calls[0][0] as string;
      const today = new Date();
      const expectedUrl = `https://zh.wikipedia.org/api/rest_v1/feed/onthisday/events/${today.getMonth() + 1}/${today.getDate()}`;
      expect(url).toBe(expectedUrl);
    });

    it('throws ServiceUnavailableException when API returns non-ok', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'upstream error',
      });

      await expect(
        service.fetchOnThisDay('CN', '2026-07-03', 1, 10),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException on network error', async () => {
      fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        service.fetchOnThisDay('CN', '2026-07-03', 1, 10),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rejects impossible calendar dates (e.g. 2026-02-31) with BadRequestException', async () => {
      await expect(
        service.fetchOnThisDay('CN', '2026-02-31', 1, 10),
      ).rejects.toThrow(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falls back to event text when all pages are year-pages (no informative page)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          events: [
            {
              text: '某冷门事件描述。',
              year: 2013,
              pages: [
                {
                  normalizedtitle: '2013年',
                  extract: '2013年是一個平年，第一天是星期二。',
                },
              ],
            },
          ],
        }),
      });

      const result = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      const item = result.items[0];
      expect(item.title).toBe('【2013年】某冷门事件描述。');
      expect(item.description).toBe('某冷门事件描述。'); // 回退到 text，非年份页 extract
      expect(item.tags).toEqual([]); // 年份页被剔除
      expect(item.articles).toEqual([]);
      expect(item.coverImage).toBeUndefined();
    });

    it('formats BC (negative) years as 公元前', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          events: [{ text: '凱撒遇刺。', year: -44, pages: [] }],
        }),
      });

      const result = await service.fetchOnThisDay('US', '2026-03-15', 1, 10);

      expect(result.items[0].title).toBe('【公元前44年】凱撒遇刺。');
      expect(result.items[0].heatScore).toBe(10); // BC 事件低优先
    });

    it('treats corrupt cache value as miss: deletes key, refetches, re-caches', async () => {
      redis.get.mockResolvedValue('{not valid json');
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      });

      await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      expect(redis.del).toHaveBeenCalledWith('wiki:otd:zh:zh-cn:7-3');
      expect(fetchMock).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        'wiki:otd:zh:zh-cn:7-3',
        expect.any(String),
        86400,
      );
    });

    it('merges all 5 types with type labels (events/selected/births/deaths/holidays)', async () => {
      fetchMock.mockImplementation((url: string) => {
        const m = /\/onthisday\/(\w+)\//.exec(url);
        const type = m ? m[1] : 'events';
        const data: Record<string, any[]> = {
          events: [{ text: '某事件', year: 2000, pages: [] }],
          selected: [{ text: '某精选', year: 1990, pages: [] }],
          births: [{ text: '某人生日', year: 1980, pages: [] }],
          deaths: [{ text: '某人逝世', year: 1970, pages: [] }],
          holidays: [{ text: '某节日', pages: [] }], // 无 year
        };
        return Promise.resolve({
          ok: true,
          json: async () => ({ [type]: data[type] || [] }),
        });
      });

      const result = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      expect(fetchMock).toHaveBeenCalledTimes(5); // 5 类型并发
      const types = result.items.map((i: any) => i.type);
      expect(types).toEqual(
        expect.arrayContaining(['事件', '精选', '出生', '逝世', '节日']),
      );
      // holidays 无 year → title 无年份前缀、year undefined
      const holiday = result.items.find((i: any) => i.type === '节日');
      expect(holiday.title).toBe('某节日');
      expect(holiday.year).toBeUndefined();
    });

    it('skips a failed type but keeps others (partial failure tolerated)', async () => {
      // events 失败，其他 4 类型成功
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/events/')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: async () => 'err',
          });
        }
        const m = /\/onthisday\/(\w+)\//.exec(url);
        const type = m ? m[1] : 'events';
        return Promise.resolve({
          ok: true,
          json: async () => ({
            [type]: [{ text: `${type}条目`, year: 2000, pages: [] }],
          }),
        });
      });

      const result = await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      const types = result.items.map((i: any) => i.type);
      expect(types).not.toContain('事件'); // events 失败跳过
      expect(types).toEqual(
        expect.arrayContaining(['精选', '出生', '逝世', '节日']),
      );
    });
  });

  describe('proxy', () => {
    it('attaches undici ProxyAgent when WIKIPEDIA_PROXY_ENABLED=true', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WikipediaService,
          { provide: RedisService, useValue: redis },
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                const map: Record<string, string> = {
                  WIKIPEDIA_PROXY_ENABLED: 'true',
                  HTTP_PROXY: 'http://127.0.0.1:7890',
                };
                return map[key];
              },
            },
          },
        ],
      }).compile();
      const proxyService = module.get<WikipediaService>(WikipediaService);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      });

      await proxyService.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      expect(ProxyAgent).toHaveBeenCalledWith('http://127.0.0.1:7890');
      const init = fetchMock.mock.calls[0][1];
      expect(init.dispatcher).toBeDefined();
    });

    it('does not attach ProxyAgent when WIKIPEDIA_PROXY_ENABLED=false', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ events: [] }),
      });

      await service.fetchOnThisDay('CN', '2026-07-03', 1, 10);

      expect(ProxyAgent).not.toHaveBeenCalled();
      const init = fetchMock.mock.calls[0][1];
      expect(init.dispatcher).toBeUndefined();
    });
  });
});
