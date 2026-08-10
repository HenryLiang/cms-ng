import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { AIModule } from '../ai/ai.module';
import { ArticleAccessService } from '../common/article-access.service';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [AIModule, SearchModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticleAccessService],
  exports: [ArticlesService, ArticleAccessService],
})
export class ArticlesModule {}
