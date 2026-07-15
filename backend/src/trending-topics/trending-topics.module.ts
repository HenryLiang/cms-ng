import { Module } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { TrendingTopicsController } from './trending-topics.controller';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { TwitterService } from './twitter.service';
import { WikipediaService } from './wikipedia.service';
import { RssTopicSourceAdapter } from './sources/rss-topic-source.adapter';
import {
  TOPIC_SOURCE_ADAPTERS,
  TopicSourceCatalog,
} from './sources/topic-source.catalog';

@Module({
  imports: [AIModule, BillingModule],
  controllers: [TrendingTopicsController],
  providers: [
    TrendingTopicsService,
    TwitterService,
    WikipediaService,
    RssTopicSourceAdapter,
    {
      provide: TOPIC_SOURCE_ADAPTERS,
      useFactory: (
        rss: RssTopicSourceAdapter,
        twitter: TwitterService,
        wikipedia: WikipediaService,
      ) => [rss, twitter, wikipedia],
      inject: [RssTopicSourceAdapter, TwitterService, WikipediaService],
    },
    TopicSourceCatalog,
  ],
  exports: [TopicSourceCatalog],
})
export class TrendingTopicsModule {}
