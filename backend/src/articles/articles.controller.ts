import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
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
  GenerateDraftDto,
  FactCheckDto,
  ReviewReportDto,
} from './dto/ai-operations.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @Post()
  create(@CurrentUser('userId') authorId: string, @Body() dto: CreateArticleDto) {
    return this.articlesService.create(authorId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { userId: string; role: string },
    @Query('storyId') storyId?: string,
  ) {
    return this.articlesService.findAll(user, { storyId });
  }

  @Get('review-queue')
  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  getReviewQueue(@CurrentUser('userId') editorId: string) {
    return this.articlesService.getReviewQueue(editorId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: { userId: string; role: string }) {
    const article = await this.articlesService.findOne(id);
    const canAccess =
      user.role === UserRole.ADMIN ||
      article.authorId === user.userId ||
      article.editorId === user.userId;
    if (!canAccess) {
      throw new ForbiddenException('You do not have permission to view this article');
    }
    return article;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: { userId: string; role: string }) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.remove(id);
  }

  @Get(':id/versions')
  async getVersions(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    const article = await this.articlesService.findOne(id);
    const canAccess =
      user.role === UserRole.ADMIN ||
      article.authorId === user.userId ||
      article.editorId === user.userId;
    if (!canAccess) {
      throw new ForbiddenException('You do not have permission to view this article');
    }
    return this.articlesService.getVersions(id);
  }

  @Post(':id/rollback/:version')
  async rollback(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.rollback(id, parseInt(version, 10));
  }

  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @Patch(':id/assign-editor')
  async assignEditor(
    @Param('id') id: string,
    @Body('editorId') editorId: string,
  ) {
    return this.articlesService.assignEditor(id, editorId);
  }

  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @Patch(':id/review')
  async submitReview(
    @Param('id') id: string,
    @CurrentUser('userId') editorId: string,
    @Body() body: { decision: 'APPROVE' | 'REVISION'; comment?: string },
  ) {
    return this.articlesService.submitReview(id, editorId, body.decision, body.comment);
  }

  // ===== AI Operations =====
  @Post(':id/ai-rewrite')
  aiRewrite(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: RewriteTextDto,
  ) {
    return this.articlesService.aiRewrite(id, user, dto);
  }

  @Post(':id/ai-expand')
  aiExpand(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ExpandTextDto,
  ) {
    return this.articlesService.aiExpand(id, user, dto);
  }

  @Post(':id/ai-condense')
  aiCondense(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: CondenseTextDto,
  ) {
    return this.articlesService.aiCondense(id, user, dto);
  }

  @Post(':id/ai-polish')
  aiPolish(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: PolishTextDto,
  ) {
    return this.articlesService.aiPolish(id, user, dto);
  }

  @Post(':id/ai-headlines')
  aiHeadlines(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateHeadlinesDto,
  ) {
    return this.articlesService.aiHeadlines(id, user, dto);
  }

  @Post(':id/ai-excerpt')
  aiExcerpt(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateExcerptDto,
  ) {
    return this.articlesService.aiExcerpt(id, user, dto);
  }

  @Post(':id/ai-chat')
  aiChat(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ChatWithAIDto,
  ) {
    return this.articlesService.aiChat(id, user, dto);
  }

  @Post(':id/ai-draft')
  aiDraft(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateDraftDto,
  ) {
    return this.articlesService.aiGenerateDraft(id, user, dto);
  }

  @Post(':id/ai-fact-check')
  aiFactCheck(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: FactCheckDto,
  ) {
    return this.articlesService.aiFactCheck(id, user, dto);
  }

  @Post(':id/ai-review')
  aiReview(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.articlesService.aiReview(id, user, dto);
  }
}
