import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Client } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import { PrismaService } from '../prisma/prisma.service';
import { redactConnectionString } from '../common/redact.utils';
import {
  MEDIA_INDEX_MAPPINGS,
  MEDIA_INDEX_SETTINGS,
  buildMediaSearchDoc,
} from './media-index.mapping';
import {
  ARTICLE_INDEX_MAPPINGS,
  ARTICLE_INDEX_SETTINGS,
  buildArticleSearchDoc,
  getArticleSearchVersion,
} from './article-index.mapping';
import type {
  ArticleSearchQuery,
  ArticleSearchResult,
  MediaSearchQuery,
  MediaSearchResult,
} from './search.types';
import { ArticleStatus, UserRole } from '@cms-ng/shared';

/** 单次查询超时(毫秒);超时/5xx 抛 SearchUnavailableException 由调用方降级 LIKE */
const SEARCH_TIMEOUT_MS = 3000;
/** 写操作超时(毫秒),fail-open 不阻塞媒体主流程 */
const WRITE_TIMEOUT_MS = 5000;
/** 自愈重建节流(毫秒):距上次 ensureIndex 尝试不足此时长则跳过,避免宕机期每次检索都打连接超时 */
const HEAL_RETRY_MS = 15000;
/** 宕机窗口被跳过投影的脏集合上限(防长宕机内存膨胀;超限提示走全量 reindex) */
const DIRTY_CAP = 10000;

/** 检索不可用信号：业务服务捕获后降级 MySQL LIKE。 */
export class SearchUnavailableException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchUnavailableException';
  }
}

