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
import type { MediaSearchQuery, MediaSearchResult } from './search.types';

/** 单次查询超时(毫秒);超时/5xx 抛 SearchUnavailableException 由调用方降级 LIKE */
const SEARCH_TIMEOUT_MS = 3000;
/** 写操作超时(毫秒),fail-open 不阻塞媒体主流程 */
const WRITE_TIMEOUT_MS = 5000;
/** 自愈重建节流(毫秒):距上次 ensureIndex 尝试不足此时长则跳过,避免宕机期每次检索都打连接超时 */
const HEAL_RETRY_MS = 15000;
/** 宕机窗口被跳过投影的脏集合上限(防长宕机内存膨胀;超限提示走全量 reindex) */
const DIRTY_CAP = 10000;

/** 检索不可用信号:MediaService 捕获后降级 LIKE(PRD §7.4) */
export class SearchUnavailableException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchUnavailableException';
  }
}

/**
 * 媒体库 Elasticsearch 全文检索服务。
 *
 * 事件驱动投影(与 #148 事件总线哲学一致,避免 Media/Ai Module 双向依赖):
 * 订阅 media.asset.{created,updated,deleted},回表 DB 构建/删除 ES 文档。
 * 全部写 fail-open(仅 warn,绝不阻塞媒体主流程);检索超时/失败抛
 * SearchUnavailableException,由 MediaService 捕获降级 LIKE(PRD §7.4)。
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
  /** 宕机窗口被跳过投影的资产 id(自愈后补投,PRD §7.1 最终一致) */
  private readonly dirtyIds = new Set<string>();
  /** 防并发补投 */
  private draining = false;
  /** 脏集合超上限已告警(只告一次) */
  private dirtyCapWarned = false;
  private readonly indexName: string;
  private readonly node: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.indexName =
      this.config.get<string>('ELASTICSEARCH_INDEX_MEDIA') || 'media_assets';
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
    // 连接失败仅 warn 进入降级态(不 fail-fast),由 ensureReady 延迟自愈
    if (await this.ensureReady()) {
      this.logger.log(
        `Elasticsearch 已连接 (${redactConnectionString(this.node)}),索引 ${this.indexName} 就绪`,
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
      index: this.indexName,
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
      .delete({ index: this.indexName, id: assetId, refresh: false })
      .catch((err: { meta?: { statusCode?: number } }) => {
        if (err?.meta?.statusCode === 404) return; // 文档不存在,幂等
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
          index: this.indexName,
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
      await this.ensureIndex();
      this.indexReady = true;
      this.onHealed(); // 恢复:补投宕机窗口被跳过的投影
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

  /** 按 PRD §4.2 mapping 创建索引(存在则跳过,mapping 演进走 reindex 脚本) */
  private async ensureIndex(): Promise<void> {
    const exists = await this.client!.indices.exists({
      index: this.indexName,
    });
    if (exists) return;
    await this.client!.indices.create({
      index: this.indexName,
      settings: { ...MEDIA_INDEX_SETTINGS },
      mappings: MEDIA_INDEX_MAPPINGS,
    });
  }

  /** 恢复(false→true):异步补投脏投影,fail-open 不阻塞当前请求 */
  private onHealed(): void {
    void this.drainDirty().catch((err) =>
      this.logger.warn(`ES 脏投影补投失败: ${(err as Error)?.message ?? err}`),
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

  /** ES 返回 index_not_found(索引被外部删除):由调用方复位 indexReady 触发重建 */
  private isIndexMissing(err: unknown): boolean {
    return (
      (err as { meta?: { body?: { error?: { type?: string } } } })?.meta?.body
        ?.error?.type === 'index_not_found_exception'
    );
  }
}
