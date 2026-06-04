import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StoriesModule } from './stories/stories.module';
import { ArticlesModule } from './articles/articles.module';
import { AIModule } from './ai/ai.module';
import { TrendingTopicsModule } from './trending-topics/trending-topics.module';
import { ChannelsModule } from './channels/channels.module';
import { AutoPublishModule } from './auto-publish/auto-publish.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    RedisModule,
    AuthModule,
    UsersModule,
    StoriesModule,
    ArticlesModule,
    AIModule,
    TrendingTopicsModule,
    ChannelsModule,
    AutoPublishModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
