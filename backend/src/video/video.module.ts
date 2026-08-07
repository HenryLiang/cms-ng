import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { SearchModule } from '../search/search.module';
import { createImageGenProvider } from './providers/image-gen/image-gen-provider.factory';
import { IMAGE_GEN_PROVIDER } from './providers/image-gen/image-gen-provider.interface';
import { createTtsProvider } from './providers/tts/tts-provider.factory';
import { TTS_PROVIDER } from './providers/tts/tts-provider.interface';
import { createVideoGenProvider } from './providers/video-gen/video-gen-provider.factory';
import { VIDEO_GEN_PROVIDER } from './providers/video-gen/video-gen-provider.interface';
import { VideoJobController } from './video-job.controller';
import { VideoJobScheduler } from './video-job.scheduler';
import { VideoJobService } from './video-job.service';

/**
 * 文生视频模块(PRD: docs/PRD-text-to-video.md)。
 * 自包含:不 import 文章/auto-publish 的过程逻辑;
 * 底层能力(Prisma/Storage 全局、Billing、Search、AIModule 的 CHAT_PROVIDER LLM seam)
 * 经模块注入共用。TTS/图片 provider 缺凭证时注入 null,L2 对应能力降级(无配音/不可用)。
 * 功能开关 VIDEO_GENERATION_ENABLED + VIDEO_CLIP_PROVIDER,未配置时整体降级关闭;
 * 渲染(ffmpeg 合成)由 VIDEO_RENDER_ENABLED 独立开关。
 */
@Module({
  imports: [AIModule, BillingModule, SearchModule],
  controllers: [VideoJobController],
  providers: [
    {
      provide: VIDEO_GEN_PROVIDER,
      useFactory: createVideoGenProvider,
      inject: [ConfigService],
    },
    {
      provide: IMAGE_GEN_PROVIDER,
      useFactory: createImageGenProvider,
      inject: [ConfigService],
    },
    {
      provide: TTS_PROVIDER,
      useFactory: createTtsProvider,
      inject: [ConfigService],
    },
    VideoJobService,
    VideoJobScheduler,
  ],
})
export class VideoModule {}
