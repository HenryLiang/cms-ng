import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../../billing/billing.service';
import { AIOperationLogger } from '../../common/ai-operation-logger';
import {
  CHAT_VISION_PROVIDER,
  type ChatCompletionProvider,
} from '../../ai/providers';
import { AgentType } from '@prisma/client';
import {
  MediaTagStatus,
  MediaStatus,
  MediaSource,
  TransactionType,
  BillingCategory,
} from '@cms-ng/shared';
import {
  buildTaggingMessagesV2,
  parseTaggingResult,
  normalizeTags,
  normalizeAltText,
  normalizeTitle,
} from './tagging-prompt';

/** 单次打标的并发上限(进程内 worker,#148 哲学:不引队列中间件) */
const DEFAULT_CONCURRENCY = 2;
/** 每用户每日打标配额(billing 无关的最后防线,可 env 覆盖) */
const DEFAULT_DAILY_QUOTA = 200;
/** retag 单资产冷却(毫秒) */
const RETAG_COOLDOWN_MS = 10 * 60 * 1000;
/** cron 兜底重扫的 PENDING/TAGGING 超时阈值(毫秒) */
const STALE_MS = 10 * 60 * 1000;
/** 重试上限 */
const MAX_RETRY = 3;
/** 退避基数:cron 第 n 次重试需距上次 updatedAt >= BASE * 2^(n-1) */
const RETRY_BACKOFF_MS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];
const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

function buildAiFileName(
  originalFileName: string,
  mimeType: string,
  title: string,
  now = new Date(),
): string {
  const originalExtension = originalFileName.match(/\.[A-Za-z0-9]{1,10}$/)?.[0];
  const extension =
    originalExtension ??
    ({
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    }[mimeType] ||
      '');
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
  const timestamp = `${dateParts.year}${dateParts.month}${dateParts.day}${dateParts.hour}${dateParts.minute}${dateParts.second}`;
  return `${timestamp}_${title}${extension}`;
}

/** 用于审计 prompt 的图片引用(绝不承载 base64 字节,见 PRD §5.3) */
function imageRefForAudit(url: string): string {
  return url.startsWith('data:') ? `[base64 image, ${url.length} chars]` : url;
}

/**
 * 媒体库图片 AI 自动打标服务。
 *
 * 与文本 AI 链路完全隔离:注入独立的 CHAT_VISION_PROVIDER(未配置时为 null,
 * 打标功能整体关闭降级)。异步、进程内、DB 状态机驱动,不依赖队列中间件。
 */
@Injectable()
export class MediaTaggingService implements OnModuleInit {
  private readonly logger = new Logger(MediaTaggingService.name);
  private enabled = false;
  private readonly concurrency: number;
  private readonly dailyQuota: number;
  private readonly imageMode: 'url' | 'base64';

  /** 内存并发信号量 + 去重 Set(单实例部署;进程崩溃由 cron 兜底) */
  private running = 0;
  private readonly inFlight = new Set<string>();
  private readonly queue: string[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly aiLog: AIOperationLogger,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    @Inject(CHAT_VISION_PROVIDER)
    private readonly visionProvider: ChatCompletionProvider | null,
  ) {
    this.concurrency = this.numConfig(
      'MEDIA_TAGGING_CONCURRENCY',
      DEFAULT_CONCURRENCY,
    );
    this.dailyQuota = this.numConfig(
      'MEDIA_TAGGING_DAILY_QUOTA',
      DEFAULT_DAILY_QUOTA,
    );
    this.imageMode =
      (this.config.get<string>('AI_VISION_IMAGE_MODE') || 'url') === 'base64'
        ? 'base64'
        : 'url';
  }

