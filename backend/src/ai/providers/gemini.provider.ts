import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAICompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class GeminiProvider extends OpenAICompatibleProvider {
  readonly providerName = 'gemini';

  constructor(config: ConfigService) {
    const apiBase = (
      config.get<string>('GEMINI_API_BASE') ||
      'https://generativelanguage.googleapis.com/v1beta/openai'
    ).replace(/\/+$/, '');

    super(
      config.get<string>('GEMINI_API_KEY') || '',
      apiBase,
      config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash',
    );
  }
}
