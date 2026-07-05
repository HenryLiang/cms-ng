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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { FindAllArticlesDto } from './dto/find-all-articles.dto';
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
  OptimizeSEODto,
  OptimizeGEODto,
} from './dto/ai-operations.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@ApiTags('articles')
@ApiBearerAuth('bearer')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new article under a story' })
  create(
    @CurrentUser('userId') authorId: string,
    @Body() dto: CreateArticleDto,
  ) {
    return this.articlesService.create(authorId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List articles the current user can access, paginated' })
  findAll(
    @CurrentUser() user: { userId: string; role: string },
    @Query() query: FindAllArticlesDto,
  ) {
    return this.articlesService.findAll(user, query);
  }

  @Get('review-queue')
  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List articles awaiting editorial review (editor/admin)' })
  getReviewQueue(@CurrentUser('userId') editorId: string) {
    return this.articlesService.getReviewQueue(editorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an article by id (with access check)' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an article (with access check)' })
  async update(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an article (with access check)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.remove(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List version history for an article (with access check)' })
  async getVersions(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.articlesService.verifyAccess(id, user);
    return this.articlesService.getVersions(id);
  }

  @Post(':id/rollback/:version')
  @ApiOperation({ summary: 'Roll an article back to a previous version (with access check)' })
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
  @ApiOperation({ summary: 'Assign an editor to an article (editor/admin only)' })
  async assignEditor(
    @Param('id') id: string,
    @Body('editorId') editorId: string,
  ) {
    return this.articlesService.assignEditor(id, editorId);
  }

  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @Patch(':id/review')
  @ApiOperation({ summary: 'Submit an editorial review decision (approve/revision)' })
  async submitReview(
    @Param('id') id: string,
    @CurrentUser('userId') editorId: string,
    @Body() body: { decision: 'APPROVE' | 'REVISION'; comment?: string },
  ) {
    return this.articlesService.submitReview(
      id,
      editorId,
      body.decision,
      body.comment,
    );
  }

  // ===== AI Operations =====
  @Post(':id/ai-rewrite')
  @ApiOperation({ summary: 'AI: rewrite a text selection' })
  aiRewrite(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: RewriteTextDto,
  ) {
    return this.articlesService.aiRewrite(id, user, dto);
  }

  @Post(':id/ai-expand')
  @ApiOperation({ summary: 'AI: expand a text selection with more detail' })
  aiExpand(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ExpandTextDto,
  ) {
    return this.articlesService.aiExpand(id, user, dto);
  }

  @Post(':id/ai-condense')
  @ApiOperation({ summary: 'AI: condense a text selection to be more concise' })
  aiCondense(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: CondenseTextDto,
  ) {
    return this.articlesService.aiCondense(id, user, dto);
  }

  @Post(':id/ai-polish')
  @ApiOperation({ summary: 'AI: polish a text selection for style and flow' })
  aiPolish(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: PolishTextDto,
  ) {
    return this.articlesService.aiPolish(id, user, dto);
  }

  @Post(':id/ai-headlines')
  @ApiOperation({ summary: 'AI: generate headline candidates' })
  aiHeadlines(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateHeadlinesDto,
  ) {
    return this.articlesService.aiHeadlines(id, user, dto);
  }

  @Post(':id/ai-excerpt')
  @ApiOperation({ summary: 'AI: generate an excerpt / summary' })
  aiExcerpt(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateExcerptDto,
  ) {
    return this.articlesService.aiExcerpt(id, user, dto);
  }

  @Post(':id/ai-chat')
  @ApiOperation({ summary: 'AI: open a chat with the AI assistant about this article' })
  aiChat(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ChatWithAIDto,
  ) {
    return this.articlesService.aiChat(id, user, dto);
  }

  @Post(':id/ai-draft')
  @ApiOperation({ summary: 'AI: generate a full draft for this article' })
  aiDraft(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateDraftDto,
  ) {
    return this.articlesService.aiGenerateDraft(id, user, dto);
  }

  @Post(':id/ai-fact-check')
  @ApiOperation({ summary: 'AI: fact-check the article content' })
  aiFactCheck(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: FactCheckDto,
  ) {
    return this.articlesService.aiFactCheck(id, user, dto);
  }

  @Post(':id/ai-review')
  @ApiOperation({ summary: 'AI: generate an editorial review report' })
  aiReview(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.articlesService.aiReview(id, user, dto);
  }

  @Post(':id/ai-seo')
  @ApiOperation({ summary: 'AI: optimize the article for SEO' })
  aiOptimizeSEO(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: OptimizeSEODto,
  ) {
    return this.articlesService.aiOptimizeSEO(id, user, dto);
  }

  @Post(':id/ai-geo')
  @ApiOperation({ summary: 'AI: optimize the article for GEO (generative engine optimization)' })
  aiOptimizeGEO(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: OptimizeGEODto,
  ) {
    return this.articlesService.aiOptimizeGEO(id, user, dto);
  }

  @Post(':id/ai-generate-image')
  @ApiOperation({ summary: 'AI: generate a cover image for the article' })
  aiGenerateImage(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: GenerateImageDto,
  ) {
    return this.articlesService.aiGenerateImage(id, user, dto);
  }
}