import { Logger } from '@nestjs/common';
import type { VideoGenerationJob } from '@prisma/client';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { VideoPipelineDeps } from './pipeline-deps';
import {
  Storyboard,
  StoryboardScene,
  sceneDurationSec,
} from './storyboard.types';
import {
  ComposeResult,
  ComposeSceneInput,
  SubtitleCue,
  buildAss,
  composeVideo,
  downloadToFile,
  hasAudioStream,
  probeDurationSec,
} from '../render/ffmpeg-compose';

/**
 * 合成 step:分镜 → 本地 FFmpeg 成片。
 *
 * 流程:建任务目录 → 下载各镜素材 → 原生音频模式的视频镜复用素材音轨并按
 * 实测时长定镜长(其余按时长 hint)→ 每镜整句字幕 cue → ffmpeg 拼接/混音/字幕。
 * 开关 VIDEO_RENDER_ENABLED;jobDir 用完即清(原料都可从 COS 重下)。
 */
/** prepareScene 产物:合成输入 + 关联的原始分镜(字幕 cue 需要 narration) */
type PreparedScene = ComposeSceneInput & { scene: StoryboardScene };

export class ComposeStep {
  private readonly logger = new Logger(ComposeStep.name);

  constructor(private readonly deps: VideoPipelineDeps) {}

  /**
   * 原生音频模式:片段 provider 支持原生音频(与 AssetsStep 同一判定)。
   * 仅该模式下视频镜才复用素材原生音轨 —— 无原生音频能力的 provider
   * (MiniMax/1.0)与 media_asset 有声素材按静音轨/时长 hint 处理。
   */
  private get nativeAudio(): boolean {
    return this.deps.videoGen?.supportsNativeAudio === true;
  }

  isEnabled(): boolean {
    return (
      (
        this.deps.config.get<string>('VIDEO_RENDER_ENABLED') || ''
      ).toLowerCase() === 'true'
    );
  }

  async run(
    job: VideoGenerationJob,
    storyboard: Storyboard,
  ): Promise<ComposeResult & { buffer: Buffer }> {
    if (!this.isEnabled()) {
      throw new Error('渲染未启用(VIDEO_RENDER_ENABLED!=true)');
    }
    const jobDir = path.join(os.tmpdir(), 'cms-ng-video', job.id);
    await fs.rm(jobDir, { recursive: true, force: true });
    await fs.mkdir(jobDir, { recursive: true });

    try {
      const scenes: PreparedScene[] = [];
      for (const scene of storyboard.scenes) {
        scenes.push(await this.prepareScene(jobDir, scene));
      }
      const cues = this.buildSubtitleCues(storyboard, scenes);
      const assContent = cues.length
        ? buildAss(cues, storyboard.aspectRatio)
        : undefined;

      const outputPath = path.join(jobDir, 'final.mp4');
      const result = await composeVideo({
        jobDir,
        scenes,
        assContent,
        aspectRatio: storyboard.aspectRatio,
        outputPath,
        ffmpegBin: this.deps.config.get<string>('FFMPEG_BIN') || undefined,
        ffprobeBin: this.deps.config.get<string>('FFPROBE_BIN') || undefined,
      });
      this.logger.log(
        `任务 ${job.id} 合成完成:${result.durationSec.toFixed(1)}s,字幕=${result.subtitleMode}`,
      );
      // 直接读出成片 Buffer(反正要整体 put 到 COS),调用方无需再碰文件系统
      const buffer = await fs.readFile(outputPath);
      return { ...result, buffer };
    } catch (err) {
      // 失败清理(成功路径由编排层上传后清理)
      await fs
        .rm(jobDir, { recursive: true, force: true })
        .catch(() => undefined);
      throw err;
    }
  }

  private async prepareScene(
    jobDir: string,
    scene: StoryboardScene,
  ): Promise<PreparedScene> {
    if (!scene.asset?.url) {
      throw new Error(`第 ${scene.index} 镜素材未就绪`);
    }
    const isVideo = scene.asset.url.endsWith('.mp4');
    const assetPath = path.join(
      jobDir,
      `scene-${scene.index}.${isVideo ? 'mp4' : 'jpg'}`,
    );
    await downloadToFile(scene.asset.url, assetPath);

    const ffprobeBin = this.deps.config.get<string>('FFPROBE_BIN') || undefined;
    let audioPath: string | undefined;
    let durationSec: number;
    if (isVideo && this.nativeAudio) {
      // 原生音频模式的视频镜:复用素材原生音轨(有声生成),
      // 时长取真实探测值,避免冻帧补齐截断原生音频
      const assetDuration = await probeDurationSec(assetPath, ffprobeBin);
      durationSec = assetDuration ?? sceneDurationSec(scene);
      if (await hasAudioStream(assetPath, ffprobeBin)) {
        audioPath = assetPath;
      }
    } else {
      durationSec = sceneDurationSec(scene);
    }
    return {
      assetPath,
      assetKind: isVideo ? 'video' : 'image',
      audioPath,
      durationSec,
      scene,
    };
  }

  /** 字幕 cue:原生音频无词级时间戳,每镜整句一个 cue(时间轴按真实镜长) */
  private buildSubtitleCues(
    storyboard: Storyboard,
    scenes: PreparedScene[],
  ): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    let offsetMs = 0;
    for (const { durationSec, scene } of scenes) {
      cues.push({
        text: scene.narration,
        beginMs: offsetMs,
        endMs: offsetMs + durationSec * 1000,
      });
      offsetMs += durationSec * 1000;
    }
    return cues;
  }

  /** 成功后清理任务目录 */
  async cleanup(jobId: string): Promise<void> {
    await fs
      .rm(path.join(os.tmpdir(), 'cms-ng-video', jobId), {
        recursive: true,
        force: true,
      })
      .catch(() => undefined);
  }
}
