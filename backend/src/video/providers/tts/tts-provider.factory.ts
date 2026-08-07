import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import { MinimaxTtsProvider } from './minimax-tts.provider';
import { TtsProvider } from './tts-provider.interface';
import { VolcengineTtsProvider } from './volcengine-tts.provider';

/**
 * TTS provider 工厂(L2 稿件成片配音)。
 * 跟随 VIDEO_CLIP_PROVIDER 选择厂商;返回 null 表示凭证缺失 ——
 * 调用方据此把任务降级为「无配音模式」(画面 + 字幕,不阻塞成片)。
 */
export function createTtsProvider(config: ConfigService): TtsProvider | null {
  const name = (config.get<string>('VIDEO_CLIP_PROVIDER') || '').toLowerCase();
  if (!name) return null;

  let provider: TtsProvider & { isConfigured(): boolean };
  switch (name as VideoGenProviderName) {
    case VideoGenProviderName.VOLCENGINE:
      provider = new VolcengineTtsProvider(config);
      break;
    case VideoGenProviderName.MINIMAX:
      provider = new MinimaxTtsProvider(config);
      break;
    default:
      return null;
  }
  return provider.isConfigured() ? provider : null;
}
