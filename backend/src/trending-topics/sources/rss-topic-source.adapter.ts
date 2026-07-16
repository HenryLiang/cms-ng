import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Parser from 'rss-parser';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { TopicSourceAdapter } from './topic-source.adapter';
import {
  TopicCandidate,
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from './topic-source.types';

interface RssSourceConfig {
  definition: TopicSourceDefinition;
  url: string;
  direct?: boolean;
  kind?: 'rss' | 'google-trends' | 'nhk' | 'bilibili-partition' | 'aggregate';
}

interface ParsedRssItem {
  title?: string;
  contentSnippet?: string;
  summary?: string;
  link?: string;
  'ht:approx_traffic'?: unknown;
  'ht:news_item'?: unknown;
}

interface ParsedRssFeed {
  items?: ParsedRssItem[];
}

@Injectable()
export class RssTopicSourceAdapter implements TopicSourceAdapter {
  private readonly proxyEnabled: boolean;
  private readonly proxyUrl: string | undefined;
  private nhkCache: { items: TopicCandidate[]; expiresAt: number } | undefined;

  constructor(private readonly config: ConfigService) {
    this.proxyEnabled =
      (this.config.get<string>('RSS_PROXY_ENABLED') || '').toLowerCase() ===
      'true';
    this.proxyUrl =
      this.config.get<string>('HTTP_PROXY') ||
      this.config.get<string>('http_proxy');
  }

  private get sources(): RssSourceConfig[] {
    const rssHubUrl =
      this.config.get<string>('RSS_HUB_URL') || 'http://localhost:1200';
    const news = (
      id: string,
      label: string,
      url: string,
      options: Partial<RssSourceConfig> = {},
    ): RssSourceConfig => ({
      definition: {
        id,
        label,
        category: 'news',
        icon: 'newspaper',
        aggregate: true,
      },
      url,
      ...options,
    });
    return [
      {
        definition: {
          id: 'all-news',
          label: '综合资讯',
          category: 'news',
          icon: 'newspaper',
          aggregate: false,
        },
        url: '',
        kind: 'aggregate',
      },
      {
        definition: {
          id: 'google-trends',
          label: 'Google Trends',
          category: 'trending',
          icon: 'trending',
          aggregate: true,
          manualRefresh: true,
          parameters: [
            {
              key: 'geo',
              label: '地区',
              kind: 'select',
              defaultValue: 'HK',
              options: [
                { value: '', label: '全球' },
                { value: 'HK', label: '香港' },
                { value: 'TW', label: '台湾' },
                { value: 'US', label: '美国' },
                { value: 'GB', label: '英国' },
                { value: 'JP', label: '日本' },
                { value: 'KR', label: '韩国' },
                { value: 'CN', label: '中国' },
              ],
            },
          ],
        },
        url: 'https://trends.google.com/trending/rss?geo=HK',
        kind: 'google-trends',
      },
      news(
        'sina',
        '新浪新闻',
        'https://rss.sina.com.cn/news/china/focus15.xml',
        {
          direct: true,
        },
      ),
      news('people', '人民网', 'http://www.people.com.cn/rss/politics.xml', {
        direct: true,
      }),
      news('bbc', 'BBC', 'http://feeds.bbci.co.uk/news/rss.xml'),
      news(
        'chinanews',
        '中国新闻网',
        'http://www.chinanews.com/rss/scroll-news.xml',
        { direct: true },
      ),
      news('guardian', 'The Guardian', 'https://www.theguardian.com/world/rss'),
      news(
        'nytimes',
        '纽约时报',
        'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      ),
      news('economist', '经济学人', 'https://www.economist.com/latest/rss.xml'),
      news('ft', '金融时报', 'https://www.ft.com/rss/home/uk'),
      news(
        'reuters',
        'Reuters',
        'https://news.google.com/rss/search?q=site:reuters.com&hl=en&gl=US&ceid=US:en',
      ),
      news('zaobao', '联合早报', `${rssHubUrl}/zaobao/realtime/china`, {
        direct: true,
      }),
      news('36kr', '36氪', `${rssHubUrl}/36kr/news/latest`, { direct: true }),
      news('huxiu', '虎嗅', `${rssHubUrl}/huxiu/article`, { direct: true }),
      {
        ...news(
          'douban-movie',
          '豆瓣热映',
          `${rssHubUrl}/douban/movie/playing`,
          {
            direct: true,
          },
        ),
        definition: {
          id: 'douban-movie',
          label: '豆瓣热映',
          category: 'culture',
          icon: 'newspaper',
          aggregate: true,
        },
      },
      {
        ...news(
          'weibo-hot',
          '微博热搜',
          `${rssHubUrl}/weibo/search/hot?limit=50`,
          {
            direct: true,
          },
        ),
        definition: {
          id: 'weibo-hot',
          label: '微博热搜',
          category: 'trending',
          icon: 'flame',
          aggregate: true,
        },
      },
      {
        ...news('zhihu-hot', '知乎热榜', `${rssHubUrl}/zhihu/hot?limit=50`, {
          direct: true,
        }),
        definition: {
          id: 'zhihu-hot',
          label: '知乎热榜',
          category: 'trending',
          icon: 'flame',
          aggregate: true,
        },
      },
      {
        ...news(
          'bilibili-hot-search',
          'B站热搜',
          `${rssHubUrl}/bilibili/hot-search`,
          {
            direct: true,
          },
        ),
        definition: {
          id: 'bilibili-hot-search',
          label: 'B站热搜',
          category: 'trending',
          icon: 'video',
          aggregate: true,
        },
      },
      {
        ...news(
          'bilibili-ranking',
          'B站热榜',
          `${rssHubUrl}/bilibili/popular/all`,
          {
            direct: true,
          },
        ),
        definition: {
          id: 'bilibili-ranking',
          label: 'B站热榜',
          category: 'trending',
          icon: 'video',
          aggregate: true,
        },
      },
      {
        definition: {
          id: 'bilibili-partition',
          label: 'B站分区热榜',
          category: 'trending',
          icon: 'video',
          aggregate: false,
          parameters: [
            {
              key: 'tid',
              label: '分区',
              kind: 'select',
              defaultValue: 36,
              options: [
                { value: 36, label: '知识' },
                { value: 3, label: '音乐' },
                { value: 181, label: '影视' },
                { value: 211, label: '美食' },
                { value: 160, label: '生活' },
                { value: 155, label: '时尚' },
              ],
            },
          ],
        },
        url: `${rssHubUrl}/bilibili/ranking/:tid`,
        direct: true,
        kind: 'bilibili-partition',
      },
      {
        definition: {
          id: 'nhk',
          label: 'NHK 新闻',
          category: 'news',
          icon: 'newspaper',
          aggregate: false,
        },
        url: 'https://www3.nhk.or.jp/rss/news/cat:category.xml',
        kind: 'nhk',
      },
    ];
  }

  listDefinitions(context: TopicSourceContext): TopicSourceDefinition[] {
    void context;
    return this.sources.map((source) => source.definition);
  }

  async fetch(
    sourceId: string,
    context: TopicSourceContext,
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage> {
    void context;
    const source = this.sources.find(
      (candidate) => candidate.definition.id === sourceId,
    );
    if (!source) {
      throw new Error(`Unsupported RSS source: ${sourceId}`);
    }
    if (source.kind === 'aggregate') {
      return this.fetchAggregate(query);
    }
    try {
      const items =
        source.kind === 'google-trends'
          ? await this.fetchGoogleTrends(source, query)
          : source.kind === 'bilibili-partition'
            ? await this.fetchBilibiliPartition(source, query)
            : source.kind === 'nhk'
              ? await this.fetchNhk(source)
              : await this.fetchRss(source);
      return this.paginate(items, query.page, query.limit);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      return {
        ...this.paginate([], query.page, query.limit),
        status: 'unavailable',
        warnings: [
          `${source.definition.label} 暂时不可用: ${(error as Error).message}`,
        ],
      };
    }
  }

  private async fetchAggregate(
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage> {
    const aggregateSources = this.sources.filter(
      (source) => source.definition.aggregate,
    );
    const results = await Promise.allSettled(
      aggregateSources.map((source) =>
        source.kind === 'google-trends'
          ? this.fetchGoogleTrends(source, query)
          : this.fetchRss(source),
      ),
    );
    const seen = new Set<string>();
    const items = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((item) => {
        const key = item.title.trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const failureCount = results.filter(
      (result) => result.status === 'rejected',
    ).length;
    return {
      ...this.paginate(items, query.page, query.limit),
      status:
        failureCount === results.length && items.length === 0
          ? 'unavailable'
          : failureCount
            ? 'degraded'
            : 'available',
      warnings: failureCount
        ? [`${failureCount} 个聚合源暂时不可用，已返回其余来源结果`]
        : undefined,
    };
  }

  private async fetchNhk(source: RssSourceConfig): Promise<TopicCandidate[]> {
    if (this.nhkCache && this.nhkCache.expiresAt > Date.now()) {
      return this.nhkCache.items;
    }
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, category) =>
        this.fetchRss({
          ...source,
          url: source.url.replace(':category', String(category)),
        }),
      ),
    );
    const seen = new Set<string>();
    const items = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((item) => {
        const key = item.title.trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    this.nhkCache = { items, expiresAt: Date.now() + 300_000 };
    return items;
  }

  private async fetchBilibiliPartition(
    source: RssSourceConfig,
    query: TopicSourceQuery,
  ): Promise<TopicCandidate[]> {
    const tid = Number(query.params?.tid || 36);
    if (!Number.isInteger(tid) || tid <= 0) {
      throw new BadRequestException('分区 ID tid 必须是正整数');
    }
    const parameterizedSource = {
      ...source,
      url: source.url.replace(':tid', String(tid)),
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.fetchRss(parameterizedSource);
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
    return [];
  }

  private async fetchGoogleTrends(
    source: RssSourceConfig,
    query: TopicSourceQuery,
  ): Promise<TopicCandidate[]> {
    const geo =
      query.params?.geo === undefined ? 'HK' : String(query.params.geo);
    const url = geo
      ? source.url.replace(/geo=[^&]*/i, `geo=${encodeURIComponent(geo)}`)
      : source.url.replace(/\?geo=[^&]*$/i, '');
    const parserOptions = {
      customFields: {
        item: [
          'ht:approx_traffic',
          'ht:picture',
          'ht:picture_source',
          'ht:news_item',
        ],
      },
      requestOptions: this.requestOptions(source),
    };
    let feed: ParsedRssFeed;
    try {
      feed = await new Parser(parserOptions).parseURL<ParsedRssFeed>(url);
    } catch (error) {
      if (!('agent' in parserOptions.requestOptions)) throw error;
      feed = await new Parser({
        ...parserOptions,
        requestOptions: {},
      }).parseURL<ParsedRssFeed>(url);
    }
    return (feed.items || []).map((item) => {
      const articles = this.normalizeGoogleNewsItems(item['ht:news_item']);
      const firstNews = articles[0];
      return {
        title: item.title || '',
        description:
          firstNews?.snippet ||
          firstNews?.title ||
          item.contentSnippet ||
          item.title ||
          '',
        source: source.definition.id,
        heatScore: this.parseTrafficToScore(
          this.stringValue(item['ht:approx_traffic']),
        ),
        tags: [],
        articles: articles.slice(0, 3),
      };
    });
  }

  private async fetchRss(source: RssSourceConfig): Promise<TopicCandidate[]> {
    const requestOptions = this.requestOptions(source);
    let feed: ParsedRssFeed;
    try {
      feed = await new Parser({ requestOptions }).parseURL<ParsedRssFeed>(
        source.url,
      );
    } catch (error) {
      if (!('agent' in requestOptions)) throw error;
      feed = await new Parser({ requestOptions: {} }).parseURL<ParsedRssFeed>(
        source.url,
      );
    }
    return (feed.items || []).map((item) => ({
      title: item.title || '',
      description: item.contentSnippet || item.summary || item.title || '',
      source: source.definition.id,
      heatScore: 50,
      tags: [],
      articles: item.link
        ? [
            {
              title: item.title || '',
              source: source.definition.id,
              snippet: item.contentSnippet || '',
              url: item.link,
            },
          ]
        : [],
    }));
  }

  private requestOptions(source: RssSourceConfig): Record<string, unknown> {
    if (!source.direct && this.proxyEnabled && this.proxyUrl) {
      return { agent: new HttpsProxyAgent(this.proxyUrl) };
    }
    return {};
  }

  private normalizeGoogleNewsItems(value: unknown): TopicCandidate['articles'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (Array.isArray(record['ht:news_item_title'])) {
      const titles = this.stringArray(record['ht:news_item_title']);
      const snippets = this.stringArray(record['ht:news_item_snippet']);
      const urls = this.stringArray(record['ht:news_item_url']);
      const sources = this.stringArray(record['ht:news_item_source']);
      const count = Math.max(
        titles.length,
        snippets.length,
        urls.length,
        sources.length,
      );
      return Array.from({ length: count }, (_, index) => ({
        title: titles[index] || '',
        source: sources[index] || '',
        snippet: snippets[index] || titles[index] || '',
        url: urls[index] || '',
      }));
    }
    const title = this.stringValue(record['ht:news_item_title']);
    return [
      {
        title,
        source: this.stringValue(record['ht:news_item_source']),
        snippet: this.stringValue(record['ht:news_item_snippet']) || title,
        url: this.stringValue(record['ht:news_item_url']),
      },
    ];
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => this.stringValue(item))
      : [];
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private parseTrafficToScore(traffic: string): number {
    const value = Number.parseInt(traffic.replace(/[^0-9]/g, ''), 10);
    if (!value) return 50;
    if (value >= 50_000) return 98;
    if (value >= 20_000) return 95;
    if (value >= 10_000) return 90;
    if (value >= 5_000) return 85;
    if (value >= 2_000) return 80;
    if (value >= 1_000) return 75;
    if (value >= 500) return 70;
    if (value >= 200) return 65;
    if (value >= 100) return 60;
    return 50;
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
