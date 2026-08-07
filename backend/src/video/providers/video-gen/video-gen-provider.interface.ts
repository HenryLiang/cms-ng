import { VideoGenProviderName } from '@cms-ng/shared';

/**
 * 文生视频 provider seam(PRD: docs/PRD-text-to-video.md §6)。
 * 多媒体生成与文本 LLM(ChatCompletionProvider)完全隔离:独立 env、独立 DI token。
 *
 * 统一异步契约:submit → poll(调用方负责推进与超时治理);
 * succeeded 返回的 videoUrl 是 provider 侧临时 URL(MiniMax 仅 9h 有效),
 * 调用方必须立即下载转存 COS。
 */

export interface VideoGenSubmitRequest {
  prompt: string;
  /** 图生视频首帧(P0 文生视频不用,P1 预留) */
  firstFrameUrl?: string;
  durationSec?: number;
  /** 480P 仅 Seedance 2.x 原生支持;其他 provider/版本映射到就近档(768p/720p) */
  resolution?: '480P' | '768P' | '1080P';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /**
   * 原生音频(Seedance 1.5+/2.x 支持):true 时同一次生成产出有声视频
   * (对白/音效/配乐,音素级口型同步)。provider 不支持时静默忽略。
   */
  generateAudio?: boolean;
}

export interface VideoGenTaskHandle {
  taskId: string;
}

export type VideoGenTaskState =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed';

export interface VideoGenPollResult {
  state: VideoGenTaskState;
  /** succeeded 时必填:provider 侧临时下载 URL(有时效,需立即转存) */
  videoUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  error?: string;
}

export interface VideoGenProvider {
  readonly name: VideoGenProviderName;
  /**
   * 是否支持原生音频生成(generate_audio)。L2 据此决策:
   * 无 TTS 且片段 provider 支持原生音频时,视频镜用原生配音替代 TTS 旁白。
   */
  readonly supportsNativeAudio?: boolean;
  submit(req: VideoGenSubmitRequest): Promise<VideoGenTaskHandle>;
  poll(taskId: string): Promise<VideoGenPollResult>;
  /** 单条片段估算成本(人民币元,用于任务发起前展示;实际扣费以计费配置为准) */
  estimateCost(req: VideoGenSubmitRequest): number;
}

export const VIDEO_GEN_PROVIDER = Symbol('VIDEO_GEN_PROVIDER');
