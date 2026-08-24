/**
 * newsnow 数据源 adapter -- 把移植自 ourongxing/newsnow 的 30 个热榜/
 * 快讯源接入 TopicSourceCatalog(选题模块「一个新机制 = 一个 adapter」的
 * 既有约定;与 RssTopicSourceAdapter/TwitterService 同级注册)。
 *
 * 设计要点:
 * - 总开关 NEWSNOW_ENABLED(默认 true):false 时 listDefinitions 返回空,
 *   源面板不出现任何 newsnow 源,fetch 抛 BadRequest(不该被调到)。
 * - 白名单 NEWSNOW_SOURCES(逗号分隔 newsnow- 前缀 id,空 = 全量):
 *   生产环境海外机房对国内平台 API 的可达性需逐源验证,验证不过的可先裁掉。
 * - 代理 NEWSNOW_PROXY_ENABLED + HTTP_PROXY(大陆开发访问海外源用,与
 *   RSS_PROXY_ENABLED 语义一致但独立开关);默认代理域名可通过
 *   NEWSNOW_PROXY_DOMAINS 覆盖。原生 fetch 不读 HTTP_PROXY,走 undici
 *   ProxyAgent dispatcher(与 TwitterService 同法)。
 * - 每源进程内 TTL 缓存(快讯 120s / 热榜 300s / 列表 1800s),缓存命中
 *   直接切片返回,防连打触发反爬;getter 失败 fail-open 返回
 *   status:'unavailable' + warnings,绝不影响其他源与后端进程。
 * - heatScore 按榜单排名派生(第 0 条 98 分线性递减到 50),与
 *   GoogleTrendsRealtimeAdapter 的 rankToScore 同一约定。
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryCache } from '../in-memory-cache';
import type { TopicSourceAdapter } from '../topic-source.adapter';
import type {
  TopicCandidate,
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from '../topic-source.types';
import {
  configureNewsnowClient,
  DEFAULT_NEWSNOW_PROXY_DOMAINS,
} from './newsnow-http.client';
import type { NewsItem } from './newsnow.types';
import {
  findNewsnowEntry,
  NEWSNOW_SOURCE_ENTRIES,
} from './newsnow-source.registry';

/** 上限 30 条/源,与上游 newsnow API 层一致。 */
const MAX_ITEMS_PER_SOURCE = 30;

@Injectable()
export class NewsnowTopicSourceAdapter implements TopicSourceAdapter {
  private readonly logger = new Logger(NewsnowTopicSourceAdapter.name);
  private readonly enabled: boolean;
  private readonly allowedIds: Set<string> | null;
  private readonly cache = new InMemoryCache();

  constructor(private readonly config: ConfigService) {
    this.enabled =
      (this.config.get<string>('NEWSNOW_ENABLED') ?? 'true').toLowerCase() !==
      'false';
    this.allowedIds = this.parseWhitelist(
      this.config.get<string>('NEWSNOW_SOURCES'),
    );

    if (this.enabled) {
      const proxyEnabled =
        (
          this.config.get<string>('NEWSNOW_PROXY_ENABLED') || ''
        ).toLowerCase() === 'true';
      const proxyUrl =
        this.config.get<string>('HTTP_PROXY') ||
        this.config.get<string>('http_proxy') ||
        undefined;
      const proxyDomainsRaw = this.config.get<string>('NEWSNOW_PROXY_DOMAINS');
      const proxyDomains = new Set(
        (proxyDomainsRaw?.trim()
          ? proxyDomainsRaw.split(',')
          : DEFAULT_NEWSNOW_PROXY_DOMAINS
        )
          .map((domain) => domain.trim().toLowerCase())
          .filter(Boolean),
      );
      configureNewsnowClient({
        proxyEnabled,
        proxyUrl,
        proxyDomains,
        rssHubUrl: this.config.get<string>('RSS_HUB_URL'),
      });
      if (proxyEnabled && !proxyUrl) {
        this.logger.warn(
          'NEWSNOW_PROXY_ENABLED=true 但未配置 HTTP_PROXY,海外源将直连(可能失败)',
        );
      }
    }
  }

