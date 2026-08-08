import {
  BadRequestException,
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
import { BillingCategory, isEditorRole, TransactionType } from '@cms-ng/shared';
import axios from 'axios';
import { CHAT_PROVIDER } from '../ai/providers';
import type { ChatCompletionProvider } from '../ai/providers';
import { BillingService } from '../billing/billing.service';
import { safeJsonParse } from '../common/json.utils';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';
import {
  CreateVideoJobDto,
  QueryVideoJobDto,
} from './dto/create-video-job.dto';
import { AssetsStep } from './pipeline/assets.step';
import { ComposeStep } from './pipeline/compose.step';
import { VideoPipelineDeps } from './pipeline/pipeline-deps';
import { ScriptStep } from './pipeline/script.step';
import { StoryboardStep } from './pipeline/storyboard.step';
import { Storyboard } from './pipeline/storyboard.types';
import {
  IMAGE_GEN_PROVIDER,
  ImageGenProvider,
} from './providers/image-gen/image-gen-provider.interface';
import {
  VIDEO_GEN_PROVIDER,
  VideoGenProvider,
  VideoGenSubmitRequest,
  VideoReference,
} from './providers/video-gen/video-gen-provider.interface';

/** L1 可选提交参数(落 submitOptions 列,PRD §18) */
interface VideoSubmitOptions {
  references?: VideoReference[];
  seed?: number;
  draft?: boolean;
  returnLastFrame?: boolean;
}

/** 参考物数量上限(Seedance 2.x 官方约束):首/尾帧各 1,图片合计 9,视频 3,音频 3 */
const REFERENCE_LIMITS = {
  first_frame: 1,
  last_frame: 1,
  reference_image: 9, // 帧/参考互斥下独立可达 9;与非互斥 provider 组合时另有图片合计 ≤9 兜底
  reference_video: 3,
  reference_audio: 3,
} as const;

/** 轮询中的任务超过该时长视为生成超时,转 FAILED */
const GENERATE_TIMEOUT_MS = 30 * 60 * 1000;
/**
 * 孤儿宽限:submitStage 抢占(PENDING→ASSETS_GENERATING)到 providerTaskId 写回之间
 * 是秒级网络窗口,期间并发轮询若立即"孤儿回退"会重复提交 provider(实测发生,双扣费);
 * 超过该时长仍无 providerTaskId 才判定为真崩溃,回退 PENDING 重新提交
 */
const ORPHAN_GRACE_MS = 2 * 60 * 1000;
/** 上传/合成阶段僵尸(进程崩溃)超过该时长转 FAILED,可手动重试(L2 含 ffmpeg 合成,窗口放宽) */
const UPLOAD_STALE_MS = 20 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 180_000;
const VIDEO_MAX_BYTES = 300 * 1024 * 1024;

/** L2(稿件成片)失败步骤 → 重试时回到的状态 */
const L2_RETRY_STATE: Record<string, VideoJobStatus> = {
  script: 'SCRIPTING',
  storyboard: 'STORYBOARDING',
  assets: 'ASSETS_GENERATING',
  voice: 'COMPOSING', // 兼容:TTS 配音步已移除(2026-08-08),存量失败行直转合成
  compose: 'COMPOSING',
  upload: 'COMPOSING', // 合成目录已清理,重试从合成重来(原料均可从 COS 重下)
};

const L2_ACTIVE_STATUSES: VideoJobStatus[] = [
  'PENDING',
  'SCRIPTING',
  'STORYBOARDING',
  'ASSETS_GENERATING',
  'VOICE_SYNTHESIZING',
  'COMPOSING',
  'UPLOADING',
];

export interface VideoJobVo extends VideoGenerationJob {
  /** 成片播放 URL(resultAssetId 溯源解析;未完成/未入库为 null) */
  resultUrl: string | null;
  /** 尾帧图 URL(lastFrameAssetId 溯源解析;未请求尾帧为 null) */
  lastFrameUrl: string | null;
}

/**
 * 文生视频任务服务(PRD: docs/PRD-text-to-video.md)。
 *
 * 解耦红线:本服务不 import 文章/auto-publish 的任何过程逻辑;
 * 底层能力(LLM seam、COS、MediaAsset 登记、计费、ES 索引)经注入共用。
 * 状态机推进 = 创建时立即 kick + cron 兜底双通道,所有转移用
 * 条件 updateMany 抢占,保证两通道并发安全。
 *
 * L1(TEXT_TO_CLIP):PENDING→ASSETS_GENERATING→UPLOADING→SUCCEEDED
 * L2(ARTICLE_TO_VIDEO):PENDING→SCRIPTING→STORYBOARDING→ASSETS_GENERATING
 *   →COMPOSING→UPLOADING→SUCCEEDED(配音走素材原生音频,无独立配音步;
 *   VOICE_SYNTHESIZING 为已废弃状态,仅兼容存量行直转 COMPOSING)
 */
@Injectable()
export class VideoJobService {
  private readonly logger = new Logger(VideoJobService.name);
  private readonly enabled: boolean;
  private readonly renderEnabled: boolean;
  /**
   * 进程内推进互斥:L2 的 LLM/生图/合成步骤经常超过 cron 周期(1min),
   * 不挡则相邻两 tick 重入同一任务 → 重复脚本/分镜/素材调用(双倍费用)。
   * DB 条件 updateMany 抢占保留为多进程部署的第二层兜底。
   */
  private readonly advancing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly search: SearchService,
    @Inject(VIDEO_GEN_PROVIDER)
    private readonly provider: VideoGenProvider | null,
    @Inject(CHAT_PROVIDER)
    private readonly chat: ChatCompletionProvider,
    @Inject(IMAGE_GEN_PROVIDER)
    private readonly imageGen: ImageGenProvider | null,
  ) {
    const flag =
      (
        this.config.get<string>('VIDEO_GENERATION_ENABLED') || ''
      ).toLowerCase() === 'true';
    this.enabled = flag && this.provider != null;
    this.renderEnabled =
      (this.config.get<string>('VIDEO_RENDER_ENABLED') || '').toLowerCase() ===
      'true';
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
        resolution: '480P',
        aspectRatio: '9:16',
      },
      // L2(稿件一键成片)能力分解:渲染开关 + 图片 provider 必备
      l2: this.enabled && this.renderEnabled && this.imageGen != null,
      // 配音通道 = 片段模型原生音频(Seedance 1.5+/2.x);false 时 L2 成片无配音(纯字幕)
      nativeAudio: this.provider?.supportsNativeAudio === true,
      // L1 可选参数能力位(PRD §18):参考物角色/限额/互斥约束 + seed/draft/尾帧,前端据此 gating 表单
      references: {
        roles: this.paramCaps.referenceRoles,
        limits: REFERENCE_LIMITS,
        frameReferenceExclusive:
          this.paramCaps.frameReferenceExclusive === true,
      },
      seed: this.paramCaps.seed,
      draft: this.paramCaps.draft,
      returnLastFrame: this.paramCaps.returnLastFrame,
      // 时长能力位(PRD §17.3 #3):free=自由输入(2.x 4~15s),fixed=档位下拉;缺省 fixed [6,10]
      duration: this.provider?.durationCapabilities ?? {
        mode: 'fixed' as const,
        min: 6,
        max: 10,
        allowed: [6, 10],
      },
      render: this.renderEnabled,
    };
  }

  /** provider 可选参数能力位(缺省 = 仅首帧,无可选参数) */
  private get paramCaps() {
    return (
      this.provider?.paramCapabilities ?? {
        referenceRoles: ['first_frame' as const],
        seed: false,
        draft: false,
        returnLastFrame: false,
      }
    );
  }

  private pipelineDeps(): VideoPipelineDeps {
    return {
      prisma: this.prisma,
      config: this.config,
      chat: this.chat,
      videoGen: this.provider,
      imageGen: this.imageGen,
      storage: this.storage,
    };
  }

  // ===== 创建 =====
  async create(
    userId: string,
    dto: CreateVideoJobDto,
    role?: string,
  ): Promise<VideoJobVo> {
    if (!this.enabled || !this.provider) {
      throw new ServiceUnavailableException(
        '文生视频功能未启用或未配置生成 provider',
      );
    }
    // P0/P1:provider 为服务端级单选配置;dto.provider 仅在校验一致时接受,
    // 多 provider 并存(任务级路由)属后续范围
    if (dto.provider && dto.provider !== (this.provider.name as string)) {
      throw new ServiceUnavailableException(
        `当前仅启用 provider=${this.provider.name},不支持指定 ${dto.provider}`,
      );
    }

    const isL2 = dto.mode === 'ARTICLE_TO_VIDEO';
    const submitOptions = this.validateSubmitOptions(dto, isL2);
    let costEstimate: number;
    if (isL2) {
      if (!this.renderEnabled) {
        throw new ServiceUnavailableException(
          '稿件成片需要渲染能力(VIDEO_RENDER_ENABLED),当前未启用',
        );
      }
      if (!this.imageGen) {
        throw new ServiceUnavailableException('图片生成 provider 未配置');
      }
      if (!dto.articleId) {
        throw new ServiceUnavailableException('稿件成片任务缺少 articleId');
      }
      // 跨字段/归属校验在 service 层(class-validator 不做跨字段比较)
      const article = await this.prisma.article.findUnique({
        where: { id: dto.articleId },
        select: { authorId: true, title: true },
      });
      if (!article) {
        throw new NotFoundException('来源文章不存在');
      }
      const privileged = isEditorRole(role);
      if (article.authorId !== userId && !privileged) {
        throw new ServiceUnavailableException('只能用自己的文章生成视频');
      }
      costEstimate = await this.estimateL2Cost();
    } else {
      if (!dto.prompt?.trim()) {
        throw new ServiceUnavailableException('文生片段任务缺少画面描述');
      }
      const req: VideoGenSubmitRequest = {
        prompt: dto.prompt,
        durationSec: dto.durationSec ?? 6,
        resolution: dto.resolution ?? '480P',
        aspectRatio: dto.aspectRatio ?? '9:16',
        generateAudio: dto.generateAudio,
        ...submitOptions,
      };
      costEstimate = this.provider.estimateCost(req);
    }

    const job = await this.prisma.videoGenerationJob.create({
      data: {
        userId,
        mode: isL2 ? 'ARTICLE_TO_VIDEO' : 'TEXT_TO_CLIP',
        prompt: dto.prompt?.trim() ?? '',
        articleId: isL2 ? dto.articleId : null,
        provider: this.provider.name,
        durationSec: dto.durationSec ?? null,
        resolution: dto.resolution ?? '480P',
        aspectRatio: dto.aspectRatio ?? '9:16',
        generateAudio: isL2 ? null : (dto.generateAudio ?? null),
        submitOptions:
          !isL2 && Object.keys(submitOptions).length
            ? JSON.stringify(submitOptions)
            : null,
        costEstimate,
      },
    });
    // 立即 kick 一次(不等 cron);失败由 scheduler 兜底
    void this.advance(job.id).catch((err) =>
      this.logger.warn(
        `任务 ${job.id} 首次推进异常(转 cron 兜底): ${(err as Error)?.message ?? err}`,
      ),
    );
    return this.toVo(job, null);
  }

  /**
   * L1 可选提交参数校验(PRD §18):
   * - 仅 L1;L2 传了直接 400(范围决策:L2 参考物另行设计)
   * - 角色 ⊆ provider 能力位;数量上限按 Seedance 官方约束;
   *   参考音频不可单独存在(官方:须至少 1 图或 1 视频)
   * 返回归一化后的 options(空对象 = 无可选参数)。
   */
  private validateSubmitOptions(
    dto: CreateVideoJobDto,
    isL2: boolean,
  ): VideoSubmitOptions {
    const references: VideoReference[] | undefined = dto.references?.map(
      (r) => ({ role: r.role, url: r.url }),
    );
    const hasAny =
      (references?.length ?? 0) > 0 ||
      dto.seed != null ||
      dto.draft === true ||
      dto.returnLastFrame === true;
    if (!hasAny) return {};
    if (isL2) {
      throw new BadRequestException(
        '参考素材/seed/draft/尾帧参数仅支持 L1 文生片段',
      );
    }
    const caps = this.paramCaps;
    if (dto.seed != null && !caps.seed) {
      throw new BadRequestException(`当前 provider 不支持 seed 参数`);
    }
    if (dto.draft && !caps.draft) {
      throw new BadRequestException(`当前 provider 不支持 draft 草稿模式`);
    }
    if (dto.returnLastFrame && !caps.returnLastFrame) {
      throw new BadRequestException(`当前 provider 不支持返回尾帧`);
    }
    if (references?.length) {
      for (const ref of references) {
        if (!caps.referenceRoles.includes(ref.role)) {
          throw new BadRequestException(
            `当前 provider 不支持参考角色 ${ref.role}(支持: ${caps.referenceRoles.join('/') || '无'})`,
          );
        }
      }
      const count = (role: VideoReference['role']) =>
        references.filter((r) => r.role === role).length;
      const frameCount = count('first_frame') + count('last_frame');
      const refMediaCount =
        count('reference_image') +
        count('reference_video') +
        count('reference_audio');
      // 互斥(2026-08-08 Ark 400 实测,PRD §18):帧角色与参考角色是两种生成模式
      if (caps.frameReferenceExclusive && frameCount > 0 && refMediaCount > 0) {
        throw new BadRequestException(
          '首帧/尾帧与参考图/参考视频/参考音频不能混合使用(首尾帧补间与多模态参考是两种生成模式)',
        );
      }
      const images =
        count('first_frame') + count('last_frame') + count('reference_image');
      if (count('first_frame') > REFERENCE_LIMITS.first_frame)
        throw new BadRequestException('首帧参考最多 1 个');
      if (count('last_frame') > REFERENCE_LIMITS.last_frame)
        throw new BadRequestException('尾帧参考最多 1 个');
      if (count('reference_image') > REFERENCE_LIMITS.reference_image)
        throw new BadRequestException('参考图最多 9 个');
      if (images > 9) throw new BadRequestException('图片参考合计最多 9 个');
      if (count('reference_video') > REFERENCE_LIMITS.reference_video)
        throw new BadRequestException('参考视频最多 3 个');
      if (count('reference_audio') > REFERENCE_LIMITS.reference_audio)
        throw new BadRequestException('参考音频最多 3 个');
      if (
        count('reference_audio') > 0 &&
        images === 0 &&
        count('reference_video') === 0
      ) {
        throw new BadRequestException(
          '参考音频不能单独存在,须至少搭配 1 个图片或视频参考',
        );
      }
    }
    return {
      ...(references?.length ? { references } : {}),
      ...(dto.seed != null ? { seed: dto.seed } : {}),
      ...(dto.draft ? { draft: true } : {}),
      ...(dto.returnLastFrame ? { returnLastFrame: true } : {}),
    };
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
    let nextStatus: VideoJobStatus;
    if (job.mode === 'ARTICLE_TO_VIDEO') {
      nextStatus = L2_RETRY_STATE[job.failedStep ?? ''] ?? 'SCRIPTING';
    } else {
      // 上传阶段失败且 provider 任务仍在时效内(MiniMax 9h)→ 回到轮询态复用原任务,
      // 避免重复生成扣费;其余情况重新提交生成
      nextStatus =
        job.failedStep === 'upload' && job.providerTaskId != null
          ? 'ASSETS_GENERATING'
          : 'PENDING';
    }
    const updated = await this.prisma.videoGenerationJob.update({
      where: { id },
      data: {
        status: nextStatus,
        failedStep: null,
        error: null,
        retryCount: { increment: 1 },
      },
    });
    void this.advance(id).catch(() => undefined);
    return this.toVo(updated, null);
  }

  async cancel(userId: string, id: string): Promise<VideoJobVo> {
    await this.getOwned(userId, id);
    // 条件抢占:仅进行中状态可取消(provider 侧任务不撤销,费用已发生,结果忽略)
    const claimed = await this.prisma.videoGenerationJob.updateMany({
      where: {
        id,
        status: { in: [...L2_ACTIVE_STATUSES] },
      },
      data: { status: 'CANCELLED' },
    });
    if (!claimed.count) {
      throw new ServiceUnavailableException('当前状态不可取消');
    }
    return this.get(userId, id);
  }

  // ===== 状态机推进(供 kick 与 cron 两通道调用;条件抢占保证幂等) =====

  /** 统一入口:按任务模式路由 L1/L2;进程内互斥防长步骤跨 tick 重入 */
  async advance(jobId: string): Promise<void> {
    if (this.advancing.has(jobId)) return;
    this.advancing.add(jobId);
    try {
      const job = await this.prisma.videoGenerationJob.findUnique({
        where: { id: jobId },
      });
      if (!job) return;
      if (job.mode === 'ARTICLE_TO_VIDEO') {
        await this.advanceL2(job);
        return;
      }
      if (job.status === 'PENDING') {
        await this.submitStage(jobId);
      } else if (job.status === 'ASSETS_GENERATING') {
        await this.pollStage(jobId);
      }
    } finally {
      this.advancing.delete(jobId);
    }
  }

  /** PENDING → ASSETS_GENERATING:提交 provider 异步任务(L1)。public 供单测直达 */
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
    const submitOptions = safeJsonParse<VideoSubmitOptions>(
      job.submitOptions,
      {},
    );
    try {
      const handle = await this.provider.submit({
        prompt: job.prompt,
        durationSec: job.durationSec ?? undefined,
        resolution: (job.resolution as '480P' | '720P') ?? undefined,
        aspectRatio: (job.aspectRatio as '16:9' | '9:16' | '1:1') ?? undefined,
        generateAudio: job.generateAudio ?? undefined,
        ...submitOptions,
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

  /** ASSETS_GENERATING 轮询(L1):succeeded → 抢占转 UPLOADING 并下载转存。public 供单测直达 */
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
          lastFrameUrl: result.lastFrameUrl,
          width: result.width,
          height: result.height,
          durationSec: result.durationSec,
        });
        return;
      }
    }
  }

  /**
   * L2 编排:脚本 → 分镜 → 素材(逐镜 checkpoint,多 tick)→ 合成 → 上传。
   * 配音由素材步的原生音频承担(旁白注入视频 prompt),无独立配音步。
   * 除素材步外每步幂等(崩溃后按状态重入续跑);素材步进度落 storyboard checkpoint。
   */
  private async advanceL2(job: VideoGenerationJob): Promise<void> {
    const deps = this.pipelineDeps();
    let current = job;
    try {
      if (current.status === 'PENDING') {
        const claimed = await this.prisma.videoGenerationJob.updateMany({
          where: { id: job.id, status: 'PENDING' },
          data: { status: 'SCRIPTING' },
        });
        if (!claimed.count) return;
        current = { ...current, status: 'SCRIPTING' };
      }
      if (current.status === 'SCRIPTING') {
        const script = await new ScriptStep(deps).run(current);
        current = await this.prisma.videoGenerationJob.update({
          where: { id: job.id },
          data: { script, status: 'STORYBOARDING' },
        });
      }
      if (current.status === 'STORYBOARDING') {
        if (!current.script) throw new Error('缺口播脚本 checkpoint');
        const storyboard = await new StoryboardStep(deps).run(
          current,
          current.script,
        );
        current = await this.prisma.videoGenerationJob.update({
          where: { id: job.id },
          data: {
            storyboard: JSON.stringify(storyboard),
            status: 'ASSETS_GENERATING',
          },
        });
      }
      if (current.status === 'ASSETS_GENERATING') {
        if (Date.now() - current.updatedAt.getTime() > GENERATE_TIMEOUT_MS) {
          await this.fail(job.id, 'assets', new Error('素材生成超时(30 分钟)'));
          return;
        }
        const storyboard = this.parseStoryboardCheckpoint(current);
        const before = JSON.stringify(storyboard.scenes.map((s) => s.asset));
        const done = await new AssetsStep(deps).run(current, storyboard);
        const changed =
          JSON.stringify(storyboard.scenes.map((s) => s.asset)) !== before;
        if (!done) {
          // 有进展才写库(写库会触碰 updatedAt,影响超时判定)
          if (changed) {
            await this.prisma.videoGenerationJob.update({
              where: { id: job.id },
              data: { storyboard: JSON.stringify(storyboard) },
            });
          }
          return;
        }
        current = await this.prisma.videoGenerationJob.update({
          where: { id: job.id },
          data: {
            storyboard: JSON.stringify(storyboard),
            // 配音通道 = 片段模型原生音频(Seedance 1.5+/2.x),无独立 TTS;
            // 'none' = provider 无原生音频能力,成片纯字幕降级
            ttsProvider: this.provider?.supportsNativeAudio ? 'native' : 'none',
            status: 'COMPOSING',
          },
        });
      }
      if (current.status === 'VOICE_SYNTHESIZING') {
        // 兼容:TTS 配音步已移除(2026-08-08),存量进行中的行直转 COMPOSING
        current = await this.prisma.videoGenerationJob.update({
          where: { id: job.id },
          data: {
            ttsProvider: this.provider?.supportsNativeAudio ? 'native' : 'none',
            status: 'COMPOSING',
          },
        });
      }
      if (current.status === 'COMPOSING') {
        // 合成是分钟级 CPU 任务:先抢占转 UPLOADING 防 cron 重入,
        // 僵尸窗口(20min)覆盖 合成+上传 全程
        const claimed = await this.prisma.videoGenerationJob.updateMany({
          where: { id: job.id, status: 'COMPOSING' },
          data: { status: 'UPLOADING' },
        });
        if (!claimed.count) return;
        const storyboard = this.parseStoryboardCheckpoint(current);
        await this.composeAndUpload(job.id, storyboard, deps);
        return;
      }
    } catch (err) {
      const step =
        current.status === 'SCRIPTING'
          ? 'script'
          : current.status === 'STORYBOARDING'
            ? 'storyboard'
            : current.status === 'ASSETS_GENERATING'
              ? 'assets'
              : 'compose';
      await this.fail(job.id, step, err);
    }
  }

  /** L2 终段:ffmpeg 合成 → COS → 登记媒体库 → 计费 → SUCCEEDED */
  private async composeAndUpload(
    jobId: string,
    storyboard: Storyboard,
    deps: VideoPipelineDeps,
  ): Promise<void> {
    const job = await this.prisma.videoGenerationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;
    const compose = new ComposeStep(deps);
    try {
      const result = await compose.run(job, storyboard);
      await compose.cleanup(jobId);
      await this.registerResult(job, result.buffer, {
        width: this.ratioDims(storyboard.aspectRatio).w,
        height: this.ratioDims(storyboard.aspectRatio).h,
        durationSec: Math.round(result.durationSec),
        fileName: `article-video-${jobId.slice(0, 8)}.mp4`,
        title: storyboard.title.slice(0, 50),
        billingConfigKey: 'ai_video_per_compose',
        billingDescription: `AI 稿件成片(${storyboard.scenes.length} 镜)`,
        billingDefaultPrice: 8.0,
        idempotencyKey: `video-compose:${job.id}`,
      });
    } catch (err) {
      await compose.cleanup(jobId);
      // 区分 compose/upload 失败仅影响重试落点,统一记 compose(L2 重试均回 COMPOSING)
      await this.fail(jobId, 'compose', err);
    }
  }

  /** UPLOADING(L1):下载临时 URL → COS → 登记媒体库 → 计费 → SUCCEEDED */
  private async uploadStage(
    jobId: string,
    result: {
      videoUrl: string;
      lastFrameUrl?: string;
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
      await this.registerResult(job, buffer, {
        width: result.width ?? null,
        height: result.height ?? null,
        durationSec: result.durationSec ?? job.durationSec ?? null,
        fileName: `ai-video-${jobId.slice(0, 8)}.mp4`,
        title: job.prompt.slice(0, 50),
        billingConfigKey: 'ai_video_per_clip',
        billingDescription: 'AI 视频片段生成',
        billingDefaultPrice: 2.0,
        idempotencyKey: `video:${job.id}`,
      });
    } catch (err) {
      await this.fail(jobId, 'upload', err);
      return;
    }
    // 尾帧图(returnLastFrame 续拍链):主片已成功,尾帧失败仅告警不置任务失败
    if (result.lastFrameUrl) {
      try {
        await this.registerLastFrame(job, result.lastFrameUrl);
      } catch (err) {
        this.logger.warn(
          `任务 ${jobId} 尾帧入库失败(主片已成功): ${(err as Error)?.message ?? err}`,
        );
      }
    }
  }

  /** 尾帧图下载转存并入媒体库(sourceRef 加 :last-frame 后缀溯源) */
  private async registerLastFrame(
    job: VideoGenerationJob,
    lastFrameUrl: string,
  ): Promise<void> {
    const buffer = await this.download(lastFrameUrl);
    const stored = await this.storage.put(
      `video/${job.id}-last-frame.jpg`,
      buffer,
      'image/jpeg',
    );
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: stored.key,
        url: stored.url,
        fileName: `ai-video-${job.id.slice(0, 8)}-last-frame.jpg`,
        mimeType: 'image/jpeg',
        size: buffer.length,
        source: MediaSource.AI_GENERATED,
        sourceRef: `videoJob:${job.id}:last-frame`,
        prompt: job.prompt,
        title: `${job.prompt.slice(0, 40)}(尾帧)`,
        ownerId: job.userId,
        // 尾帧是视频衍生品,不进图片打标队列(与视频资产同口径)
        tagStatus: 'NONE',
      },
    });
    await this.prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { lastFrameAssetId: asset.id },
    });
    try {
      await this.search.indexAsset(asset.id);
    } catch (err) {
      this.logger.warn(
        `尾帧资产 ES 索引失败 ${asset.id}: ${(err as Error)?.message ?? err}`,
      );
    }
    this.logger.log(`任务 ${job.id} 尾帧入库: asset=${asset.id}`);
  }

  /** 成片登记共用段:COS → MediaAsset → SUCCEEDED → 计费 → ES 索引(fail-open) */
  private async registerResult(
    job: VideoGenerationJob,
    buffer: Buffer,
    opts: {
      width: number | null;
      height: number | null;
      durationSec: number | null;
      fileName: string;
      title: string;
      billingConfigKey: string;
      billingDescription: string;
      billingDefaultPrice: number;
      idempotencyKey: string;
    },
  ): Promise<void> {
    const key = `video/${job.id}.mp4`;
    const stored = await this.storage.put(key, buffer, 'video/mp4');
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: stored.key,
        url: stored.url,
        fileName: opts.fileName,
        mimeType: 'video/mp4',
        size: buffer.length,
        width: opts.width,
        height: opts.height,
        duration: opts.durationSec,
        source: MediaSource.AI_GENERATED,
        // 溯源到视频任务而非 AIOperation(视频链路独立于 ai 模块)
        sourceRef: `videoJob:${job.id}`,
        prompt: job.prompt,
        title: opts.title,
        ownerId: job.userId,
        // 视频不走视觉打标(图片专用),保持 NONE 不触发 tagging 队列
        tagStatus: 'NONE',
      },
    });
    await this.prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { status: 'SUCCEEDED', resultAssetId: asset.id },
    });
    await this.deductBilling(job, opts);
    // ES 索引 fail-open(warn-only),与媒体库上传路径行为一致;
    // 不发 media.asset.created 事件 —— 那会触发图片打标队列
    try {
      await this.search.indexAsset(asset.id);
    } catch (err) {
      this.logger.warn(
        `视频资产 ES 索引失败 ${asset.id}: ${(err as Error)?.message ?? err}`,
      );
    }
    this.logger.log(`任务 ${job.id} 完成: asset=${asset.id} url=${stored.url}`);
  }

  /** cron 兜底:推进滞留任务 + 清理僵尸(由 VideoJobScheduler 调用) */
  async sweep(): Promise<void> {
    if (!this.enabled) return;
    const active = await this.prisma.videoGenerationJob.findMany({
      where: {
        status: {
          in: [
            'PENDING',
            'SCRIPTING',
            'STORYBOARDING',
            'ASSETS_GENERATING',
            'VOICE_SYNTHESIZING',
            'COMPOSING',
          ],
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    });
    for (const job of active) {
      await this.advance(job.id).catch((err) =>
        this.logger.warn(
          `兜底推进 ${job.id} 失败: ${(err as Error)?.message ?? err}`,
        ),
      );
    }

    // 上传/合成阶段僵尸(进程崩溃于下载/转存/渲染中)→ 置 FAILED,用户重试
    const staleUploads = await this.prisma.videoGenerationJob.updateMany({
      where: {
        status: 'UPLOADING',
        updatedAt: { lt: new Date(Date.now() - UPLOAD_STALE_MS) },
      },
      data: {
        status: 'FAILED',
        failedStep: 'upload',
        error: '上传/合成中断(进程重启),请重试',
      },
    });
    if (staleUploads.count) {
      this.logger.warn(`清理上传僵尸任务 ${staleUploads.count} 个`);
    }
  }

  private parseStoryboardCheckpoint(job: VideoGenerationJob): Storyboard {
    const sb = safeJsonParse<Storyboard | null>(job.storyboard, null);
    if (!sb || !Array.isArray(sb.scenes)) {
      throw new Error('缺分镜 checkpoint');
    }
    return sb;
  }

  private ratioDims(ratio: string): { w: number; h: number } {
    switch (ratio) {
      case '16:9':
        return { w: 1920, h: 1080 };
      case '1:1':
        return { w: 1080, h: 1080 };
      default:
        return { w: 1080, h: 1920 };
    }
  }

  private async estimateL2Cost(): Promise<number> {
    const cfg = await this.billing
      .getConfig('ai_video_per_compose')
      .catch(() => null);
    return cfg?.unitPrice ?? 8.0;
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

  private async deductBilling(
    job: VideoGenerationJob,
    opts: {
      billingConfigKey: string;
      billingDescription: string;
      billingDefaultPrice: number;
      idempotencyKey: string;
    },
  ): Promise<void> {
    if (!this.billing.isEnabled()) return;
    try {
      const cfg = await this.billing
        .getConfig(opts.billingConfigKey)
        .catch(() => null);
      const unitPrice = cfg?.unitPrice ?? opts.billingDefaultPrice;
      if (unitPrice <= 0) return;
      await this.billing.deduct({
        userId: job.userId,
        type: TransactionType.AI_VIDEO,
        category: BillingCategory.AI,
        amount: unitPrice,
        description: opts.billingDescription,
        quantity: 1,
        unitPrice,
        idempotencyKey: opts.idempotencyKey,
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
      .flatMap((j) => [j.resultAssetId, j.lastFrameAssetId])
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
        j.lastFrameAssetId ? (urlById.get(j.lastFrameAssetId) ?? null) : null,
      ),
    );
  }

  private toVo(
    job: VideoGenerationJob,
    resultUrl: string | null,
    lastFrameUrl: string | null = null,
  ): VideoJobVo {
    return { ...job, resultUrl, lastFrameUrl };
  }
}
