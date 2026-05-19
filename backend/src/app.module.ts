import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StoriesModule } from './stories/stories.module';
import { ArticlesModule } from './articles/articles.module';
import { AIModule } from './ai/ai.module';
import { TrendingTopicsModule } from './trending-topics/trending-topics.module';
import { ChannelsModule } from './channels/channels.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    StoriesModule,
    ArticlesModule,
    AIModule,
    TrendingTopicsModule,
    ChannelsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
