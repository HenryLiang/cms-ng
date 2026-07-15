import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { AIToolsService } from './tools/ai-tools.service';
import { TavilySearchTool } from './tools/tavily-search.tool';
import {
  CHAT_PROVIDER,
  ChatCompletionProvider,
  DeepSeekProvider,
  KimiProvider,
  OpenAIProvider,
} from './providers';
import { BillingModule } from '../billing/billing.module';
import { AuthorStyleModule } from '../authors/author-style.module';
import { AIOperationLogger } from '../common/ai-operation-logger';

const chatProviderFactory = {
  provide: CHAT_PROVIDER,
  useFactory: (config: ConfigService): ChatCompletionProvider => {
    const provider = (
      config.get<string>('AI_PROVIDER') || 'deepseek'
    ).toLowerCase();
    switch (provider) {
      case 'kimi':
        return new KimiProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'deepseek':
      default:
        return new DeepSeekProvider(config);
    }
  },
  inject: [ConfigService],
};

@Module({
  imports: [BillingModule, AuthorStyleModule],
  providers: [
    chatProviderFactory,
    AIService,
    AIToolsService,
    TavilySearchTool,
    AIOperationLogger,
  ],
  exports: [AIService, AIToolsService, AIOperationLogger],
})
export class AIModule {}
