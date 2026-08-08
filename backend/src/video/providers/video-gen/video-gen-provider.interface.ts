import { VideoGenProviderName } from '@cms-ng/shared';

/**
 * 文生视频 provider seam(PRD: docs/PRD-text-to-video.md §6)。
 * 多媒体生成与文本 LLM(ChatCompletionProvider)完全隔离:独立 env、独立 DI token。
 *
 * 统一异步契约:submit → poll(调用方负责推进与超时治理);
 * succeeded 返回的 videoUrl 是 provider 侧临时 URL(MiniMax 仅 9h 有效),
 * 调用方必须立即下载转存 COS。
 */

/**
 * 多模态参考物角色(Seedance 2.x content 数组 role;PRD §18)。
 * first_frame/last_frame:首尾帧补间;reference_image/video/audio:多模态参考。
 */
export type VideoReferenceRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

export interface VideoReference {
  role: VideoReferenceRole;
  /** 公网可直达 URL(媒体库 COS 地址或外部 https) */
  url: string;
}

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
  /**
   * 多模态参考物(仅 L1;Seedance 2.x 全角色,1.x 仅 first_frame,
   * MiniMax 仅 first_frame_image)。数量/组合约束在 service 层校验。
   * firstFrameUrl 与 references 中的 first_frame 等价,references 优先。
   */
  references?: VideoReference[];
  /** 随机种子(Seedance 2.x):相同 seed 可复现结果 */
  seed?: number;
  /** 草稿模式(Seedance 2.x):更快更便宜质量更低,用于打样 */
  draft?: boolean;
  /** 返回尾帧图 URL(Seedance 2.x):续拍链(上段尾帧=下段首帧) */
  returnLastFrame?: boolean;
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
  /** returnLastFrame=true 且成功时:尾帧图临时 URL(同样需立即转存) */
  lastFrameUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  error?: string;
}

/** provider 可选参数能力位(service 层据此做提交前校验,frontend 据此 gating) */
export interface VideoGenParamCapabilities {
  /** 支持的多模态参考角色子集 */
  referenceRoles: VideoReferenceRole[];
  seed: boolean;
  draft: boolean;
  returnLastFrame: boolean;
  /**
   * 帧角色(first_frame/last_frame)与参考角色(reference_image/video/audio)互斥
   * (2026-08-08 Ark 400 实测:"first/last frame content cannot be mixed with
   * reference media content" —— 首尾帧补间与多模态参考是两种生成模式)
   */
  frameReferenceExclusive?: boolean;
}

export interface VideoGenProvider {
  readonly name: VideoGenProviderName;
  /**
   * 是否支持原生音频生成(generate_audio)。L2 据此决策配音通道:
   * 支持原生音频时视频镜用原生配音;不支持则成片无配音(纯字幕降级)。
   */
  readonly supportsNativeAudio?: boolean;
  /** 可选参数能力位;缺省视为仅 first_frame、无 seed/draft/尾帧 */
  readonly paramCapabilities?: VideoGenParamCapabilities;
  submit(req: VideoGenSubmitRequest): Promise<VideoGenTaskHandle>;
  poll(taskId: string): Promise<VideoGenPollResult>;
  /** 单条片段估算成本(人民币元,用于任务发起前展示;实际扣费以计费配置为准) */
  estimateCost(req: VideoGenSubmitRequest): number;
}

export const VIDEO_GEN_PROVIDER = Symbol('VIDEO_GEN_PROVIDER');
