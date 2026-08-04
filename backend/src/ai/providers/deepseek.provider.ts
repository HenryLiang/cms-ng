import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import type { ProviderOverrides } from './provider-overrides';

/**
 * DeepSeek provider — OpenAI-compatible API at api.deepseek.com.
 * Default model: deepseek-v4-pro. Also supports deepseek-chat (V3) and deepseek-reasoner (R1).
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly providerName = 'deepseek';

  constructor(config: ConfigService, overrides?: ProviderOverrides) {
    super(
      config.get<string>('DEEPSEEK_API_KEY') || '',
      overrides?.apiBase ||
        config.get<string>('DEEPSEEK_API_BASE') ||
        'https://api.deepseek.com',
      overrides?.model ||
        config.get<string>('DEEPSEEK_MODEL') ||
        'deepseek-v4-pro',
      undefined,
      overrides?.requestTimeoutMs,
    );
  }
}
