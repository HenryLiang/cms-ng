import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import { ImageGenProvider } from './image-gen-provider.interface';
import { MinimaxImageProvider } from './minimax-image.provider';
import { VolcengineSeedreamProvider } from './volcengine-seedream.provider';

/**
 * 图片生成 provider 工厂(视频管道分镜素材专用)。
 * 跟随 VIDEO_CLIP_PROVIDER 选择(多媒体 provider 按厂商对齐,配置面最小);
 * 返回 null 表示对应 key 缺失 —— 调用方降级:分镜图卡片不可用 → 任务在素材步失败并提示。
 */
export function createImageGenProvider(
  config: ConfigService,
): ImageGenProvider | null {
  const name = (config.get<string>('VIDEO_CLIP_PROVIDER') || '').toLowerCase();
  if (!name) return null;

  let provider: ImageGenProvider & { isConfigured(): boolean };
  switch (name as VideoGenProviderName) {
    case VideoGenProviderName.VOLCENGINE:
      provider = new VolcengineSeedreamProvider(config);
      break;
    case VideoGenProviderName.MINIMAX:
      provider = new MinimaxImageProvider(config);
      break;
    default:
      return null;
  }
  return provider.isConfigured() ? provider : null;
}
