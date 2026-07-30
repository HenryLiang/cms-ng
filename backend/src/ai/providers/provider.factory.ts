import { ConfigService } from '@nestjs/config';
import { ChatCompletionProvider } from './chat-completion.interface';
import { DeepSeekProvider } from './deepseek.provider';
import { GeminiProvider } from './gemini.provider';
import { KimiProvider } from './kimi.provider';
import { OpenAIProvider } from './openai.provider';

export function createChatProvider(
  config: ConfigService,
): ChatCompletionProvider {
  const provider = (
    config.get<string>('AI_PROVIDER') || 'deepseek'
  ).toLowerCase();

  switch (provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'kimi':
      return new KimiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'deepseek':
    default:
      return new DeepSeekProvider(config);
  }
}
