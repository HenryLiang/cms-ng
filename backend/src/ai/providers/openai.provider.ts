import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import type { ProviderOverrides } from './provider-overrides';

/**
 * OpenAI provider — official OpenAI API at api.openai.com.
 * Default model: gpt-4o.
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly providerName = 'openai';

  constructor(config: ConfigService, overrides?: ProviderOverrides) {
    super(
      config.get<string>('OPENAI_API_KEY') || '',
      overrides?.apiBase ||
        config.get<string>('OPENAI_API_BASE') ||
        'https://api.openai.com/v1',
      overrides?.model || config.get<string>('OPENAI_MODEL') || 'gpt-4o',
      undefined,
      overrides?.requestTimeoutMs,
    );
  }
}