  onModuleInit() {
    const enabled =
      (this.config.get<string>('MEDIA_TAGGING_ENABLED') || '').toLowerCase() ===
      'true';
    if (!enabled) {
      this.logger.log('媒体自动打标已关闭 (MEDIA_TAGGING_ENABLED!=true)');
      this.enabled = false;
      return;
    }
    if (!this.visionProvider) {
      this.logger.warn(
        '媒体自动打标已启用但视觉 provider 未配置或不受支持 ' +
          '(需显式设置 AI_VISION_PROVIDER=gemini|kimi|openai + AI_VISION_MODEL)。' +
          '打标功能降级关闭,文本 AI 链路不受影响。',
      );
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.logger.log(
      `媒体自动打标已启用 (vision=${this.visionProvider.providerName}/${this.visionProvider.model}, ` +
        `并发=${this.concurrency}, imageMode=${this.imageMode})`,
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 入队(由 media.asset.created 事件触发,或上传/AI 生图路径直接调用)。
   * 开关关闭时空操作;内存 Set 去重防同资产重复入队。
   */
  enqueue(assetId: string): void {
    if (!this.enabled || !this.visionProvider) return;
    if (this.inFlight.has(assetId)) return;
    this.queue.push(assetId);
    this.pump();
  }

  /** 事件监听:媒体资产创建(解耦 ai->media 循环依赖) */
  @OnEvent('media.asset.created')
  handleAssetCreatedEvent(payload: { assetId: string }): void {
    this.enqueue(payload.assetId);
  }

  // ===== 手动重打标 =====
  async retag(assetId: string, userId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (
      !asset ||
      asset.ownerId !== userId ||
      (asset.status as MediaStatus) === MediaStatus.DELETED
    ) {
      throw new BadRequestException('Media asset not found');
    }
    if (!this.enabled) {
      throw new ServiceUnavailableException('媒体自动打标功能未启用');
    }
    // 活跃 TAGGING 拒绝。inFlight 中的绝不重置(防并发孪生致双重计费,M2);
    // 僵尸 TAGGING(超 STALE_MS 且不在 inFlight)允许强制重打。
    if ((asset.tagStatus as MediaTagStatus) === MediaTagStatus.TAGGING) {
      if (this.inFlight.has(assetId)) {
        throw new ConflictException('TAGGING_IN_PROGRESS');
      }
      if (
        asset.updatedAt &&
        Date.now() - asset.updatedAt.getTime() < STALE_MS
      ) {
        throw new ConflictException('TAGGING_IN_PROGRESS');
      }
    }
    // 单资产冷却:基于最近活动而非仅 taggedAt。
    // 从未成功打标的 FAILED 资产 taggedAt 恒为 null,改用 taggedAt ?? updatedAt
    // 使失败资产也受冷却约束,防每 ~60s 反复 retag 白嫖 vision 调用(M4)。
    const lastActivity = asset.taggedAt ?? asset.updatedAt;
    if (
      lastActivity &&
      Date.now() - lastActivity.getTime() < RETAG_COOLDOWN_MS
    ) {
      throw new HttpException(
        'RETAG_TOO_FREQUENT',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // 每日配额(billing 无关)
    await this.assertDailyQuota(userId);

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        tagStatus: MediaTagStatus.PENDING,
        tagRetryCount: 0,
        tagError: null,
      },
    });
    this.enqueue(assetId);
  }

  // ===== cron 兜底重扫(由 scheduler 调用)=====
  async sweepStale(): Promise<void> {
    if (!this.enabled) return;
    const now = Date.now();
    const staleThreshold = new Date(now - STALE_MS);

    // TAGGING 僵尸 -> FAILED(交由重试逻辑)
    // 排除本进程 inFlight 中的资产:活着的 worker 只是慢,重置会制造并发孪生
    // 致双重 vision 调用 + 双重计费(M2)。进程崩溃时 inFlight 已随进程消失,正常重置。
    const zombies = await this.prisma.mediaAsset.findMany({
      where: {
        tagStatus: MediaTagStatus.TAGGING,
        updatedAt: { lt: staleThreshold },
        ...(this.inFlight.size ? { id: { notIn: [...this.inFlight] } } : {}),
      },
      select: { id: true },
      take: 200,
    });
    if (zombies.length) {
      await this.prisma.mediaAsset.updateMany({
        where: { id: { in: zombies.map((z) => z.id) } },
        data: {
          tagStatus: MediaTagStatus.FAILED,
          tagError: 'TAGGING_TIMEOUT_ZOMBIE',
          // 僵尸重置也自增 retryCount:挂死/崩溃的 processOne 永远到不了 catch,
          // 不自增则 MAX_RETRY 永不可达,陷入无限重试(M1)
          tagRetryCount: { increment: 1 },
        },
      });
      this.logger.warn(`重置 ${zombies.length} 个 TAGGING 僵尸为 FAILED`);
    }

    // PENDING 超 10min(进程崩溃/入队丢失)-> 重新入队
    const stalePending = await this.prisma.mediaAsset.findMany({
      where: {
        tagStatus: MediaTagStatus.PENDING,
        updatedAt: { lt: staleThreshold },
      },
      select: { id: true },
      take: 200,
    });
    for (const a of stalePending) this.enqueue(a.id);

    // FAILED 可重试(退避 + 上限,余额不足除外)
    // tagError 为 null 的 FAILED 也纳入重试:SQL 三值逻辑下 `not: 'X'` 排除 NULL 行,
    // 不显式 OR null 则任何未来写入 FAILED 而 tagError 留 null 的资产会被静默跳过、永不自愈
    const failed = await this.prisma.mediaAsset.findMany({
      where: {
        tagStatus: MediaTagStatus.FAILED,
        tagRetryCount: { lt: MAX_RETRY },
        OR: [{ tagError: null }, { tagError: { not: 'INSUFFICIENT_BALANCE' } }],
      },
      select: { id: true, tagRetryCount: true, updatedAt: true },
      take: 200,
    });
    for (const a of failed) {
      const backoff = RETRY_BACKOFF_MS[a.tagRetryCount] ?? RETRY_BACKOFF_MS[0];
      if (a.updatedAt && now - a.updatedAt.getTime() < backoff) continue;
      await this.prisma.mediaAsset.update({
        where: { id: a.id },
        data: { tagStatus: MediaTagStatus.PENDING },
      });
      this.enqueue(a.id);
    }
  }

  // ===== 内部:并发泵(fire-and-forget,无需 await)=====
  private pump(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const assetId = this.queue.shift()!;
      if (this.inFlight.has(assetId)) continue;
      this.inFlight.add(assetId);
      this.running++;
      void this.processOne(assetId)
        .catch((err) =>
          this.logger.error(
            `打标异常 ${assetId}: ${(err as Error)?.message ?? err}`,
          ),
        )
        .finally(() => {
          this.inFlight.delete(assetId);
          this.running--;
          this.pump();
        });
    }
  }

  // ===== 内部:单次打标 =====
  private async processOne(assetId: string): Promise<void> {
    // CAS claim:仅当 PENDING 时置 TAGGING(count=0 说明已被别处处理,放弃)
    const claimed = await this.prisma.mediaAsset.updateMany({
      where: { id: assetId, tagStatus: MediaTagStatus.PENDING },
      data: { tagStatus: MediaTagStatus.TAGGING },
    });
    if (claimed.count === 0) return;

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) return;

    // 每日配额(权威闸,覆盖所有入口:上传/AI 生图/retag/cron 重试)。
    // claim 后本资产已 TAGGING 被计入;配额满则回退 PENDING 延后(不计失败、不增
    // retryCount),次日配额恢复后由 cron 重试。这是 billing 无关的最后防线(M3)。
    try {
      await this.assertDailyQuota(asset.ownerId);
    } catch {
      await this.prisma.mediaAsset
        .updateMany({
          where: { id: assetId, tagStatus: MediaTagStatus.TAGGING },
          data: { tagStatus: MediaTagStatus.PENDING },
        })
        .catch(() => {});
      this.logger.warn(`每日打标配额已满,延后: ${assetId}`);
      return;
    }

    try {
      const imageUrl = await this.resolveImageUrl(asset.url);
      const contextText =
        asset.source === 'AI_GENERATED' && asset.prompt
          ? `生图 prompt: ${asset.prompt}`
          : undefined;

      // 余额预检(billing 关闭时直通)
      const estimatedCost = await this.estimateCost();
      const sufficient = await this.billing.checkBalance(
        asset.ownerId,
        estimatedCost,
      );
      if (this.billing.isEnabled() && !sufficient) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const isUploadedAsset =
        (asset.source as MediaSource) === MediaSource.UPLOAD;
      const messages = buildTaggingMessagesV2(
        imageUrl,
        contextText,
        isUploadedAsset,
      );
      const { result, tokensUsed, aiOpId } = await this.aiLog.runOrThrow({
        userId: asset.ownerId,
        agentType: AgentType.VISUAL,
        action: 'media_auto_tag',
        // 审计 prompt 永不承载图片字节(URL 模式只存 URL;base64 模式存占位)
        prompt: `vision=${this.visionProvider!.providerName}/${this.visionProvider!.model} image=${imageRefForAudit(imageUrl)}`,
        model: this.visionProvider!.model,
        mediaAssetId: assetId,
        fn: async () => {
          const resp = await this.visionProvider!.chatCompletion({
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
          });
          const parsed = parseTaggingResult(resp.content);
          return { result: parsed, tokensUsed: resp.usage?.totalTokens };
        },
      });

      const tags = normalizeTags(result.tags);
      const altText = normalizeAltText(result.altText);
      const title = isUploadedAsset ? normalizeTitle(result.title) : null;
      const aiFileName =
        title && asset.createdAt
          ? buildAiFileName(
              asset.fileName,
              asset.mimeType,
              title,
              asset.createdAt,
            )
          : null;

      // 回写:CAS 守 status=ACTIVE(打标期间被软删则跳过,防已删图复活)
      // + tagStatus=TAGGING(陈旧 processOne 无法覆盖新一轮 DONE,对称 claim 的 CAS,M2)。
      // altText 仅当为空时回填(不覆盖人工,D3)
      const updated = await this.prisma.mediaAsset.updateMany({
        where: {
          id: assetId,
          status: MediaStatus.ACTIVE,
          tagStatus: MediaTagStatus.TAGGING,
        },
        data: {
          aiTags: JSON.stringify(tags),
          altText: asset.altText ? asset.altText : altText,
          ...(title ? { title: asset.title ? asset.title : title } : {}),
          ...(aiFileName ? { fileName: aiFileName } : {}),
          tagStatus: MediaTagStatus.DONE,
          taggedAt: new Date(),
          tagError: null,
        },
      });
      if (updated.count === 0) {
        this.logger.warn(
          `打标完成但资产已非 ACTIVE/TAGGING(可能已删或被重置),跳过回写与计费: ${assetId}`,
        );
      }

      // 计费:仅当回写成功(count>0)才扣,防陈旧 processOne 双重扣费(M2)。
      // usage 实扣;缺失按预估兜底(堵免单盲区)。失败仅 warn 不阻塞。
      if (updated.count > 0) {
        await this.deductBilling(
          asset.ownerId,
          aiOpId,
          tokensUsed,
          estimatedCost,
        );
        // ES 索引更新(P2):打标结果(aiTags)落库后同步 ES,fail-open
        this.emitAssetEvent('media.asset.updated', assetId);
      }

      // P2:ES upsert 在此触发(ELASTICSEARCH_ENABLED=true 时)
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      const isInsufficient = msg === 'INSUFFICIENT_BALANCE';
      await this.prisma.mediaAsset
        .update({
          where: { id: assetId },
          data: {
            tagStatus: MediaTagStatus.FAILED,
            tagError: isInsufficient
              ? 'INSUFFICIENT_BALANCE'
              : msg.slice(0, 500),
            tagRetryCount: { increment: 1 },
          },
        })
        .catch(() => {});
      if (!isInsufficient) {
        this.logger.warn(`打标失败 ${assetId}: ${msg}`);
      }
    }
  }

