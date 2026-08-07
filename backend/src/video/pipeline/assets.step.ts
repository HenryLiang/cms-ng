import { Logger } from '@nestjs/common';
import type { VideoGenerationJob } from '@prisma/client';
import axios from 'axios';
import { VideoPipelineDeps } from './pipeline-deps';
import { Storyboard, StoryboardScene } from './storyboard.types';

const DOWNLOAD_TIMEOUT_MS = 180_000;
const MAX_ASSET_BYTES = 300 * 1024 * 1024;

/**
 * 素材 step:逐镜备料,checkpoint 落在 scenes[].asset 上(崩溃续跑不重复扣费)。
 *
 * - image:同步生成 → 立即下载转存 COS(临时 URL 有时效)
 * - video_clip:提交异步任务(submitted)→ 由 cron 逐 tick poll;成功转存 COS;
 *   失败按 scene.fallback 降级为该镜图卡片,不阻塞整条任务
 * - media_asset:直接引用媒体库已有素材 URL
 *
 * 每次 tick 做一遍推进,返回 done = 全部镜就绪。
 */
export class AssetsStep {
  private readonly logger = new Logger(AssetsStep.name);

  constructor(private readonly deps: VideoPipelineDeps) {}

  /** 返回 true 表示全部镜素材就绪;有镜彻底失败(含降级失败)则快速抛错 */
  async run(job: VideoGenerationJob, storyboard: Storyboard): Promise<boolean> {
    for (const scene of storyboard.scenes) {
      await this.advanceScene(job, storyboard.aspectRatio, scene);
    }
    const failed = storyboard.scenes.find((s) => s.asset?.status === 'failed');
    if (failed) {
      throw new Error(
        `第 ${failed.index + 1} 镜素材失败:${failed.asset?.error ?? '未知'}`,
      );
    }
    const pending = storyboard.scenes.filter((s) => s.asset?.status !== 'done');
    return pending.length === 0;
  }

  private async advanceScene(
    job: VideoGenerationJob,
    aspectRatio: Storyboard['aspectRatio'],
    scene: StoryboardScene,
  ): Promise<void> {
    const asset = scene.asset ?? { status: 'pending' as const };
    scene.asset = asset;
    if (asset.status === 'done') return;

    if (scene.visual.type === 'media_asset') {
      const ma = await this.deps.prisma.mediaAsset.findUnique({
        where: { id: scene.visual.mediaAssetId ?? '' },
        select: { url: true },
      });
      if (!ma) {
        asset.status = 'failed';
        asset.error = `媒体库素材不存在: ${scene.visual.mediaAssetId}`;
        return;
      }
      asset.url = ma.url;
      asset.status = 'done';
      return;
    }

    if (scene.visual.type === 'image') {
      await this.genImage(job.id, aspectRatio, scene, asset);
      return;
    }

    // video_clip
    if (asset.status === 'submitted' && asset.providerTaskId) {
      await this.pollVideo(job.id, aspectRatio, scene, asset);
      return;
    }
    await this.submitVideo(job.id, aspectRatio, scene, asset);
  }

  private async genImage(
    jobId: string,
    aspectRatio: Storyboard['aspectRatio'],
    scene: StoryboardScene,
    asset: NonNullable<StoryboardScene['asset']>,
  ): Promise<void> {
    if (!this.deps.imageGen) {
      asset.status = 'failed';
      asset.error = '图片生成 provider 未配置';
      return;
    }
    try {
      const { imageUrl } = await this.deps.imageGen.generate({
        prompt: scene.visual.prompt ?? scene.narration,
        aspectRatio,
      });
      asset.url = await this.transfer(
        imageUrl,
        `video/${jobId}/scene-${scene.index}.jpg`,
        'image/jpeg',
      );
      asset.status = 'done';
      delete asset.error;
    } catch (err) {
      asset.status = 'failed';
      asset.error = `图片生成失败: ${(err as Error)?.message ?? err}`;
      this.logger.warn(`任务 ${jobId} 第 ${scene.index} 镜 ${asset.error}`);
    }
  }

  private async submitVideo(
    jobId: string,
    aspectRatio: Storyboard['aspectRatio'],
    scene: StoryboardScene,
    asset: NonNullable<StoryboardScene['asset']>,
  ): Promise<void> {
    if (!this.deps.videoGen) {
      await this.fallbackToImage(
        jobId,
        aspectRatio,
        scene,
        asset,
        '视频生成 provider 未配置',
      );
      return;
    }
    try {
      const handle = await this.deps.videoGen.submit({
        prompt: scene.visual.prompt ?? scene.narration,
        durationSec: Math.min(10, Math.max(2, scene.visual.durationHintSec)),
        resolution: '768P',
      });
      asset.providerTaskId = handle.taskId;
      asset.status = 'submitted';
      this.logger.log(
        `任务 ${jobId} 第 ${scene.index} 镜视频已提交: ${handle.taskId}`,
      );
    } catch (err) {
      await this.fallbackToImage(
        jobId,
        aspectRatio,
        scene,
        asset,
        `视频提交失败: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private async pollVideo(
    jobId: string,
    aspectRatio: Storyboard['aspectRatio'],
    scene: StoryboardScene,
    asset: NonNullable<StoryboardScene['asset']>,
  ): Promise<void> {
    if (!this.deps.videoGen || !asset.providerTaskId) return;
    let result;
    try {
      result = await this.deps.videoGen.poll(asset.providerTaskId);
    } catch (err) {
      // 单次轮询失败不置失败,等下一 tick
      this.logger.warn(
        `任务 ${jobId} 第 ${scene.index} 镜轮询异常: ${(err as Error)?.message ?? err}`,
      );
      return;
    }
    if (result.state === 'pending' || result.state === 'processing') return;
    if (result.state === 'failed' || !result.videoUrl) {
      await this.fallbackToImage(
        jobId,
        aspectRatio,
        scene,
        asset,
        result.error || 'provider 未返回视频 URL',
      );
      return;
    }
    try {
      asset.url = await this.transfer(
        result.videoUrl,
        `video/${jobId}/scene-${scene.index}.mp4`,
        'video/mp4',
      );
      asset.durationSec = result.durationSec;
      asset.status = 'done';
      delete asset.error;
    } catch (err) {
      await this.fallbackToImage(
        jobId,
        aspectRatio,
        scene,
        asset,
        `视频转存失败: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /** 视频镜失败降级为该镜图卡片(fallback='image'),不阻塞整条任务 */
  private async fallbackToImage(
    jobId: string,
    aspectRatio: Storyboard['aspectRatio'],
    scene: StoryboardScene,
    asset: NonNullable<StoryboardScene['asset']>,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `任务 ${jobId} 第 ${scene.index} 镜视频降级为图卡片:${reason}`,
    );
    scene.visual.type = 'image';
    asset.providerTaskId = undefined;
    // genImage 内部会设置 done/failed,无需预置状态
    await this.genImage(jobId, aspectRatio, scene, asset);
    if (asset.status === 'failed') {
      asset.error = `${reason};降级图卡片也失败:${asset.error}`;
    }
  }

  /** 临时 URL → COS 转存(provider URL 有时效,MiniMax 仅 9h) */
  private async transfer(
    tempUrl: string,
    key: string,
    contentType: string,
  ): Promise<string> {
    const resp = await axios.get<ArrayBuffer>(tempUrl, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_ASSET_BYTES,
    });
    const stored = await this.deps.storage.put(
      key,
      Buffer.from(resp.data),
      contentType,
    );
    return stored.url;
  }
}
