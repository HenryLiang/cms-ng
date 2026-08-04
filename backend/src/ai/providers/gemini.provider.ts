import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import type { ProviderOverrides } from './provider-overrides';

@Injectable()
export class GeminiProvider extends OpenAICompatibleProvider {
  readonly providerName = 'gemini';

  constructor(config: ConfigService, overrides?: ProviderOverrides) {
    const apiBase = (
      overrides?.apiBase ||
      config.get<string>('GEMINI_API_BASE') ||
      'https://generativelanguage.googleapis.com/v1beta/openai'
    ).replace(/\/+$/, '');

    super(
      config.get<string>('GEMINI_API_KEY') || '',
      apiBase,
      overrides?.model ||
        config.get<string>('GEMINI_MODEL') ||
        'gemini-3.6-flash',
      undefined,
      overrides?.requestTimeoutMs,
    );
  }
}
