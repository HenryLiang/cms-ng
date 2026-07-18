jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(() => ({ proxy: true })),
}));

jest.mock('rss-parser', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  })),
}));

import { ConfigService } from '@nestjs/config';
import Parser from 'rss-parser';
import { RssTopicSourceAdapter } from './rss-topic-source.adapter';

describe('RssTopicSourceAdapter', () => {
  const config = {
    get: jest.fn((key: string) =>
      key === 'RSS_HUB_URL' ? 'http://localhost:1200' : undefined,
    ),
  } as unknown as ConfigService;

  afterEach(() => jest.clearAllMocks());

  it('normalizes a configured RSS feed through the source interface', async () => {
    const parseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'World story',
          contentSnippet: 'Story summary',
          link: 'https://example.com/story',
        },
      ],
    });
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    const result = await adapter.fetch('bbc', {}, { page: 1, limit: 20 });

    expect(parseURL).toHaveBeenCalledWith(
      'http://feeds.bbci.co.uk/news/rss.xml',
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'available',
        total: 1,
        items: [
          expect.objectContaining({
            title: 'World story',
            source: 'bbc',
            description: 'Story summary',
          }),
        ],
      }),
    );
  });

  it('exposes ordinary and parameterized RSS sources from one catalog', () => {
    const adapter = new RssTopicSourceAdapter(config);

    const definitions = adapter.listDefinitions({});

    expect(definitions.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        'google-trends',
        'sina',
        'reuters',
        'zaobao',
        'weibo-hot',
        'bilibili-ranking',
        'bilibili-partition',
        'nhk',
      ]),
    );
    expect(
      definitions.find((source) => source.id === 'bilibili-partition'),
    ).toEqual(
      expect.objectContaining({
        parameters: expect.arrayContaining([
          expect.objectContaining({ key: 'tid', kind: 'select' }),
        ]),
      }),
    );
  });

  it('uses source parameters when fetching Google Trends', async () => {
    const parseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'AI',
          'ht:approx_traffic': '10,000+',
          'ht:news_item': {
            'ht:news_item_title': 'AI story',
            'ht:news_item_snippet': 'AI summary',
            'ht:news_item_url': 'https://example.com/ai',
            'ht:news_item_source': 'Example',
          },
        },
      ],
    });
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    const result = await adapter.fetch(
      'google-trends',
      {},
      { params: { geo: 'US' } },
    );

    expect(parseURL).toHaveBeenCalledWith(
      'https://trends.google.com/trending/rss?geo=US',
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: 'AI',
        description: 'AI summary',
        heatScore: 90,
      }),
    );
  });

  it('omits geo instead of falling back to Hong Kong for global trends', async () => {
    const parseURL = jest.fn().mockResolvedValue({ items: [] });
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    await adapter.fetch('google-trends', {}, { params: { geo: '' } });

    expect(parseURL).toHaveBeenCalledWith(
      'https://trends.google.com/trending/rss',
    );
  });

  it('fetches a parameterized Bilibili partition without a dedicated route', async () => {
    const parseURL = jest.fn().mockResolvedValue({ items: [] });
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    await adapter.fetch('bilibili-partition', {}, { params: { tid: 181 } });

    expect(parseURL).toHaveBeenCalledWith(
      'http://localhost:1200/bilibili/ranking/181',
    );
  });

  it('aggregates and deduplicates NHK category feeds', async () => {
    const parseURL = jest.fn().mockImplementation((url: string) => ({
      items: [
        {
          title: url.endsWith('cat0.xml') ? 'Shared story' : 'Shared story',
          link: url,
        },
      ],
    }));
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    const result = await adapter.fetch('nhk', {}, {});

    expect(parseURL).toHaveBeenCalledTimes(8);
    expect(result.total).toBe(1);
    expect(result.items[0].source).toBe('nhk');
  });

  it('aggregates configured feeds while isolating an upstream failure', async () => {
    const parseURL = jest.fn().mockImplementation((url: string) => {
      if (url.includes('people.com.cn'))
        throw new Error('upstream unavailable');
      return {
        items: [{ title: 'Shared headline', link: url }],
      };
    });
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    const result = await adapter.fetch(
      'all-news',
      {},
      { params: { geo: 'US' } },
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.status).toBe('degraded');
    expect(result.warnings?.[0]).toContain('1 个聚合源暂时不可用');
    expect(parseURL).toHaveBeenCalledWith(
      'https://trends.google.com/trending/rss?geo=US',
    );
  });

  it('distinguishes an unavailable feed from a genuinely empty feed', async () => {
    const parseURL = jest.fn().mockRejectedValue(new Error('timeout'));
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(config);

    const result = await adapter.fetch('bbc', {}, {});

    expect(result).toEqual(
      expect.objectContaining({
        items: [],
        status: 'unavailable',
        warnings: ['BBC 暂时不可用: timeout'],
      }),
    );
  });

  it('keeps domestic feeds direct and applies the configured proxy to overseas feeds', async () => {
    const proxiedConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          RSS_HUB_URL: 'http://localhost:1200',
          RSS_PROXY_ENABLED: 'true',
          HTTP_PROXY: 'http://127.0.0.1:7890',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    const parseURL = jest.fn().mockResolvedValue({ items: [] });
    (Parser as unknown as jest.Mock).mockImplementation(() => ({ parseURL }));
    const adapter = new RssTopicSourceAdapter(proxiedConfig);

    await adapter.fetch('sina', {}, {});
    await adapter.fetch('bbc', {}, {});

    const parserCalls = (Parser as unknown as jest.Mock).mock.calls;
    expect(parserCalls[0][0].requestOptions).toEqual({});
    expect(parserCalls[1][0].requestOptions).toEqual({
      agent: { proxy: true },
    });
  });
});
