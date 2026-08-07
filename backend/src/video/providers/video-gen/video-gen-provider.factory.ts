import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import { MinimaxHailuoProvider } from './minimax-hailuo.provider';
import { VideoGenProvider } from './video-gen-provider.interface';
import { VolcengineSeedanceProvider } from './volcengine-seedance.provider';

export const VALID_VIDEO_GEN_PROVIDERS = ['volcengine', 'minimax'] as const;

/**
 * 视频生成 provider 工厂 —— 与文本 CHAT_PROVIDER、视觉 AI_VISION_PROVIDER 同样隔离:
 * 独立的 VIDEO_CLIP_PROVIDER + 各家 API key 配置,不设跟随默认值。
 *
 * 返回 null 表示未配置/配置缺失对应 key —— 调用方据此整体关闭文生视频功能
 * (降级,warn 日志),不影响应用启动与其它 AI 链路。
 */
export function createVideoGenProvider(
  config: ConfigService,
): VideoGenProvider | null {
  const name = (config.get<string>('VIDEO_CLIP_PROVIDER') || '').toLowerCase();
  if (!name) return null;

  let provider: VideoGenProvider & { isConfigured(): boolean };
  switch (name as VideoGenProviderName) {
    case VideoGenProviderName.VOLCENGINE:
      provider = new VolcengineSeedanceProvider(config);
      break;
    case VideoGenProviderName.MINIMAX:
      provider = new MinimaxHailuoProvider(config);
      break;
    default:
      // 非法值:env.validation 只做格式校验,此处静默走降级
      return null;
  }
  return provider.isConfigured() ? provider : null;
}
