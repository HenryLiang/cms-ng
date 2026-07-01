import { Module } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { TrendingTopicsController } from './trending-topics.controller';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { TwitterService } from './twitter.service';

@Module({
  imports: [AIModule, BillingModule],
  controllers: [TrendingTopicsController],
  providers: [TrendingTopicsService, TwitterService],
})
export class TrendingTopicsModule {}