  /** 空白名单返回 null(= 不过滤);空字符串条目被忽略。 */
  private parseWhitelist(raw: string | undefined): Set<string> | null {
    const value = raw?.trim();
    if (!value) return null;
    const ids = value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }

  listDefinitions(context: TopicSourceContext): TopicSourceDefinition[] {
    void context;
    if (!this.enabled) return [];
    return this.visibleEntries().map((entry) => ({
      id: entry.id,
      label: entry.label,
      category: entry.category,
      icon: entry.icon,
      listType: entry.listType,
    }));
  }

  async fetch(
    sourceId: string,
    context: TopicSourceContext,
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage> {
    void context;
    if (!this.enabled) {
      throw new BadRequestException(
        `newsnow 数据源未启用 (NEWSNOW_ENABLED=false): ${sourceId}`,
      );
    }
    const entry = findNewsnowEntry(sourceId);
    if (!entry) {
      throw new BadRequestException(`未知的数据源: ${sourceId}`);
    }

    const cacheKey = `newsnow:${entry.id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      try {
        // 缓存携带真实抓取时刻:命中时回传原始 fetchedAt(而非响应时间),
        // 前端「X分钟前更新」标识才有意义。
        const payload = JSON.parse(cached) as {
          items: TopicCandidate[];
          fetchedAt: string;
        };
        return this.paginate(
          payload.items,
          query.page,
          query.limit,
          payload.fetchedAt,
        );
      } catch {
        this.cache.del(cacheKey); // 缓存损坏 -> 重新抓取
      }
    }

    try {
      const raw = await entry.getter();
      const items = this.mapToCandidates(raw, entry.id).slice(
        0,
        MAX_ITEMS_PER_SOURCE,
      );
      const fetchedAt = new Date().toISOString();
      if (items.length) {
        this.cache.set(
          cacheKey,
          JSON.stringify({ items, fetchedAt }),
          entry.cacheTtlSeconds,
        );
      }
      return this.paginate(items, query.page, query.limit, fetchedAt);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`newsnow 源 ${entry.label} 抓取失败: ${message}`);
      return {
        ...this.paginate([], query.page, query.limit),
        status: 'unavailable',
        warnings: [`${entry.label} 暂时不可用: ${message}`],
      };
    }
  }

  private visibleEntries() {
    return NEWSNOW_SOURCE_ENTRIES.filter(
      (entry) => !this.allowedIds || this.allowedIds.has(entry.id),
    );
  }

  /** NewsItem -> TopicCandidate:去空标题/按标题去重,heatScore 按排名派生。 */
  private mapToCandidates(
    items: NewsItem[],
    sourceId: string,
  ): TopicCandidate[] {
    const seen = new Set<string>();
    const candidates: TopicCandidate[] = [];
    for (const item of items) {
      const title = item.title?.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      const publishedAt = this.toIsoDate(item.pubDate ?? item.extra?.date);
      candidates.push({
        title,
        description: item.extra?.hover?.trim() || title,
        source: sourceId,
        heatScore: 0,
        tags: [],
        ...(publishedAt ? { publishedAt } : {}),
        articles: item.url
          ? [
              {
                title,
                source: sourceId,
                snippet: item.extra?.hover || '',
                url: item.url,
              },
            ]
          : [],
      });
    }
    for (let i = 0; i < candidates.length; i += 1) {
      candidates[i].heatScore = this.rankToScore(i, candidates.length);
    }
    return candidates;
  }

  /** NewsItem 的 pubDate/extra.date(毫秒时间戳或日期串)转 ISO;无效则省略。 */
  private toIsoDate(value: number | string | undefined): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) return undefined;
    return new Date(ms).toISOString();
  }

  /** 按排名位置派生 heatScore:第 0 条=98,末条=50,线性递减。 */
  private rankToScore(rank: number, total: number): number {
    if (total <= 1) return 98;
    return Math.round(98 - (rank / (total - 1)) * 48);
  }

  private paginate(
    items: TopicCandidate[],
    requestedPage = 1,
    requestedLimit = 10,
    fetchedAt = new Date().toISOString(),
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
      fetchedAt,
    };
  }
}
