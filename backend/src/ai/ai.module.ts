import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { AIToolsService } from './tools/ai-tools.service';
import { TavilySearchTool } from './tools/tavily-search.tool';
import {
  CHAT_PROVIDER,
  ChatCompletionProvider,
  createChatProvider,
} from './providers';
import { BillingModule } from '../billing/billing.module';
import { AuthorStyleModule } from '../authors/author-style.module';
import { AIOperationLogger } from '../common/ai-operation-logger';

const chatProviderFactory = {
  provide: CHAT_PROVIDER,
  useFactory: (config: ConfigService): ChatCompletionProvider =>
    createChatProvider(config),
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
