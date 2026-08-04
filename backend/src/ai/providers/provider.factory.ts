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

/** 支持视觉的 provider(deepseek 官方 API 纯文本,无视觉能力) */
export const VISION_CAPABLE_PROVIDERS = ['gemini', 'kimi', 'openai'] as const;
export type VisionProviderName = (typeof VISION_CAPABLE_PROVIDERS)[number];

/** 后台打标 worker 的超时(不复用 provider 默认 300s;kimi 带 reasoning 实测 ~40s,留余量至 2 分钟) */
export const VISION_REQUEST_TIMEOUT_MS = 120_000;

/**
 * 视觉(多模态)链路独立工厂 —— 与文本 CHAT_PROVIDER 完全隔离(硬性要求):
 * 独立的 AI_VISION_PROVIDER / AI_VISION_MODEL / AI_VISION_API_BASE 配置,
 * 不设跟随 AI_PROVIDER 的默认值。
 *
 * 返回 null 表示未配置(或配置不受支持)——调用方据此整体关闭打标功能
 * (降级,warn 日志),不影响应用启动与文本 AI 链路。
 */
export function createVisionProvider(
  config: ConfigService,
): ChatCompletionProvider | null {
  const provider = (
    config.get<string>('AI_VISION_PROVIDER') || ''
  ).toLowerCase();
  if (!provider) return null;

  const overrides = {
    // 必填:不设默认模型,避免误用无视觉能力的文本默认模型
    model: config.get<string>('AI_VISION_MODEL'),
    // 可选:vision 端点与文本端点不同(如 Kimi 标准端点 vs coding 端点)时显式指定
    apiBase: config.get<string>('AI_VISION_API_BASE') || undefined,
    requestTimeoutMs: VISION_REQUEST_TIMEOUT_MS,
  };
  if (!overrides.model) return null;

  switch (provider as VisionProviderName) {
    case 'gemini':
      return new GeminiProvider(config, overrides);
    case 'kimi':
      return new KimiProvider(config, overrides);
    case 'openai':
      return new OpenAIProvider(config, overrides);
    default:
      // deepseek 及非法值:env.validation 只做格式校验,此处静默走降级
      return null;
  }
}
