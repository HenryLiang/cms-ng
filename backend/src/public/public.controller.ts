import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { PublicService } from './public.service';
import { FindPublicArticlesDto } from './dto/find-public-articles.dto';

/**
 * Unauthenticated read-only API consumed by the newsweb reader site.
 * Everything here is published content only — see PublicService.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @Get('articles')
  @ApiOperation({
    summary: 'List published articles (public, paginated, filterable)',
  })
  findArticles(@Query() query: FindPublicArticlesDto) {
    return this.publicService.findArticles(query);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get a single published article (public)' })
  findArticle(@Param('id') id: string) {
    return this.publicService.findArticle(id);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Tag usage counts across published articles' })
  findTags() {
    return this.publicService.findTags();
  }

  @Get('stories')
  @ApiOperation({ summary: 'Stories (专题) that have published articles' })
  findStories() {
    return this.publicService.findStories();
  }

  @Get('stories/:id')
  @ApiOperation({ summary: 'Story detail with its published articles' })
  findStory(@Param('id') id: string) {
    return this.publicService.findStory(id);
  }
}
