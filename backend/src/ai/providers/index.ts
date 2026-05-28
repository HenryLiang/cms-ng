export type {
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionUsage,
  ChatCompletionProvider,
} from './chat-completion.interface';
export { OpenAICompatibleProvider } from './openai-compatible.provider';
export { DeepSeekProvider } from './deepseek.provider';
export { KimiProvider } from './kimi.provider';
export { OpenAIProvider } from './openai.provider';

/** DI token for the active chat completion provider */
export const CHAT_PROVIDER = 'CHAT_PROVIDER';
