import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv, formatValidationErrors } from './config/env.validation';
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
import { BillingModule } from './billing/billing.module';
import { AuthorStyleModule } from './authors/author-style.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Validate critical env vars at boot. Fail fast with a readable message
      // instead of mysterious runtime errors when something is missing.
      validate: (rawEnv) => {
        const result = validateEnv(rawEnv);
        if (!result.success) {
          console.error(formatValidationErrors(result.errors));
          // Throwing here causes NestFactory.create to reject; the message
          // is already printed above so users see a clean error.
          throw new Error('Invalid environment configuration');
        }
        return result.data as Record<string, unknown>;
      },
    }),
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
    BillingModule,
    AuthorStyleModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
