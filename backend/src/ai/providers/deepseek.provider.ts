import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleProvider } from './openai-compatible.provider';

/**
 * DeepSeek provider — OpenAI-compatible API at api.deepseek.com.
 * Default model: deepseek-v4-pro. Also supports deepseek-chat (V3) and deepseek-reasoner (R1).
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly providerName = 'deepseek';

  constructor(config: ConfigService) {
    super(
      config.get<string>('DEEPSEEK_API_KEY') || '',
      config.get<string>('DEEPSEEK_API_BASE') || 'https://api.deepseek.com',
      config.get<string>('DEEPSEEK_MODEL') || 'deepseek-v4-pro',
    );
  }
}
