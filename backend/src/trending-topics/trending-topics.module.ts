import { Module } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { TrendingTopicsController } from './trending-topics.controller';
import { AIModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { TwitterService } from './twitter.service';
import { WikipediaService } from './wikipedia.service';
import { RssTopicSourceAdapter } from './sources/rss-topic-source.adapter';
import { GoogleTrendsRealtimeAdapter } from './sources/google-trends-realtime.topic-source.adapter';
import { NewsnowTopicSourceAdapter } from './sources/newsnow/newsnow.topic-source.adapter';
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
    GoogleTrendsRealtimeAdapter,
    NewsnowTopicSourceAdapter,
    {
      provide: TOPIC_SOURCE_ADAPTERS,
      useFactory: (
        rss: RssTopicSourceAdapter,
        twitter: TwitterService,
        wikipedia: WikipediaService,
        googleTrendsRealtime: GoogleTrendsRealtimeAdapter,
        newsnow: NewsnowTopicSourceAdapter,
      ) => [rss, twitter, wikipedia, googleTrendsRealtime, newsnow],
      inject: [
        RssTopicSourceAdapter,
        TwitterService,
        WikipediaService,
        GoogleTrendsRealtimeAdapter,
        NewsnowTopicSourceAdapter,
      ],
    },
    TopicSourceCatalog,
  ],
  exports: [TopicSourceCatalog],
})
export class TrendingTopicsModule {}
