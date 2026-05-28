import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleProvider } from './openai-compatible.provider';

/**
 * OpenAI provider — official OpenAI API at api.openai.com.
 * Default model: gpt-4o.
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly providerName = 'openai';

  constructor(config: ConfigService) {
    super(
      config.get<string>('OPENAI_API_KEY') || '',
      config.get<string>('OPENAI_API_BASE') || 'https://api.openai.com/v1',
      config.get<string>('OPENAI_MODEL') || 'gpt-4o',
    );
  }
}
