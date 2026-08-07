import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { SearchModule } from '../search/search.module';
import { createVideoGenProvider } from './providers/video-gen/video-gen-provider.factory';
import { VIDEO_GEN_PROVIDER } from './providers/video-gen/video-gen-provider.interface';
import { VideoJobController } from './video-job.controller';
import { VideoJobScheduler } from './video-job.scheduler';
import { VideoJobService } from './video-job.service';

/**
 * 文生视频模块(PRD: docs/PRD-text-to-video.md)。
 * 自包含:不 import 文章/auto-publish 的过程逻辑;
 * 底层能力(Prisma/Storage 全局、Billing、Search)经模块注入共用。
 * 功能开关 VIDEO_GENERATION_ENABLED + VIDEO_CLIP_PROVIDER,未配置时整体降级关闭。
 */
@Module({
  imports: [BillingModule, SearchModule],
  controllers: [VideoJobController],
  providers: [
    {
      provide: VIDEO_GEN_PROVIDER,
      useFactory: createVideoGenProvider,
      inject: [ConfigService],
    },
    VideoJobService,
    VideoJobScheduler,
  ],
})
export class VideoModule {}
