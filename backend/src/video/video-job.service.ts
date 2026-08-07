import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MediaSource,
  Prisma,
  VideoGenerationJob,
  VideoJobStatus,
} from '@prisma/client';
// 计费参数类型来自 shared 枚举(DeductParams 契约),与 Prisma 枚举值同构但名义类型不同
import { BillingCategory, TransactionType } from '@cms-ng/shared';
import axios from 'axios';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';
import {
  CreateVideoJobDto,
  QueryVideoJobDto,
} from './dto/create-video-job.dto';
import {
  VIDEO_GEN_PROVIDER,
  VideoGenProvider,
  VideoGenSubmitRequest,
} from './providers/video-gen/video-gen-provider.interface';

/** 轮询中的任务超过该时长视为生成超时,转 FAILED */
const GENERATE_TIMEOUT_MS = 30 * 60 * 1000;
/** 上传阶段僵尸(进程崩溃)超过该时长转 FAILED,可手动重试 */
const UPLOAD_STALE_MS = 10 * 60 * 1000;
/**
 * 孤儿宽限:submitStage 抢占(PENDING→ASSETS_GENERATING)到 providerTaskId 写回之间
 * 是秒级网络窗口,期间并发轮询若立即"孤儿回退"会重复提交 provider(实测发生,双扣费);
 * 超过该时长仍无 providerTaskId 才判定为真崩溃,回退 PENDING 重新提交
 */
const ORPHAN_GRACE_MS = 2 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 180_000;
const VIDEO_MAX_BYTES = 300 * 1024 * 1024;

export interface VideoJobVo extends VideoGenerationJob {
  /** 成片播放 URL(resultAssetId 溯源解析;未完成/未入库为 null) */
  resultUrl: string | null;
}

/**
 * 文生视频任务服务(PRD: docs/PRD-text-to-video.md)。
 *
 * 解耦红线:本服务不 import 文章/auto-publish 的任何过程逻辑;
 * 底层能力(COS、MediaAsset 登记、计费、ES 索引)经注入共用。
 * 状态机推进 = 创建时立即 kick + cron 兜底双通道,所有转移用
 * 条件 updateMany 抢占,保证两通道并发安全。
 */