/**
 * 媒体库与稿件 Elasticsearch 全文检索服务。
 *
 * 事件驱动投影(与 #148 事件总线哲学一致,避免 Media/Ai Module 双向依赖):
 * 订阅 media.asset.* / article.*，回表 DB 构建或删除 ES 文档。
 * 全部写 fail-open(仅 warn,绝不阻塞媒体主流程);检索超时/失败抛
 * SearchUnavailableException，由业务服务捕获并降级 LIKE。
 *
 * IK 中文分词(决策 D7);索引无 alias 蓝绿,mapping 演进走 reindex 脚本(PRD §4.2)。
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: Client | null = null;
  /** 配置开关(ELASTICSEARCH_ENABLED=true) */
  private enabled = false;
  /** 索引已就绪(ensureIndex 成功);false 时检索/写入均降级,延迟恢复自愈 */
  private indexReady = false;
  /** 防并发 ensureIndex */
  private ensuring = false;
  /** 上次 ensureIndex 尝试时间戳(节流,见 HEAL_RETRY_MS);0 表示尚未尝试 */
  private lastHealAttempt = 0;
  /** 稿件索引独立健康状态，避免稿件故障连带媒体检索降级。 */
  private articleIndexReady = false;
  private articleEnsuring = false;
  private articleLastHealAttempt = 0;
  /** 宕机窗口被跳过投影的资产 id(自愈后补投,PRD §7.1 最终一致) */
  private readonly dirtyIds = new Set<string>();
  /** 防并发补投 */
  private draining = false;
  /** 脏集合超上限已告警(只告一次) */
  private dirtyCapWarned = false;
  /** 宕机窗口被跳过投影的稿件 id。 */
  private readonly dirtyArticleIds = new Set<string>();
  private articleDraining = false;
  private articleDirtyCapWarned = false;
  /** 同稿件投影串行执行，防止旧请求后完成并覆盖新标题。 */
  private readonly articleProjectionQueues = new Map<string, Promise<void>>();
  private readonly mediaIndexName: string;
  private readonly articleIndexName: string;
  private readonly node: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mediaIndexName =
      this.config.get<string>('ELASTICSEARCH_INDEX_MEDIA') || 'media_assets';
    this.articleIndexName =
      this.config.get<string>('ELASTICSEARCH_INDEX_ARTICLES') || 'articles';
    this.node =
      this.config.get<string>('ELASTICSEARCH_NODE') || 'http://localhost:9200';
  }

  async onModuleInit() {
    const enabled =
      (this.config.get<string>('ELASTICSEARCH_ENABLED') || '').toLowerCase() ===
      'true';
    if (!enabled) {
      this.logger.log(
        'Elasticsearch 全文检索已关闭 (ELASTICSEARCH_ENABLED!=true),检索走 LIKE',
      );
      return;
    }
    const username = this.config.get<string>('ELASTICSEARCH_USERNAME');
    const password = this.config.get<string>('ELASTICSEARCH_PASSWORD');
    this.client = new Client({
      node: this.node,
      auth: username && password ? { username, password } : undefined,
      requestTimeout: WRITE_TIMEOUT_MS,
    });
    this.enabled = true;
    // 两个索引独立初始化/自愈；任一失败都不阻断应用或拖累另一索引。
    const [mediaReady, articleReady] = await Promise.all([
      this.ensureReady(),
      this.ensureArticleReady(),
    ]);
    if (mediaReady || articleReady) {
      const readyIndexes = [
        mediaReady ? this.mediaIndexName : null,
        articleReady ? this.articleIndexName : null,
      ].filter(Boolean);
      this.logger.log(
        `Elasticsearch 已连接 (${redactConnectionString(this.node)}),索引 ${readyIndexes.join('/')} 就绪`,
      );
    }
  }

  /** 配置层面是否启用(ELASTICSEARCH_ENABLED=true 且 client 已建);检索入口据此决定是否尝试 ES */
  isConfigured(): boolean {
    return this.enabled && this.client !== null;
  }

  /** 检索/写当前是否可用(配置开启 + 索引就绪) */
  isEnabled(): boolean {
    return this.enabled && this.indexReady;
  }

  isArticleEnabled(): boolean {
    return this.enabled && this.articleIndexReady;
  }

  // ===== 事件订阅:DB -> ES 投影 =====
  @OnEvent('media.asset.created')
  @OnEvent('media.asset.updated')
  handleAssetUpsert(payload: { assetId: string }): void {
    void this.indexAsset(payload.assetId).catch((err) =>
      this.logger.warn(
        `ES 索引失败 ${payload.assetId}: ${(err as Error)?.message ?? err}`,
      ),
    );
  }

  @OnEvent('media.asset.deleted')
  handleAssetDeleted(payload: { assetId: string }): void {
    void this.deleteAsset(payload.assetId).catch((err) =>
      this.logger.warn(
        `ES 删除失败 ${payload.assetId}: ${(err as Error)?.message ?? err}`,
      ),
    );
  }

  @OnEvent('article.created')
  @OnEvent('article.updated')
  handleArticleUpsert(payload: { articleId: string }): void {
    this.enqueueArticleProjection(
      payload.articleId,
      () => this.indexArticle(payload.articleId),
      '索引',
    );
  }

  @OnEvent('article.deleted')
  handleArticleDeleted(payload: { articleId: string }): void {
    this.enqueueArticleProjection(
      payload.articleId,
      () => this.deleteArticle(payload.articleId),
      '删除',
    );
  }

  /** 索引单个资产(回表取最新 DB 状态,fail-open) */
  async indexAsset(assetId: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    if (!(await this.ensureReady())) {
      this.noteDirty(assetId); // 宕机窗口投影丢失 -> 记脏,自愈后 drainDirty 补投
      return; // 降级:跳过写,避免误建无 IK mapping 的索引
    }
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) return;
    // 删除竞态防护:软删图从 ES 删除而非索引(回表强制 status,双保险,PRD §7.1)
    if (asset.status !== 'ACTIVE') {
      await this.deleteAsset(assetId);
      return;
    }
    await this.client.index({
      index: this.mediaIndexName,
      id: assetId,
      document: buildMediaSearchDoc(asset),
      refresh: false,
    });
  }

  /** 从 ES 删除单个资产(404 不算错误,fail-open) */
  async deleteAsset(assetId: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    if (!(await this.ensureReady())) {
      this.noteDirty(assetId); // 宕机窗口投影丢失 -> 记脏,自愈后 drainDirty 补投
      return;
    }
    await this.client
      .delete({ index: this.mediaIndexName, id: assetId, refresh: false })
      .catch((err: { meta?: { statusCode?: number } }) => {
        if (err?.meta?.statusCode === 404) return; // 文档不存在,幂等
        throw err;
      });
  }

  /** 回表读取最新稿件状态，构建标题/正文及权限字段的 ES 投影。 */
  async indexArticle(articleId: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    if (!(await this.ensureArticleReady())) {
      this.noteDirtyArticle(articleId);
      return;
    }
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      await this.deleteArticle(articleId);
      return;
    }
    await this.client.index({
      index: this.articleIndexName,
      id: articleId,
      document: buildArticleSearchDoc(article),
      version: getArticleSearchVersion(article),
      version_type: 'external_gte',
      refresh: false,
    });
  }

  /** 删除稿件检索投影；404 视为幂等成功。 */
  async deleteArticle(articleId: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    if (!(await this.ensureArticleReady())) {
      this.noteDirtyArticle(articleId);
      return;
    }
    await this.client
      .delete({
        index: this.articleIndexName,
        id: articleId,
        refresh: false,
      })
      .catch((err: { meta?: { statusCode?: number } }) => {
        if (err?.meta?.statusCode === 404) return;
        throw err;
      });
  }

  /**
   * 全文检索:返回匹配 id(本页)+ ES 侧总数;MediaService 回表取完整 VO。
   * 超时/失败抛 SearchUnavailableException 触发 LIKE 降级。
   */
  async searchMedia(params: MediaSearchQuery): Promise<MediaSearchResult> {
    if (!this.enabled || !this.client) {
      throw new SearchUnavailableException('Elasticsearch not enabled');
    }
    if (!(await this.ensureReady())) {
      throw new SearchUnavailableException('Elasticsearch degraded');
    }

    const must: estypes.QueryDslQueryContainer[] = [];
    const filter: estypes.QueryDslQueryContainer[] = [
      { term: { ownerId: params.ownerId } },
      { term: { status: params.status } },
    ];
    if (params.source) filter.push({ term: { source: params.source } });
    if (params.mimePrefix)
      filter.push({ prefix: { mimeType: `${params.mimePrefix}/` } });
    if (params.search) {
      must.push({
        multi_match: {
          query: params.search,
          // fileName/tags/aiTags 加权;tags/aiTags 是检索主目标(打标交付价值)
          fields: [
            'fileName^2',
            'title',
            'altText',
            'description',
            'prompt',
            'tags^2',
            'aiTags^2',
          ],
          type: 'best_fields',
        },
      });
    }
    if (params.tag) {
      // tag 精确过滤:tags.keyword 与 aiTags.keyword OR(与 LIKE 带引号子串语义对齐)
      must.push({
        bool: {
          should: [
            { term: { 'tags.keyword': params.tag } },
            { term: { 'aiTags.keyword': params.tag } },
          ],
          minimum_should_match: 1,
        },
      });
    }

    const from = (params.page - 1) * params.pageSize;
    const doSearch = () =>
      this.client!.search(
        {
          index: this.mediaIndexName,
          from,
          size: params.pageSize,
          track_total_hits: true,
          query: { bool: { must, filter } },
          sort: [
            { createdAt: { order: 'desc' } },
            // createdAt 并列(批量同毫秒)时按 id 稳定分页,避免跨页抖动
            { id: { order: 'asc' } },
          ],
          _source: false, // 只要 id,回表取完整数据(MySQL 事实源)
        },
        // v8 客户端:requestTimeout 是传输层选项(第二参),非请求体字段
        { requestTimeout: SEARCH_TIMEOUT_MS },
      );

    let resp: Awaited<ReturnType<typeof doSearch>>;
    try {
      resp = await doSearch();
    } catch (err) {
      // 索引被外部删除(reindex --recreate 窗口/误删):复位 indexReady,下轮 ensureReady 重建
      if (this.isIndexMissing(err)) this.indexReady = false;
      // 单次重试仅针对瞬时故障(超时/连接/5xx);4xx(如深翻页越界)不重试直抛
      if (this.isRetryable(err)) {
        try {
          resp = await doSearch();
        } catch (err2) {
          throw new SearchUnavailableException(
            (err2 as Error)?.message ?? String(err2),
          );
        }
      } else {
        throw new SearchUnavailableException(
          (err as Error)?.message ?? String(err),
        );
      }
    }

    const hits = resp.hits;
    const total =
      typeof hits.total === 'object' && hits.total !== null
        ? (hits.total as { value: number }).value
        : ((hits.total as number) ?? 0);
    const ids = hits.hits
      .map((h) => h._id)
      .filter((id): id is string => typeof id === 'string');
    return { ids, total };
  }

  /**
   * 稿件全文检索。权限与选题条件在 ES 分页之前执行，避免先分页再回表过滤导致
   * 空页和 total 错误；调用方仍会回表复核权限并读取完整稿件。
   */
  async searchArticles(
    params: ArticleSearchQuery,
  ): Promise<ArticleSearchResult> {
    if (!this.enabled || !this.client) {
      throw new SearchUnavailableException('Elasticsearch not enabled');
    }
    if (!(await this.ensureArticleReady())) {
      throw new SearchUnavailableException('Elasticsearch degraded');
    }

    const must: estypes.QueryDslQueryContainer[] = [
      {
        multi_match: {
          query: params.search,
          fields: ['title^3', 'content'],
          type: 'best_fields',
        },
      },
    ];
    const filter: estypes.QueryDslQueryContainer[] = [];
    if (params.storyId) filter.push({ term: { storyId: params.storyId } });

    if ((params.role as UserRole) === UserRole.REPORTER) {
      filter.push({ term: { authorId: params.userId } });
    } else if ((params.role as UserRole) === UserRole.EDITOR) {
      filter.push({
        bool: {
          should: [
            { term: { authorId: params.userId } },
            { term: { editorId: params.userId } },
            {
              terms: {
                status: [
                  ArticleStatus.PENDING_REVIEW,
                  ArticleStatus.IN_REVIEW,
                  ArticleStatus.REVISION,
                ],
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    const doSearch = () =>
      this.client!.search(
        {
          index: this.articleIndexName,
          from: (params.page - 1) * params.pageSize,
          size: params.pageSize,
          track_total_hits: true,
          query: { bool: { must, filter } },
          sort: [
            { _score: { order: 'desc' } },
            { updatedAt: { order: 'desc' } },
            { id: { order: 'asc' } },
          ],
          _source: false,
        },
        { requestTimeout: SEARCH_TIMEOUT_MS },
      );

    let resp: Awaited<ReturnType<typeof doSearch>>;
    try {
      resp = await doSearch();
    } catch (err) {
      if (this.isIndexMissing(err)) this.articleIndexReady = false;
      if (this.isRetryable(err)) {
        try {
          resp = await doSearch();
        } catch (retryError) {
          throw new SearchUnavailableException(
            (retryError as Error)?.message ?? String(retryError),
          );
        }
      } else {
        throw new SearchUnavailableException(
          (err as Error)?.message ?? String(err),
        );
      }
    }

    const total =
      typeof resp.hits.total === 'object' && resp.hits.total !== null
        ? (resp.hits.total as { value: number }).value
        : ((resp.hits.total as number) ?? 0);
    const ids = resp.hits.hits
      .map((hit) => hit._id)
      .filter((id): id is string => typeof id === 'string');
    return { ids, total };
  }

  // ===== 内部 =====

  /** 瞬时故障判定:超时/连接错误/5xx 可重试;4xx(深翻页越界等)不可重试 */
  private isRetryable(err: unknown): boolean {
    const status = (err as { meta?: { statusCode?: number } })?.meta
      ?.statusCode;
    if (status === undefined) return true; // 连接/超时类无 statusCode
    return status >= 500;
  }

  /**
   * 懒式 ensureIndex:未就绪时重试一次,成功则 indexReady=true(自愈)。
   * 节流(HEAL_RETRY_MS):宕机期每次检索/写都打 ensureIndex 会把连接超时串进每次
   * 请求,距上次尝试不足 HEAL_RETRY_MS 直接返回 false。恢复(false→true)触发脏集合补投。
   */
  private async ensureReady(): Promise<boolean> {
    if (this.indexReady) return true;
    if (!this.enabled || !this.client) return false;
    if (this.ensuring) return false;
    // 节流:lastHealAttempt=0 表示尚未尝试(测试可置 0 强制一次自愈)
    const now = Date.now();
    if (this.lastHealAttempt && now - this.lastHealAttempt < HEAL_RETRY_MS) {
      return false;
    }
    this.lastHealAttempt = now;
    this.ensuring = true;
    try {
      await this.ensureNamedIndex(
        this.mediaIndexName,
        MEDIA_INDEX_SETTINGS,
        MEDIA_INDEX_MAPPINGS,
      );
      this.indexReady = true;
      this.onMediaHealed();
      return true;
    } catch (err) {
      this.logger.warn(
        `Elasticsearch 不可用(${redactConnectionString(this.node)}),检索/写入降级 LIKE: ${(err as Error)?.message ?? err}`,
      );
      return false;
    } finally {
      this.ensuring = false;
    }
  }

  /** 稿件索引使用独立 readiness/节流，故障不会连带媒体索引。 */
  private async ensureArticleReady(): Promise<boolean> {
    if (this.articleIndexReady) return true;
    if (!this.enabled || !this.client) return false;
    if (this.articleEnsuring) return false;
    const now = Date.now();
    if (
      this.articleLastHealAttempt &&
      now - this.articleLastHealAttempt < HEAL_RETRY_MS
    ) {
      return false;
    }
    this.articleLastHealAttempt = now;
    this.articleEnsuring = true;
    try {
      await this.ensureNamedIndex(
        this.articleIndexName,
        ARTICLE_INDEX_SETTINGS,
        ARTICLE_INDEX_MAPPINGS,
      );
      this.articleIndexReady = true;
      this.onArticleHealed();
      return true;
    } catch (err) {
      this.logger.warn(
        `Elasticsearch 稿件索引不可用(${redactConnectionString(this.node)}),稿件检索降级 LIKE: ${(err as Error)?.message ?? err}`,
      );
      return false;
    } finally {
      this.articleEnsuring = false;
    }
  }

  private async ensureNamedIndex(
    index: string,
    settings: typeof MEDIA_INDEX_SETTINGS | typeof ARTICLE_INDEX_SETTINGS,
    mappings: typeof MEDIA_INDEX_MAPPINGS | typeof ARTICLE_INDEX_MAPPINGS,
  ): Promise<void> {
    const exists = await this.client!.indices.exists({ index });
    if (exists) return;
    await this.client!.indices.create({
      index,
      settings: { ...settings },
      mappings,
    });
  }

  /** 恢复(false→true):异步补投脏投影,fail-open 不阻塞当前请求 */
  private onMediaHealed(): void {
    void this.drainDirty().catch((err) =>
      this.logger.warn(`ES 脏投影补投失败: ${(err as Error)?.message ?? err}`),
    );
  }

  private onArticleHealed(): void {
    void this.drainDirtyArticles().catch((err) =>
      this.logger.warn(
        `ES 稿件脏投影补投失败: ${(err as Error)?.message ?? err}`,
      ),
    );
  }

  /**
   * 逐条回表重建脏投影(indexAsset 路由 ACTIVE→index / 非 ACTIVE→delete)。
   * 单条失败重入脏集合待下轮自愈再补,不中断其余;draining 防并发重入。
   */
  private async drainDirty(): Promise<void> {
    if (this.draining || this.dirtyIds.size === 0) return;
    this.draining = true;
    try {
      const pending = [...this.dirtyIds];
      this.dirtyIds.clear();
      for (const id of pending) {
        try {
          await this.indexAsset(id);
        } catch (err) {
          this.noteDirty(id); // 重入,下轮再补
          if (this.isRetryable(err)) this.indexReady = false;
          this.logger.warn(
            `ES 脏投影补投失败 ${id}: ${(err as Error)?.message ?? err}`,
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** 记录被跳过的投影(宕机窗口);超 DIRTY_CAP 一次性告警,提示恢复后跑全量 reindex */
  private noteDirty(assetId: string): void {
    if (this.dirtyIds.size >= DIRTY_CAP) {
      if (!this.dirtyCapWarned) {
        this.dirtyCapWarned = true;
        this.logger.warn(
          `ES 脏投影已达 ${DIRTY_CAP} 上限,后续跳过项不再记录;恢复后请跑 reindex 脚本全量对齐`,
        );
      }
      return;
    }
    this.dirtyIds.add(assetId);
  }

  private async drainDirtyArticles(): Promise<void> {
    if (this.articleDraining || this.dirtyArticleIds.size === 0) return;
    this.articleDraining = true;
    try {
      const pending = [...this.dirtyArticleIds];
      this.dirtyArticleIds.clear();
      for (const id of pending) {
        try {
          await this.indexArticle(id);
        } catch (err) {
          this.noteDirtyArticle(id);
          if (this.isRetryable(err)) this.articleIndexReady = false;
          this.logger.warn(
            `ES 稿件脏投影补投失败 ${id}: ${(err as Error)?.message ?? err}`,
          );
        }
      }
    } finally {
      this.articleDraining = false;
    }
  }

  private enqueueArticleProjection(
    articleId: string,
    operation: () => Promise<void>,
    action: string,
  ): void {
    const previous =
      this.articleProjectionQueues.get(articleId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.articleProjectionQueues.set(articleId, current);
    void current
      .catch((err) => {
        this.noteDirtyArticle(articleId);
        if (this.isRetryable(err)) this.articleIndexReady = false;
        this.logger.warn(
          `ES 稿件${action}失败 ${articleId}: ${(err as Error)?.message ?? err}`,
        );
      })
      .finally(() => {
        if (this.articleProjectionQueues.get(articleId) === current) {
          this.articleProjectionQueues.delete(articleId);
        }
      });
  }

  private noteDirtyArticle(articleId: string): void {
    if (this.dirtyArticleIds.size >= DIRTY_CAP) {
      if (!this.articleDirtyCapWarned) {
        this.articleDirtyCapWarned = true;
        this.logger.warn(
          `ES 稿件脏投影已达 ${DIRTY_CAP} 上限;恢复后请跑稿件 reindex 脚本全量对齐`,
        );
      }
      return;
    }
    this.dirtyArticleIds.add(articleId);
  }

  /** ES 返回 index_not_found(索引被外部删除):由调用方复位 indexReady 触发重建 */
  private isIndexMissing(err: unknown): boolean {
    return (
      (err as { meta?: { body?: { error?: { type?: string } } } })?.meta?.body
        ?.error?.type === 'index_not_found_exception'
    );
  }
}
