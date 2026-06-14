import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { WordPressService } from './wordpress.service';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { ArticleAccessService } from '../common/article-access.service';

@Module({
  imports: [AIModule, BillingModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, WordPressService, ArticleAccessService],
  exports: [ChannelsService, WordPressService, ArticleAccessService],
})
export class ChannelsModule {}
