import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { TopicSourceAdapter } from './sources/topic-source.adapter';
import {
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from './sources/topic-source.types';

/** Wikipedia On This Day 事件中的相关词条页 */
interface WikiPage {
  normalizedtitle?: string;
  extract?: string;
  description?: string;
  thumbnail?: { source?: string };
  content_urls?: {
    desktop?: { page?: string };
    mobile?: { page?: string };
  };
}

/** Wikipedia On This Day 单条事件 */
interface WikiOnThisDayEvent {
  text?: string;
  year?: number;
  pages?: WikiPage[];
}

/** normalizeAll 产出的通用选题条目 */
interface WikiTopicItem {
  title: string;
  description: string;
  source: string;
  heatScore: number;
  tags: string[];
  articles: { title: string; source: string; snippet: string; url: string }[];
  coverImage?: string;
  year?: number;
  type: string;
}

/**
 * 当年今日 / 历史上的今天 数据源服务 — 基于 Wikipedia On This Day REST API。
 *
 * 多语言版本对应不同地区（实测 ja/zh-yue 返回 404 "language not yet supported"，故不提供日本）：
 *   - CN 中国 → zh + Accept-Language: zh-cn（简体）
 *   - HK 香港 → zh + Accept-Language: zh-hk（繁体）
 *   - US 美国 → en
 *   - EU 欧洲 → en（后续可拆 de/fr）
 *
 * 关键设计：
 *   - 归一化到 trending-topics 通用条目形状 `{title, description, source, heatScore, tags, articles[]}`，
 *     额外保留 coverImage / year 两个可选字段供前端「当年今日」面板增强渲染（封面图 + 年份徽章）。
 *   - 信息最大化保留：title 带年份前缀且不截断；tags 保留前 10；articles 全部保留（snippet 用完整 extract）。
 *   - 跳过 ^\d{4}年?$ 年份页 —— 其 extract 是「20XX年是一个平年」，零信息量；优先取有缩略图的 page 做 bestPage。
 *   - Redis 缓存（TTL 86400s）—— 历史事件按日固定，当天内容不变；Wikipedia 免费，缓存纯为加速。
 *   - 不计费（Wikipedia 免费，不注入 BillingService）。
 *   - 代理：原生 fetch 不读 HTTP_PROXY，WIKIPEDIA_PROXY_ENABLED=true 时显式传 undici ProxyAgent
 *     （大陆开发需代理访问 Wikipedia，新加坡生产直连）—— 与 Twitter 的 undici 模式一致，与 RSS 的 https-proxy-agent 独立。
 *   - heatScore：Wikipedia 无原生热度，按「距今年份越近 × 相关词条越多」复合计算。
 */
@Injectable()
export class WikipediaService implements TopicSourceAdapter {
  private readonly logger = new Logger(WikipediaService.name);

  private readonly proxyEnabled: boolean;
  private readonly proxyUrl: string | undefined;
  private proxyAgent: unknown; // lazy singleton，避免每请求新建 ProxyAgent 泄漏连接池

  // 地区 → 语言/变体 映射。variant 为空表示该语言无需变体（en 不分简繁）。
  // CN/HK 共用 zh 但 variant 不同（简/繁），故缓存键按 variant 区分。
  private static readonly REGION_MAP: Record<
    string,
    { lang: string; variant: string; label: string }
  > = {
    CN: { lang: 'zh', variant: 'zh-cn', label: '中国' },
    HK: { lang: 'zh', variant: 'zh-hk', label: '香港' },
    US: { lang: 'en', variant: '', label: '美国' },
    EU: { lang: 'en', variant: '', label: '欧洲' },
  };

  private static readonly CACHE_TTL = 86400; // 1 天（历史事件按日固定）

  // Wikipedia On This Day 无 all 端点（实测 /feed/onthisday/all 与 /aggregated/.../all 均 404），
  // 需并发拉 5 个单类型再合并。type → 中文标签，归一化后写入 item.type 供前端类型徽章渲染。
  private static readonly TYPE_MAP: Record<string, string> = {
    events: '事件',
    selected: '精选',
    births: '出生',
    deaths: '逝世',
    holidays: '节日',
  };

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.proxyEnabled =
      (
        this.config.get<string>('WIKIPEDIA_PROXY_ENABLED') || ''
      ).toLowerCase() === 'true';
    this.proxyUrl =
      this.config.get<string>('HTTP_PROXY') ||
      this.config.get<string>('http_proxy') ||
      undefined;
    // Wikipedia User-Agent 政策 (https://meta.wikimedia.org/wiki/User-Agent_policy) 要求
    // UA 括号内必须包含 URL 或联系邮箱，否则会被 Varnish 直接 403（错误页 <title>Wikimedia Error</title>）。
    // 不合规 UA 例：'CMS-NG/1.0 (content creation platform)' → 403；
    // 合规 UA 例：'CMS-NG/1.0 (https://cms-ng.example.com; admin@cms-ng.example.com)'。
    // 优先读 WIKIPEDIA_USER_AGENT 环境变量（生产应配置真实联系信息），未配置时回退到内置合规 UA。
    this.userAgent =
      this.config.get<string>('WIKIPEDIA_USER_AGENT') ||
      'CMS-NG/1.0 (https://github.com/HenryLiang/cms-ng; cms-ng@example.com)';
  }

  private readonly userAgent: string;

  listDefinitions(context: TopicSourceContext): TopicSourceDefinition[] {
    void context;
    return [
      {
        id: 'this-day',
        label: '当年今日',
        category: 'history',
        icon: 'calendar',
        aggregate: false,
        parameters: [
          {
            key: 'region',
            label: '地区',
            kind: 'select',
            defaultValue: 'CN',
            options: [
              { value: 'CN', label: '中国' },
              { value: 'HK', label: '香港' },
              { value: 'US', label: '美国' },
              { value: 'EU', label: '欧洲' },
            ],
          },
          { key: 'date', label: '日期', kind: 'date' },
        ],
      },
    ];
  }

  async fetch(
    sourceId: string,
    _context: TopicSourceContext,
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage> {
    if (sourceId !== 'this-day') {
      throw new BadRequestException(`未知的 Wikipedia 数据源: ${sourceId}`);
    }
    const result = await this.fetchOnThisDay(
      String(query.params?.region || 'CN'),
      query.params?.date ? String(query.params.date) : undefined,
      query.page ?? 1,
      query.limit ?? 10,
    );
    return {
      ...result,
      status: 'available',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * 拉取「历史上的今天」事件列表。
   * @param region  CN/HK/US/EU
   * @param date    YYYY-MM-DD，默认今天
   * @param page    分页（从 1 起）
   * @param limit   分页
   */
  async fetchOnThisDay(
    region: string,
    date: string | undefined,
    page = 1,
    limit = 10,
  ): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const cfg = WikipediaService.REGION_MAP[region];
    if (!cfg) {
      throw new BadRequestException(
        `不支持的地区: ${region}（可选：CN/HK/US/EU）`,
      );
    }

    const { month, day } = this.parseDate(date);
    const cacheKey = `wiki:otd:${cfg.lang}:${cfg.variant || 'default'}:${month}-${day}`;

    let items: WikiTopicItem[] = [];
    const cached = await this.redis.get(cacheKey);
    let cacheHit = false;
    if (cached) {
      try {
        items = JSON.parse(cached) as WikiTopicItem[];
        cacheHit = true;
      } catch (err) {
        // 缓存值损坏（非 JSON）—— 当作未命中：删脏值、回源重取、重写缓存，
        // 避免 86400s TTL 内同一 key 每次请求都抛 500。
        this.logger.warn(
          `缓存值损坏，丢弃并重新拉取: key=${cacheKey} err=${(err as Error).message}`,
        );
        await this.redis.del(cacheKey);
      }
    }
    if (!cacheHit) {
      // Wikipedia 无 all 端点，并发拉 5 个单类型合并（单类型失败不阻断整体）
      const typeResults = await this.fetchAllTypes(
        cfg.lang,
        cfg.variant,
        month,
        day,
      );
      items = this.normalizeAll(typeResults);
      // 按 heatScore 倒序 —— 最新且相关词条最多的事件排前面
      items.sort((a, b) => b.heatScore - a.heatScore);
      await this.redis.set(
        cacheKey,
        JSON.stringify(items),
        WikipediaService.CACHE_TTL,
      );
    }
    return this.paginate(items, page, limit);
  }

  // ─── 内部实现 ───

  /** 解析 YYYY-MM-DD；不传则用本地今天。手动解析避免 new Date('YYYY-MM-DD') 的 UTC 时区偏移。 */
  private parseDate(date: string | undefined): { month: number; day: number } {
    if (date) {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
      if (!m) {
        throw new BadRequestException(
          `日期格式无效: ${date}（应为 YYYY-MM-DD）`,
        );
      }
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      const day = parseInt(m[3], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new BadRequestException(`日期无效: ${date}`);
      }
      // 校验真实日历日期：拒绝 2/31、4/31、非闰年 2/30 等
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day > daysInMonth) {
        throw new BadRequestException(
          `日期无效: ${date}（${year}年${month}月只有${daysInMonth}天）`,
        );
      }
      return { month, day };
    }
    const d = new Date();
    return { month: d.getMonth() + 1, day: d.getDate() };
  }

  /** 调用 Wikipedia On This Day REST API（单类型）。按需挂代理。所有失败统一转 503。 */
  private async callWikipediaApi(
    lang: string,
    variant: string,
    month: number,
    day: number,
    type: string,
  ): Promise<Record<string, WikiOnThisDayEvent[]>> {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/${type}/${month}/${day}`;
    const init: RequestInit & { dispatcher?: unknown } = {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        ...(variant ? { 'Accept-Language': variant } : {}),
      },
      signal: AbortSignal.timeout(15000),
    };
    if (this.proxyEnabled && this.proxyUrl) {
      // undici 是 alipay-sdk 的传递依赖（npm hoist），按需延迟加载避免启动时硬依赖；
      // 原生 fetch 不读 HTTP_PROXY，须显式 dispatcher。
      // ProxyAgent 缓存为 singleton，避免每请求新建泄漏连接池。
      if (!this.proxyAgent) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest CommonJS 环境下 require 才能被 jest.mock('undici') 拦截;动态 import 会触发 --experimental-vm-modules 报错
        const { ProxyAgent } = require('undici') as {
          ProxyAgent: new (url: string) => unknown;
        };
        this.proxyAgent = new ProxyAgent(this.proxyUrl);
      }
      init.dispatcher = this.proxyAgent;
    }
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ServiceUnavailableException(
          `Wikipedia API ${res.status}: ${body.slice(0, 200)}`,
        );
      }
      return (await res.json()) as Record<string, WikiOnThisDayEvent[]>;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      // 网络错误 / 代理失败 / 超时 —— 统一转 503，前端友好提示
      throw new ServiceUnavailableException(
        `Wikipedia API 不可达: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 并发拉取 5 个单类型（events/selected/births/deaths/holidays）。
   * Wikipedia 无 all 端点；单类型失败不阻断整体（某语言可能缺某类型，返回空数组跳过）。
   */
  private async fetchAllTypes(
    lang: string,
    variant: string,
    month: number,
    day: number,
  ): Promise<Array<{ type: string; items: any[] }>> {
    const types = Object.keys(WikipediaService.TYPE_MAP);
    const settled = await Promise.all(
      types.map(async (t) => {
        try {
          const raw = await this.callWikipediaApi(lang, variant, month, day, t);
          return {
            type: t,
            items: Array.isArray(raw?.[t]) ? raw[t] : [],
            ok: true,
            err: undefined as Error | undefined,
          };
        } catch (err) {
          this.logger.warn(
            `Wikipedia ${t} 拉取失败，跳过: ${(err as Error).message}`,
          );
          return { type: t, items: [], ok: false, err: err as Error };
        }
      }),
    );
    // 全部类型失败 → 整体不可用（网络/代理问题），抛 503；部分失败则跳过该类型
    if (settled.every((r) => !r.ok)) {
      throw new ServiceUnavailableException(
        `Wikipedia API 不可达（所有类型均失败）: ${settled[0].err?.message}`,
      );
    }
    return settled.map(({ type, items }) => ({ type, items }));
  }

  /**
   * 归一化 5 类型合并结果到通用条目形状（信息最大化保留，带类型标签）。
   * 每个类型条目结构：{ text, year, pages: [...] }（holidays 可能无 year）。
   *
   * 关键：跳过 ^\d{4}年?$ 年份页（zh: "2013年"、en: "2013"，其 extract 是「20XX年是一个平年」，零信息量），
   *       优先取有缩略图的 page 做 bestPage（其 extract 做 description、thumbnail 做 coverImage）。
   */
  private normalizeAll(
    typeResults: Array<{ type: string; items: WikiOnThisDayEvent[] }>,
  ): WikiTopicItem[] {
    const currentYear = new Date().getFullYear();
    const all: WikiTopicItem[] = [];
    for (const { type, items } of typeResults) {
      const typeLabel = WikipediaService.TYPE_MAP[type] || type;
      for (const ev of items) {
        const text = typeof ev.text === 'string' ? ev.text : '';
        const year = typeof ev.year === 'number' ? ev.year : 0;
        const pages = Array.isArray(ev.pages) ? ev.pages : [];

        // 跳过年份页（zh: "2013年"；en: "2013"）
        const nonYearPages = pages.filter(
          (p) =>
            p &&
            typeof p.normalizedtitle === 'string' &&
            !/^\d{4}年?$/.test(p.normalizedtitle),
        );
        // bestPage：优先有缩略图的（封面图），否则首个非年份页
        const bestPage =
          nonYearPages.find((p) => p.thumbnail?.source) || nonYearPages[0];

        // 相关词条全部保留为 articles（snippet 用完整 extract），供前端「相关词条」链接区渲染
        const articles = nonYearPages.map((p) => ({
          title: p.normalizedtitle || '',
          source: 'this-day',
          snippet: p.extract || p.description || '',
          url:
            p.content_urls?.desktop?.page || p.content_urls?.mobile?.page || '',
        }));

        all.push({
          title:
            year > 0
              ? `【${year}年】${text}`
              : year < 0
                ? `【公元前${Math.abs(year)}年】${text}`
                : text,
          description: bestPage?.extract || text,
          source: 'this-day',
          heatScore: this.computeHeatScore(year, pages.length, currentYear),
          tags: nonYearPages
            .slice(0, 10)
            .map((p) => p.normalizedtitle)
            .filter(Boolean),
          articles,
          coverImage: bestPage?.thumbnail?.source || undefined,
          year: year || undefined,
          type: typeLabel,
        });
      }
    }
    return all;
  }

  /**
   * 复合热度：Wikipedia 无原生热度指标。
   *   recency  = (year / currentYear) * 100   —— 越近分越高（2025→~99, 1000→~39）
   *   richness = min(100, pagesCount * 20)    —— 相关词条越多分越高，5 个即满分
   *   heatScore = clamp(round(recency*0.6 + richness*0.4), 10, 99)
   */
  private computeHeatScore(
    year: number,
    pagesCount: number,
    currentYear: number,
  ): number {
    if (!year || year < 1) return 10;
    const recency = Math.min(100, (year / currentYear) * 100);
    const richness = Math.min(100, pagesCount * 20);
    const score = Math.round(recency * 0.6 + richness * 0.4);
    return Math.max(10, Math.min(99, score));
  }

  private paginate(items: any[], page: number, limit: number) {
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      items: items.slice(start, end),
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit) || 1,
    };
  }
}
