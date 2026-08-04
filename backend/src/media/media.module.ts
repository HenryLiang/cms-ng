import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaTaggingService } from './tagging/media-tagging.service';
import { MediaTaggingScheduler } from './tagging/media-tagging.scheduler';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { SearchModule } from '../search/search.module';

@Module({
  // AIModule: 提供 CHAT_VISION_PROVIDER(视觉链路,与文本隔离)+ AIOperationLogger
  // BillingModule: 提供 BillingService(预检/实扣公开 API)
  // SearchModule: 提供 SearchService(ES 全文检索,未启用/降级时检索回退 LIKE)
  imports: [AIModule, BillingModule, SearchModule],
  controllers: [MediaController],
  providers: [MediaService, MediaTaggingService, MediaTaggingScheduler],
  exports: [MediaService, MediaTaggingService],
})
export class MediaModule {}