  // ===== 内部:图片 URL(base64 模式经 COS URL 拉字节转 data URI)=====
  private async resolveImageUrl(url: string): Promise<string> {
    if (this.imageMode === 'url') {
      // imageMogr2 中图:长边缩到 768px + 去元数据,省 token/带宽
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}imageMogr2/thumbnail/768x>/strip`;
    }
    const axios = (await import('axios')).default;
    const resp = await axios.get<Buffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 10 * 1024 * 1024,
    });
    // 仅取主类型:image/jpeg; charset=utf-8 -> image/jpeg,防 data URI 携带参数被 provider 拒收
    const mime = String(resp.headers['content-type'] || 'image/jpeg')
      .split(';')[0]
      .trim();
    return `data:${mime};base64,${Buffer.from(resp.data).toString('base64')}`;
  }

  // ===== 内部:计费(镜像 AIService.deductLLMBilling,但走 BillingService 公开 API)=====
  private async deductBilling(
    userId: string,
    aiOpId: string,
    tokensUsed: number | undefined,
    estimatedCost: number,
  ): Promise<void> {
    if (!this.billing.isEnabled()) return;
    try {
      const config = await this.billing
        .getConfig('ai_llm_per_1k_tokens')
        .catch(() => null);
      const unitPrice = config?.unitPrice ?? 0.02;
      // unitPrice=0(免费档)且 usage 缺失时 estimatedCost/unitPrice 产生 NaN,
      // 绕过 amount<=0 守卫;短路防御(m3)
      if (unitPrice <= 0) return;
      // usage 缺失按预估兜底扣费(堵 provider 不返回 usage 的免单盲区)
      const tokens =
        tokensUsed ?? Math.round((estimatedCost / unitPrice) * 1000);
      const amount = (tokens / 1000) * unitPrice;
      if (!Number.isFinite(amount) || amount <= 0) return;
      await this.billing.deduct({
        userId,
        type: TransactionType.AI_LLM,
        category: BillingCategory.AI,
        amount,
        description: '媒体图片 AI 自动打标',
        aiOperationId: aiOpId,
        quantity: tokens,
        unitPrice,
        idempotencyKey: `ai:${aiOpId}`,
      });
    } catch (err) {
      this.logger.warn(
        `打标计费失败 ${aiOpId}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /** 按 vision provider 分档预估成本(实现时按实测校准) */
  private async estimateCost(): Promise<number> {
    const config = await this.billing
      .getConfig('ai_llm_per_1k_tokens')
      .catch(() => null);
    const unitPrice = config?.unitPrice ?? 0.02;
    const provider = this.visionProvider?.providerName;
    const estTokens = provider === 'openai' ? 3000 : 2500; // openai 档偏高,gemini/kimi 档
    return (estTokens / 1000) * unitPrice;
  }

  /**
   * 每日配额(billing 无关的最后防线)。统计当日所有打标活动(TAGGING/DONE/FAILED,
   * 按 updatedAt),而非仅成功(taggedAt)——使在途标签与失败尝试(已消耗 vision 调用)
   * 均被计入,覆盖上传/AI 生图/retag/cron 全入口,且 TOCTOU 窗口收敛到 concurrency 大小(M3/M4)。
   */
  private async assertDailyQuota(userId: string): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const count = await this.prisma.mediaAsset.count({
      where: {
        ownerId: userId,
        tagStatus: {
          in: [
            MediaTagStatus.TAGGING,
            MediaTagStatus.DONE,
            MediaTagStatus.FAILED,
          ],
        },
        updatedAt: { gte: startOfDay },
      },
    });
    if (count >= this.dailyQuota) {
      throw new HttpException(
        'DAILY_QUOTA_EXCEEDED',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private numConfig(key: string, fallback: number): number {
    const v = this.config.get<string>(key);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** 事件发射 fail-open:监听器抛错不应阻塞打标主流程(与 media/ai 服务对齐) */
  private emitAssetEvent(event: string, assetId: string): void {
    try {
      this.events.emit(event, { assetId });
    } catch (err) {
      this.logger.warn(
        `${event} 事件发射失败 ${assetId}: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
