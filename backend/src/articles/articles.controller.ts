import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import {
  RewriteTextDto,
  ExpandTextDto,
  CondenseTextDto,
  PolishTextDto,
  GenerateHeadlinesDto,
  GenerateExcerptDto,
  ChatWithAIDto,
} from './dto/ai-operations.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('articles')
@UseGuards(JwtAuthGuard)
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @Post()
  create(@CurrentUser('userId') authorId: string, @Body() dto: CreateArticleDto) {
    return this.articlesService.create(authorId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') authorId: string,
    @Query('storyId') storyId?: string,
    @Query('all') all?: string,
  ) {
    return this.articlesService.findAll({
      authorId: all === 'true' ? undefined : authorId,
      storyId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articlesService.findOne(id);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.update(id, authorId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') authorId: string, @Param('id') id: string) {
    return this.articlesService.remove(id, authorId);
  }

  // ===== AI Operations =====
  @Post(':id/ai-rewrite')
  aiRewrite(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: RewriteTextDto,
  ) {
    return this.articlesService.aiRewrite(id, authorId, dto);
  }

  @Post(':id/ai-expand')
  aiExpand(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: ExpandTextDto,
  ) {
    return this.articlesService.aiExpand(id, authorId, dto);
  }

  @Post(':id/ai-condense')
  aiCondense(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: CondenseTextDto,
  ) {
    return this.articlesService.aiCondense(id, authorId, dto);
  }

  @Post(':id/ai-polish')
  aiPolish(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: PolishTextDto,
  ) {
    return this.articlesService.aiPolish(id, authorId, dto);
  }

  @Post(':id/ai-headlines')
  aiHeadlines(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: GenerateHeadlinesDto,
  ) {
    return this.articlesService.aiHeadlines(id, authorId, dto);
  }

  @Post(':id/ai-excerpt')
  aiExcerpt(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: GenerateExcerptDto,
  ) {
    return this.articlesService.aiExcerpt(id, authorId, dto);
  }

  @Post(':id/ai-chat')
  aiChat(
    @CurrentUser('userId') authorId: string,
    @Param('id') id: string,
    @Body() dto: ChatWithAIDto,
  ) {
    return this.articlesService.aiChat(id, authorId, dto);
  }
}
