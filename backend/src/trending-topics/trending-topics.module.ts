import { Module } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { TrendingTopicsController } from './trending-topics.controller';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [TrendingTopicsController],
  providers: [TrendingTopicsService],
})
export class TrendingTopicsModule {}
