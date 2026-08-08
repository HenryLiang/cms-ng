import { VideoGenProviderName } from '@cms-ng/shared';

/** 图片生成请求(视频管道分镜图卡片/降级素材) */
export interface ImageGenRequest {
  prompt: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface ImageGenProvider {
  readonly name: VideoGenProviderName;
  /**
   * 同步生成一张图片,返回 provider 侧临时 URL。
   * 调用方负责立即下载转存 COS(临时 URL 有时效)。
   */
  generate(req: ImageGenRequest): Promise<{ imageUrl: string }>;
}

export const IMAGE_GEN_PROVIDER = 'IMAGE_GEN_PROVIDER';
