export type {
  ChatMessage,
  MessageContentPart,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionUsage,
  ChatCompletionProvider,
} from './chat-completion.interface';
export type { ProviderOverrides } from './provider-overrides';
export { OpenAICompatibleProvider } from './openai-compatible.provider';
export { DeepSeekProvider } from './deepseek.provider';
export { GeminiProvider } from './gemini.provider';
export { KimiProvider } from './kimi.provider';
export { OpenAIProvider } from './openai.provider';
export {
  createChatProvider,
  createVisionProvider,
  VISION_CAPABLE_PROVIDERS,
  VISION_REQUEST_TIMEOUT_MS,
} from './provider.factory';

/** DI token for the active chat completion provider (文本链路) */
export const CHAT_PROVIDER = 'CHAT_PROVIDER';
/** DI token for the vision-capable provider(多模态链路,与文本完全隔离;未配置时注入 null) */
export const CHAT_VISION_PROVIDER = 'CHAT_VISION_PROVIDER';
