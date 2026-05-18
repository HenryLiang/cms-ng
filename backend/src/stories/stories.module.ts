import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { AIModule } from '../ai/ai.module';
import { ArticlesModule } from '../articles/articles.module';

@Module({
  imports: [AIModule, ArticlesModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
