import { Module } from '@nestjs/common';
import { AutoPublishController } from './auto-publish.controller';
import { AutoPublishService } from './auto-publish.service';
import { AutoPublishSchedulerService } from './auto-publish-scheduler.service';
import { PipelineService } from './pipeline/pipeline.service';
import { MemoryLockService } from './pipeline/memory-lock.service';
import { TopicCollectionStep } from './pipeline/steps/topic-collection.step';
import { ResearchStep } from './pipeline/steps/research.step';
import { ArticleGenerationStep } from './pipeline/steps/article-generation.step';
import { ImageGenerationStep } from './pipeline/steps/image-generation.step';
import { ArticleSaveStep } from './pipeline/steps/article-save.step';
import { PublishStep } from './pipeline/steps/publish.step';
import { NotificationStep } from './pipeline/steps/notification.step';
import { BillingCheckStep } from './pipeline/steps/billing-check.step';
import { AIModule } from '../ai/ai.module';
import { ChannelsModule } from '../channels/channels.module';
import { BillingModule } from '../billing/billing.module';

// ScheduleModule.forRoot() 已上移至 AppModule(媒体打标 cron 也依赖调度器,
// 统一注册一次,避免 auto-publish 模块被移除/懒加载时打标 cron 静默停火)
@Module({
  imports: [AIModule, ChannelsModule, BillingModule],
  controllers: [AutoPublishController],
  providers: [
    AutoPublishService,
    AutoPublishSchedulerService,
    PipelineService,
    MemoryLockService,
    BillingCheckStep,
    TopicCollectionStep,
    ResearchStep,
    ArticleGenerationStep,
    ImageGenerationStep,
    ArticleSaveStep,
    PublishStep,
    NotificationStep,
  ],
})
export class AutoPublishModule {}
