import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { AIToolsService } from './tools/ai-tools.service';
import { TavilySearchTool } from './tools/tavily-search.tool';
import {
  CHAT_PROVIDER,
  CHAT_VISION_PROVIDER,
  ChatCompletionProvider,
  createChatProvider,
  createVisionProvider,
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

/**
 * 视觉(多模态)链路,与文本 CHAT_PROVIDER 完全隔离。
 * 未配置 AI_VISION_PROVIDER / AI_VISION_MODEL 时注入 null ——
 * 由消费方(MediaTaggingService)降级关闭打标功能。
 */
const visionProviderFactory = {
  provide: CHAT_VISION_PROVIDER,
  useFactory: (config: ConfigService): ChatCompletionProvider | null =>
    createVisionProvider(config),
  inject: [ConfigService],
};

@Module({
  imports: [BillingModule, AuthorStyleModule],
  providers: [
    chatProviderFactory,
    visionProviderFactory,
    AIService,
    AIToolsService,
    TavilySearchTool,
    AIOperationLogger,
  ],
  exports: [AIService, AIToolsService, AIOperationLogger, CHAT_VISION_PROVIDER],
})
export class AIModule {}