@Injectable()
export class VideoJobService {
  private readonly logger = new Logger(VideoJobService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly search: SearchService,
    @Inject(VIDEO_GEN_PROVIDER)
    private readonly provider: VideoGenProvider | null,
  ) {
    const flag =
      (
        this.config.get<string>('VIDEO_GENERATION_ENABLED') || ''
      ).toLowerCase() === 'true';
    this.enabled = flag && this.provider != null;
    if (flag && !this.provider) {
      this.logger.warn(
        'VIDEO_GENERATION_ENABLED=true 但 VIDEO_CLIP_PROVIDER 未配置或缺 API key,文生视频降级关闭',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  capability() {
    return {
      enabled: this.enabled,
      provider: this.provider?.name ?? null,
      defaults: {
        durationSec: 6,
        resolution: '768P',
        aspectRatio: '9:16',
      },
    };
  }

  // ===== 创建 =====
  async create(userId: string, dto: CreateVideoJobDto): Promise<VideoJobVo> {
    if (!this.enabled || !this.provider) {
      throw new ServiceUnavailableException(
        '文生视频功能未启用或未配置生成 provider',
      );
    }
    // P0:provider 为服务端级单选配置;dto.provider 仅在校验一致时接受,
    // 多 provider 并存(任务级路由)属 P1 范围
    if (dto.provider && dto.provider !== (this.provider.name as string)) {
      throw new ServiceUnavailableException(
        `当前仅启用 provider=${this.provider.name},不支持指定 ${dto.provider}`,
      );
    }
    const req: VideoGenSubmitRequest = {
      prompt: dto.prompt,
      durationSec: dto.durationSec ?? 6,
      resolution: dto.resolution ?? '768P',
      aspectRatio: dto.aspectRatio ?? '9:16',
    };
    const job = await this.prisma.videoGenerationJob.create({
      data: {
        userId,
        mode: 'TEXT_TO_CLIP',
        prompt: dto.prompt,
        provider: this.provider.name,
        durationSec: req.durationSec,
        resolution: req.resolution,
        aspectRatio: req.aspectRatio,
        costEstimate: this.provider.estimateCost(req),
      },
    });
    // 立即 kick 一次(不等 cron);失败由 scheduler 兜底
    void this.submitStage(job.id).catch((err) =>
      this.logger.warn(
        `任务 ${job.id} 首次提交异常(转 cron 兜底): ${(err as Error)?.message ?? err}`,
      ),
    );
    return this.toVo(job, null);
  }

  // ===== 查询 =====
  async list(userId: string, query: QueryVideoJobDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.VideoGenerationJobWhereInput = { userId };
    if (query.status) {
      where.status = query.status as VideoJobStatus;
    }
    const [total, jobs] = await this.prisma.$transaction([
      this.prisma.videoGenerationJob.count({ where }),
      this.prisma.videoGenerationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: await this.withResultUrls(jobs),
      meta: { page, pageSize, total },
    };
  }

  async get(userId: string, id: string): Promise<VideoJobVo> {
    const job = await this.prisma.videoGenerationJob.findUnique({
      where: { id },
    });
    if (!job || job.userId !== userId) {
      throw new NotFoundException('视频任务不存在');
    }
    const [vo] = await this.withResultUrls([job]);
    return vo;
  }

  // ===== 重试 / 取消 =====
  async retry(userId: string, id: string): Promise<VideoJobVo> {
    const job = await this.getOwned(userId, id);
    if (job.status !== 'FAILED') {
      throw new ServiceUnavailableException('仅失败任务可重试');
    }
    if (job.retryCount >= MAX_RETRY_COUNT) {
      throw new ServiceUnavailableException(
        `已达最大重试次数(${MAX_RETRY_COUNT})`,
      );
    }
    // 上传阶段失败且 provider 任务仍在时效内(MiniMax 9h)→ 回到轮询态复用原任务,
    // 避免重复生成扣费;其余情况重新提交生成
    const resumePolling =
      job.failedStep === 'upload' && job.providerTaskId != null;
    const updated = await this.prisma.videoGenerationJob.update({
      where: { id },
      data: {
        status: resumePolling ? 'ASSETS_GENERATING' : 'PENDING',
        failedStep: null,
        error: null,
        retryCount: { increment: 1 },
      },
    });
    if (resumePolling) {
      void this.pollStage(id).catch(() => undefined);
    } else {
      void this.submitStage(id).catch(() => undefined);
    }
    return this.toVo(updated, null);
  }

  async cancel(userId: string, id: string): Promise<VideoJobVo> {
    await this.getOwned(userId, id);
    // 条件抢占:仅进行中状态可取消(provider 侧任务不撤销,费用已发生,结果忽略)
    const claimed = await this.prisma.videoGenerationJob.updateMany({
      where: {
        id,
        status: { in: ['PENDING', 'ASSETS_GENERATING'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (!claimed.count) {
      throw new ServiceUnavailableException('当前状态不可取消');
    }
    return this.get(userId, id);
  }

  // ===== 状态机推进(供 kick 与 cron 两通道调用;条件抢占保证幂等) =====

  /** PENDING → ASSETS_GENERATING:提交 provider 异步任务 */
  async submitStage(jobId: string): Promise<void> {
    if (!this.provider) return;
    const claimed = await this.prisma.videoGenerationJob.updateMany({
      where: { id: jobId, status: 'PENDING' },
      data: { status: 'ASSETS_GENERATING' },
    });
    if (!claimed.count) return;
    const job = await this.prisma.videoGenerationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;
    try {
      const handle = await this.provider.submit({
        prompt: job.prompt,
        durationSec: job.durationSec ?? undefined,
        resolution: (job.resolution as '768P' | '1080P') ?? undefined,
        aspectRatio: (job.aspectRatio as '16:9' | '9:16' | '1:1') ?? undefined,
      });
      await this.prisma.videoGenerationJob.update({
        where: { id: jobId },
        data: { providerTaskId: handle.taskId },
      });
      this.logger.log(
        `任务 ${jobId} 已提交 ${this.provider.name}: ${handle.taskId}`,
      );
    } catch (err) {
      await this.fail(jobId, 'submit', err);
    }
  }

  /** ASSETS_GENERATING 轮询:succeeded → 抢占转 UPLOADING 并下载转存 */
  async pollStage(jobId: string): Promise<void> {
    if (!this.provider) return;
    const job = await this.prisma.videoGenerationJob.findUnique({
      where: { id: jobId },
    });
    if (!job || job.status !== 'ASSETS_GENERATING') return;
    if (!job.providerTaskId) {
      // 宽限期内视为 submitStage 提交进行中(provider.submit 是秒级网络调用),
      // 直接跳过 —— 否则与提交窗口竞争会造成重复提交 provider、双扣费
      if (Date.now() - job.updatedAt.getTime() < ORPHAN_GRACE_MS) {
        return;
      }
      // 崩溃于 submit 成功但写 providerTaskId 之前 —— 无法找回,重新提交
      this.logger.warn(
        `任务 ${jobId} 缺 providerTaskId 且超过宽限期,回退 PENDING 重新提交`,
      );
      await this.prisma.videoGenerationJob.updateMany({
        where: { id: jobId, status: 'ASSETS_GENERATING' },
        data: { status: 'PENDING' },
      });
      return;
    }
    if (Date.now() - job.updatedAt.getTime() > GENERATE_TIMEOUT_MS) {
      await this.fail(jobId, 'poll', new Error('生成超时(30 分钟未完成)'));
      return;
    }

    let result;
    try {
      result = await this.provider.poll(job.providerTaskId);
    } catch (err) {
      // 单次轮询失败不置失败(网络抖动),等下一轮 cron;超时由上面闸门兜底
      this.logger.warn(
        `任务 ${jobId} 轮询异常: ${(err as Error)?.message ?? err}`,
      );
      return;
    }
    switch (result.state) {
      case 'pending':
      case 'processing':
        // 触碰 updatedAt 表示活跃(僵尸判定以最后一次成功轮询为准);
        // 显式赋值,空 data 不保证触发 @updatedAt
        await this.prisma.videoGenerationJob.update({
          where: { id: jobId },
          data: { updatedAt: new Date() },
        });
        return;
      case 'failed':
        await this.fail(
          jobId,
          'generate',
          new Error(result.error || 'provider 生成失败'),
        );
        return;
      case 'succeeded': {
        if (!result.videoUrl) {
          await this.fail(
            jobId,
            'generate',
            new Error('provider 未返回视频 URL'),
          );
          return;
        }
        const claimed = await this.prisma.videoGenerationJob.updateMany({
          where: { id: jobId, status: 'ASSETS_GENERATING' },
          data: { status: 'UPLOADING' },
        });
        if (!claimed.count) return;
        await this.uploadStage(jobId, {
          videoUrl: result.videoUrl,
          width: result.width,
          height: result.height,
          durationSec: result.durationSec,
        });
        return;
      }
    }
  }

  /** UPLOADING:下载临时 URL → COS → 登记媒体库 → 计费 → SUCCEEDED */
  private async uploadStage(
    jobId: string,
    result: {
      videoUrl: string;
      width?: number;
      height?: number;
      durationSec?: number;
    },
  ): Promise<void> {
    const job = await this.prisma.videoGenerationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;
    try {
      const buffer = await this.download(result.videoUrl);
      const key = `video/${jobId}.mp4`;
      const stored = await this.storage.put(key, buffer, 'video/mp4');

      const asset = await this.prisma.mediaAsset.create({
        data: {
          storageKey: stored.key,
          url: stored.url,
          fileName: `ai-video-${jobId.slice(0, 8)}.mp4`,
          mimeType: 'video/mp4',
          size: buffer.length,
          width: result.width ?? null,
          height: result.height ?? null,
          duration: result.durationSec ?? job.durationSec ?? null,
          source: MediaSource.AI_GENERATED,
          // 溯源到视频任务而非 AIOperation(视频链路独立于 ai 模块)
          sourceRef: `videoJob:${jobId}`,
          prompt: job.prompt,
          title: job.prompt.slice(0, 50),
          ownerId: job.userId,
          // 视频不走视觉打标(图片专用),保持 NONE 不触发 tagging 队列
          tagStatus: 'NONE',
        },
      });

      await this.prisma.videoGenerationJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', resultAssetId: asset.id },
      });
      await this.deductBilling(job);
      // ES 索引 fail-open(warn-only),与媒体库上传路径行为一致;
      // 不发 media.asset.created 事件 —— 那会触发图片打标队列
      try {
        await this.search.indexAsset(asset.id);
      } catch (err) {
        this.logger.warn(
          `视频资产 ES 索引失败 ${asset.id}: ${(err as Error)?.message ?? err}`,
        );
      }
      this.logger.log(
        `任务 ${jobId} 完成: asset=${asset.id} url=${stored.url}`,
      );
    } catch (err) {
      await this.fail(jobId, 'upload', err);
    }
  }

  /** cron 兜底:推进滞留任务 + 清理僵尸(由 VideoJobScheduler 调用) */
  async sweep(): Promise<void> {
    if (!this.enabled) return;
    const pending = await this.prisma.videoGenerationJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    for (const job of pending) {
      await this.submitStage(job.id).catch((err) =>
        this.logger.warn(
          `兜底提交 ${job.id} 失败: ${(err as Error)?.message ?? err}`,
        ),
      );
    }

    const generating = await this.prisma.videoGenerationJob.findMany({
      where: { status: 'ASSETS_GENERATING' },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const job of generating) {
      await this.pollStage(job.id).catch((err) =>
        this.logger.warn(
          `兜底轮询 ${job.id} 失败: ${(err as Error)?.message ?? err}`,
        ),
      );
    }

    // 上传阶段僵尸(进程崩溃于下载/转存中)→ 置 FAILED,用户重试时回轮询态复用 provider 结果
    const staleUploads = await this.prisma.videoGenerationJob.updateMany({
      where: {
        status: 'UPLOADING',
        updatedAt: { lt: new Date(Date.now() - UPLOAD_STALE_MS) },
      },
      data: {
        status: 'FAILED',
        failedStep: 'upload',
        error: '上传转存中断(进程重启),请重试',
      },
    });
    if (staleUploads.count) {
      this.logger.warn(`清理上传僵尸任务 ${staleUploads.count} 个`);
    }
  }

  private async fail(jobId: string, step: string, err: unknown): Promise<void> {
    const message = (err as Error)?.message ?? String(err);
    this.logger.warn(`任务 ${jobId} 失败于 ${step}: ${message}`);
    await this.prisma.videoGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        failedStep: step,
        error: message.slice(0, 1000),
      },
    });
  }

  private async deductBilling(job: VideoGenerationJob): Promise<void> {
    if (!this.billing.isEnabled()) return;
    try {
      const cfg = await this.billing
        .getConfig('ai_video_per_clip')
        .catch(() => null);
      const unitPrice = cfg?.unitPrice ?? 2.0;
      if (unitPrice <= 0) return;
      await this.billing.deduct({
        userId: job.userId,
        type: TransactionType.AI_VIDEO,
        category: BillingCategory.AI,
        amount: unitPrice,
        description: 'AI 视频片段生成',
        quantity: 1,
        unitPrice,
        idempotencyKey: `video:${job.id}`,
      });
      await this.prisma.videoGenerationJob.update({
        where: { id: job.id },
        data: { costActual: unitPrice },
      });
    } catch (err) {
      this.logger.warn(
        `视频任务 ${job.id} 计费失败: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private async download(url: string): Promise<Buffer> {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: VIDEO_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: VIDEO_MAX_BYTES,
    });
    return Buffer.from(resp.data);
  }

  private async getOwned(
    userId: string,
    id: string,
  ): Promise<VideoGenerationJob> {
    const job = await this.prisma.videoGenerationJob.findUnique({
      where: { id },
    });
    if (!job || job.userId !== userId) {
      throw new NotFoundException('视频任务不存在');
    }
    return job;
  }

  private async withResultUrls(
    jobs: VideoGenerationJob[],
  ): Promise<VideoJobVo[]> {
    const assetIds = jobs
      .map((j) => j.resultAssetId)
      .filter((x): x is string => Boolean(x));
    const assets = assetIds.length
      ? await this.prisma.mediaAsset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, url: true },
        })
      : [];
    const urlById = new Map(assets.map((a) => [a.id, a.url]));
    return jobs.map((j) =>
      this.toVo(
        j,
        j.resultAssetId ? (urlById.get(j.resultAssetId) ?? null) : null,
      ),
    );
  }

  private toVo(job: VideoGenerationJob, resultUrl: string | null): VideoJobVo {
    return { ...job, resultUrl };
  }
}
