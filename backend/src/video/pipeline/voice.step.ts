import { Logger } from '@nestjs/common';
import type { VideoGenerationJob } from '@prisma/client';
import { VideoPipelineDeps } from './pipeline-deps';
import { Storyboard } from './storyboard.types';

/** 中文口播约 4.5 字/秒;TTS 未返回时长时按文本长度估算 */
const EST_MS_PER_CHAR = 1000 / 4.5;

/**
 * 配音 step:逐镜 TTS → 转存 COS,词级时间戳写入 scene.voice(字幕用)。
 * 凭证未配置(tts=null)时整体跳过 —— 任务降级为无配音模式(画面 + 字幕),
 * 由编排层在任务上记录 ttsProvider='none'。单镜 TTS 失败抛错(可重试,幂等续跑)。
 */
export class VoiceStep {
  private readonly logger = new Logger(VoiceStep.name);

  constructor(private readonly deps: VideoPipelineDeps) {}

  async run(job: VideoGenerationJob, storyboard: Storyboard): Promise<void> {
    if (!this.deps.tts) return;
    for (const scene of storyboard.scenes) {
      if (scene.voice?.audioUrl) continue;
      const result = await this.deps.tts.synthesize({ text: scene.narration });
      const key = `video/${job.id}/voice-${scene.index}.mp3`;
      const stored = await this.deps.storage.put(
        key,
        result.audio,
        'audio/mpeg',
      );
      const durationMs =
        result.durationMs > 0
          ? result.durationMs
          : Math.round(scene.narration.length * EST_MS_PER_CHAR);
      scene.voice = {
        audioUrl: stored.url,
        durationMs,
        wordTimestamps: result.wordTimestamps,
      };
      this.logger.log(
        `任务 ${job.id} 第 ${scene.index} 镜配音完成:${durationMs}ms` +
          `${result.wordTimestamps ? '(含词级时间戳)' : '(无时间戳,字幕按句均摊)'}`,
      );
    }
  }

  /** 供编排层判断:TTS 是否可用 */
  get available(): boolean {
    return this.deps.tts != null;
  }
}
