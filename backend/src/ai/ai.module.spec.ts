import { ConfigService } from '@nestjs/config';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { KimiProvider } from './providers/kimi.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { ChatCompletionProvider } from './providers';

/**
 * Replicate the factory logic from ai.module.ts to test it in isolation.
 * This avoids Nest DI container complexity while testing the same logic.
 */
function createChatProvider(envMap: Record<string, string | undefined>): ChatCompletionProvider {
  const config = {
    get: jest.fn((key: string) => envMap[key]),
  } as unknown as ConfigService;

  const provider = (config.get<string>('AI_PROVIDER') || 'deepseek').toLowerCase();
  switch (provider) {
    case 'kimi':
      return new KimiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'deepseek':
    default:
      return new DeepSeekProvider(config);
  }
}

describe('AIModule — Provider Factory', () => {
  describe('provider selection', () => {
    it('should create DeepSeekProvider when AI_PROVIDER=deepseek', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'deepseek' });
      expect(provider).toBeInstanceOf(DeepSeekProvider);
      expect(provider.providerName).toBe('deepseek');
    });

    it('should create KimiProvider when AI_PROVIDER=kimi', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'kimi' });
      expect(provider).toBeInstanceOf(KimiProvider);
      expect(provider.providerName).toBe('kimi');
    });

    it('should create OpenAIProvider when AI_PROVIDER=openai', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'openai' });
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.providerName).toBe('openai');
    });

    it('should default to DeepSeekProvider when AI_PROVIDER is not set', () => {
      const provider = createChatProvider({});
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });

    it('should fall back to DeepSeekProvider for invalid AI_PROVIDER value', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'gemini' });
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });

    it('should fall back to DeepSeekProvider for empty string AI_PROVIDER', () => {
      const provider = createChatProvider({ AI_PROVIDER: '' });
      // '' is falsy, so || 'deepseek' kicks in
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });

    it('should be case-insensitive for AI_PROVIDER value', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'KIMI' });
      expect(provider).toBeInstanceOf(KimiProvider);
    });

    it('should handle mixed case AI_PROVIDER', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'DeepSeek' });
      expect(provider).toBeInstanceOf(DeepSeekProvider);
    });
  });

  describe('model configuration', () => {
    it('should read DeepSeek model from environment', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'deepseek',
        DEEPSEEK_MODEL: 'deepseek-reasoner',
      });
      expect(provider.model).toBe('deepseek-reasoner');
    });

    it('should use default DeepSeek model when not configured', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'deepseek' });
      expect(provider.model).toBe('deepseek-v4-pro');
    });

    it('should read Kimi model from environment', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'kimi',
        KIMI_MODEL: 'kimi-k2.6',
      });
      expect(provider.model).toBe('kimi-k2.6');
    });

    it('should use default Kimi model when not configured', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'kimi' });
      expect(provider.model).toBe('kimi-for-coding');
    });

    it('should read OpenAI model from environment', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'openai',
        OPENAI_MODEL: 'gpt-4o-mini',
      });
      expect(provider.model).toBe('gpt-4o-mini');
    });

    it('should use default OpenAI model when not configured', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'openai' });
      expect(provider.model).toBe('gpt-4o');
    });
  });

  describe('provider-specific behavior', () => {
    it('should force temperature=1 for kimi-k2.6 model', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'kimi',
        KIMI_MODEL: 'kimi-k2.6',
      }) as KimiProvider;

      // kimi-k2.6 forces temperature=1 via defaultTemperature
      expect((provider as any).defaultTemperature).toBe(1);
      expect((provider as any).resolveTemperature(0.5)).toBe(1);
    });

    it('should not force temperature for non-k2.6 Kimi models', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'kimi',
        KIMI_MODEL: 'kimi-for-coding',
      }) as KimiProvider;

      expect((provider as any).defaultTemperature).toBeUndefined();
      expect((provider as any).resolveTemperature(0.5)).toBe(0.5);
    });

    it('should use caller temperature for DeepSeek', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'deepseek' }) as DeepSeekProvider;

      expect((provider as any).defaultTemperature).toBeUndefined();
      expect((provider as any).resolveTemperature(0.3)).toBe(0.3);
    });

    it('should default to 0.7 when no temperature specified', () => {
      const provider = createChatProvider({ AI_PROVIDER: 'deepseek' }) as DeepSeekProvider;
      expect((provider as any).resolveTemperature(undefined)).toBe(0.7);
    });
  });

  describe('API configuration', () => {
    it('should use custom DeepSeek API base', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'deepseek',
        DEEPSEEK_API_BASE: 'https://custom.deepseek.com',
      }) as DeepSeekProvider;

      expect((provider as any).apiBase).toBe('https://custom.deepseek.com');
    });

    it('should use custom OpenAI API base', () => {
      const provider = createChatProvider({
        AI_PROVIDER: 'openai',
        OPENAI_API_BASE: 'https://custom.openai.com/v1',
      }) as OpenAIProvider;

      expect((provider as any).apiBase).toBe('https://custom.openai.com/v1');
    });
  });
});
