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
  resolution?: '768P' | '1080P';
  aspectRatio?: '16:9' | '9:16' | '1:1';
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
  submit(req: VideoGenSubmitRequest): Promise<VideoGenTaskHandle>;
  poll(taskId: string): Promise<VideoGenPollResult>;
  /** 单条片段估算成本(人民币元,用于任务发起前展示;实际扣费以计费配置为准) */
  estimateCost(req: VideoGenSubmitRequest): number;
}

export const VIDEO_GEN_PROVIDER = Symbol('VIDEO_GEN_PROVIDER');
