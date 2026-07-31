import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { MediaModule } from './media/media.module';

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
    // Global rate limiting (issue #107). Defaults: 100 req/min per IP;
    // auth endpoints override with tighter limits via @Throttle. Skipped in
    // NODE_ENV=test so Jest e2e (which hammers login/register) stays stable —
    // Jest sets NODE_ENV=test automatically.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL_MS')) || 60_000,
            limit: Number(config.get('THROTTLE_LIMIT')) || 100,
          },
        ],
        skipIf: () => (config.get('NODE_ENV') ?? 'development') === 'test',
      }),
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
    MediaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
