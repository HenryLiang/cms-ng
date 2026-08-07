import { Logger } from '@nestjs/common';
import type { VideoGenerationJob } from '@prisma/client';
import { safeJsonParse } from '../../common/json.utils';
import { VideoPipelineDeps } from './pipeline-deps';
import { Storyboard, parseStoryboard } from './storyboard.types';

/**
 * 分镜 step:口播脚本 → 分镜 JSON(LLM + 手写契约校验)。
 * 契约失败(LLM 输出非法)带错误反馈重试一次,仍失败则抛错置任务 FAILED ——
 * 不做静默修复,避免掩盖 prompt 系统性偏差。
 */
export class StoryboardStep {
  private readonly logger = new Logger(StoryboardStep.name);

  constructor(private readonly deps: VideoPipelineDeps) {}

  async run(job: VideoGenerationJob, script: string): Promise<Storyboard> {
    const aspectRatio = job.aspectRatio ?? '9:16';
    // 原生音频模式(无 TTS 且片段 provider 支持有声生成):
    // 全部镜用 video_clip,旁白由视频模型原生生成;图片镜会静默,破坏旁白连续性
    const nativeAudio =
      !this.deps.tts && this.deps.videoGen?.supportsNativeAudio === true;
    const typeRule = nativeAudio
      ? 'type 全部用 "video_clip"(AI 有声视频片段,旁白由视频模型生成);'
      : 'type 优先用 "image"(AI 静帧图),只有动作感最强的 1~2 镜可用 "video_clip"(AI 视频片段,成本高);';
    // 原生音频模式:旁白由视频模型在片段时长内念出,字数与镜长必须容纳朗读
    const narrationRule = nativeAudio
      ? '每镜 narration 是脚本的一段连续原文(20~50 字,须能在该镜时长内念完),各镜顺序拼接必须覆盖完整脚本;'
      : '每镜 narration 是脚本的一段连续原文(30~80 字),各镜顺序拼接必须覆盖完整脚本;';
    const hintRule = nativeAudio
      ? 'durationHintSec 取 5~12(须容纳该镜旁白的朗读时长)。'
      : 'durationHintSec 取 4~8。';
    const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content:
          '你是短视频分镜师。把口播脚本切分成 3~6 个镜头,输出严格 JSON(不要 markdown 代码块)。' +
          'JSON 结构:{"title": string, "scenes": [{"narration": string, "visual": {' +
          '"type": "image"|"video_clip", "prompt": string, "durationHintSec": number}}]}。' +
          '规则:' +
          narrationRule +
          typeRule +
          'prompt 是该镜画面的中文生成提示词,要具体(主体/场景/光线/镜头感),不要出现人物可辨识的真实姓名;' +
          hintRule,
      },
      { role: 'user', content: `口播脚本:\n${script}` },
    ];

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const messages = [...baseMessages];
      if (lastError) {
        messages.push({
          role: 'user',
          content: `上次输出校验失败:${lastError.message}。请修正后重新输出完整 JSON。`,
        });
      }
      const resp = await this.deps.chat.chatCompletion({
        messages,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      });
      try {
        const rawJson = safeJsonParse<unknown>(resp.content, null);
        const parsed = parseStoryboard(rawJson, { aspectRatio, nativeAudio });
        if (nativeAudio) {
          const coerced = countNonVideoScenes(rawJson);
          if (coerced > 0) {
            this.logger.warn(
              `任务 ${job.id} 原生音频模式:${coerced} 个非视频镜被契约归一为 video_clip`,
            );
          }
        }
        this.logger.log(
          `任务 ${job.id} 分镜完成:${parsed.scenes.length} 镜(第 ${attempt + 1} 次尝试)`,
        );
        return parsed;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(
          `任务 ${job.id} 分镜契约校验失败(第 ${attempt + 1} 次): ${lastError.message}`,
        );
      }
    }
    throw new Error(`分镜契约校验连续失败:${lastError?.message ?? '未知'}`);
  }
}

/** 统计 LLM 原始输出中非 video_clip 的镜数(原生音频模式归一诊断用) */
function countNonVideoScenes(raw: unknown): number {
  const scenes = (raw as { scenes?: Array<{ visual?: { type?: string } }> })
    ?.scenes;
  if (!Array.isArray(scenes)) return 0;
  return scenes.filter((s) => s?.visual?.type !== 'video_clip').length;
}
