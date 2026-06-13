import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { AIModule } from '../ai/ai.module';
import { ArticleAccessService } from '../common/article-access.service';

@Module({
  imports: [AIModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticleAccessService],
  exports: [ArticlesService, ArticleAccessService],
})
export class ArticlesModule {}
