import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleStatus, UserRole } from '@cms-ng/shared';
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
} from './dto/ai-operations.dto';

@Injectable()
export class ArticlesService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
  ) {}

  async create(authorId: string, dto: CreateArticleDto) {
    const story = await this.prisma.story.findUnique({
      where: { id: dto.storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const article = await this.prisma.article.create({
      data: {
        storyId: dto.storyId,
        title: dto.title,
        subtitle: dto.subtitle,
        content: dto.content,
        excerpt: dto.excerpt,
        status: dto.status ?? ArticleStatus.DRAFT,
        tags: JSON.stringify(dto.tags ?? []),
        authorId,
        version: 1,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });

    await this.prisma.articleVersion.create({
      data: {
        articleId: article.id,
        title: article.title,
        content: article.content,
        version: 1,
      },
    });

    return this.serializeArticle(article);
  }

  async findAll(
    user: { userId: string; role: string },
    filters: { storyId?: string },
  ) {
    let where: any = {};

    if (user.role === UserRole.REPORTER) {
      where.authorId = user.userId;
    } else if (user.role === UserRole.EDITOR) {
      where = {
        OR: [
          { authorId: user.userId },
          { editorId: user.userId },
          { status: { in: [ArticleStatus.PENDING_REVIEW, ArticleStatus.IN_REVIEW, ArticleStatus.REVISION] } },
        ],
      };
    }
    // ADMIN sees everything

    if (filters.storyId) {
      where = { ...where, storyId: filters.storyId };
    }

    const articles = await this.prisma.article.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    return articles.map((a) => this.serializeArticle(a));
  }

  async getReviewQueue(editorId: string) {
    const articles = await this.prisma.article.findMany({
      where: {
        status: { in: [ArticleStatus.PENDING_REVIEW, ArticleStatus.IN_REVIEW] },
        OR: [
          { editorId: editorId },
          { editorId: null },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    return articles.map((a) => this.serializeArticle(a));
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });
    if (!article) throw new NotFoundException('Article not found');
    return this.serializeArticle(article);
  }

  async update(id: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');

    const newVersion = existing.version + 1;

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        content: dto.content,
        excerpt: dto.excerpt,
        status: dto.status,
        editorId: dto.editorId,
        tags: dto.tags !== undefined ? JSON.stringify(dto.tags) : undefined,
        version: newVersion,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });

    if (dto.content || dto.title) {
      await this.prisma.articleVersion.create({
        data: {
          articleId: id,
          title: article.title,
          content: article.content,
          version: newVersion,
        },
      });
    }

    return this.serializeArticle(article);
  }

  async remove(id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    await this.prisma.article.delete({ where: { id } });
    return { success: true };
  }

  async verifyAccess(id: string, user: { userId: string; role: string }) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { authorId: true, editorId: true },
    });
    if (!article) throw new NotFoundException('Article not found');

    const canAccess =
      user.role === UserRole.ADMIN ||
      article.authorId === user.userId ||
      article.editorId === user.userId;

    if (!canAccess) {
      throw new ForbiddenException('You do not have permission to modify this article');
    }
  }

  async assignEditor(id: string, editorId: string) {
    const article = await this.prisma.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');

    const editor = await this.prisma.user.findUnique({
      where: { id: editorId },
      select: { role: true },
    });
    if (!editor) throw new NotFoundException('Editor not found');
    if (editor.role !== UserRole.EDITOR && editor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Assigned user is not an editor');
    }

    const updated = await this.prisma.article.update({
      where: { id },
      data: { editorId },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    return this.serializeArticle(updated);
  }

  async submitReview(
    id: string,
    editorId: string,
    decision: 'APPROVE' | 'REVISION',
    comment?: string,
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: { id: true, status: true, editorId: true },
    });
    if (!article) throw new NotFoundException('Article not found');

    if (
      article.editorId &&
      article.editorId !== editorId &&
      // Allow admin override
      !(await this.isAdmin(editorId))
    ) {
      throw new ForbiddenException('This article is assigned to another editor');
    }

    if (decision !== 'APPROVE' && decision !== 'REVISION') {
      throw new BadRequestException('Decision must be APPROVE or REVISION');
    }

    if (decision === 'REVISION' && (!comment || !comment.trim())) {
      throw new BadRequestException('Comment is required for revision');
    }
    let newStatus: ArticleStatus;
    if (decision === 'APPROVE') {
      newStatus = ArticleStatus.APPROVED;
    } else {
      newStatus = ArticleStatus.REVISION;
    }

    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        status: newStatus,
        editorId: editorId,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });

    // TODO: store review comment in a separate ReviewComment table
    return {
      article: this.serializeArticle(updated),
      decision,
      comment: comment || null,
    };
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === UserRole.ADMIN;
  }

  // ===== AI Operations =====
  async aiRewrite(
    id: string,
    user: { userId: string; role: string },
    dto: RewriteTextDto,
  ) {
    await this.verifyAccess(id, user);
    const result = await this.aiService.rewriteText(user.userId, id, {
      text: dto.text,
      instruction: dto.instruction,
      style: dto.style,
    });
    return { result };
  }

  async aiExpand(
    id: string,
    user: { userId: string; role: string },
    dto: ExpandTextDto,
  ) {
    await this.verifyAccess(id, user);
    const result = await this.aiService.expandText(user.userId, id, {
      text: dto.text,
      instruction: dto.instruction,
    });
    return { result };
  }

  async aiCondense(
    id: string,
    user: { userId: string; role: string },
    dto: CondenseTextDto,
  ) {
    await this.verifyAccess(id, user);
    const result = await this.aiService.condenseText(user.userId, id, {
      text: dto.text,
      maxLength: dto.maxLength,
    });
    return { result };
  }

  async aiPolish(
    id: string,
    user: { userId: string; role: string },
    dto: PolishTextDto,
  ) {
    await this.verifyAccess(id, user);
    const result = await this.aiService.polishText(user.userId, id, {
      text: dto.text,
    });
    return { result };
  }

  async aiHeadlines(
    id: string,
    user: { userId: string; role: string },
    dto: GenerateHeadlinesDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.generateHeadlines(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
      count: dto.count,
    });
    return { headlines: result };
  }

  async aiExcerpt(
    id: string,
    user: { userId: string; role: string },
    dto: GenerateExcerptDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.generateExcerpt(user.userId, id, {
      title: article.title,
      content: article.content,
      maxLength: dto.maxLength,
    });
    return { excerpt: result };
  }

  async aiChat(
    id: string,
    user: { userId: string; role: string },
    dto: ChatWithAIDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.chatWithAI(user.userId, id, {
      messages: dto.messages,
      articleContext: {
        title: article.title,
        subtitle: article.subtitle || undefined,
        content: article.content,
      },
    });
    return { reply: result };
  }

  async aiGenerateDraft(
    id: string,
    user: { userId: string; role: string },
    dto: GenerateDraftDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const story = await this.prisma.story.findUnique({
      where: { id: article.storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const result = await this.aiService.generateDraft(user.userId, id, {
      storyTitle: story.title,
      storyDescription: story.description || undefined,
      storyAngle: story.angle || undefined,
      storyTags: JSON.parse(story.tags || '[]'),
      currentTitle: article.title,
      currentSubtitle: article.subtitle || undefined,
      instruction: dto.instruction,
    });

    return result;
  }

  async aiFactCheck(
    id: string,
    user: { userId: string; role: string },
    _dto: FactCheckDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.factCheck(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
    });
    return result;
  }

  async aiReview(
    id: string,
    user: { userId: string; role: string },
    _dto: ReviewReportDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.generateReviewReport(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
    });
    return result;
  }

  async aiOptimizeSEO(
    id: string,
    user: { userId: string; role: string },
    _dto: OptimizeSEODto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.optimizeSEO(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
    });
    return result;
  }

  private async verifyAccessAndGet(
    id: string,
    user: { userId: string; role: string },
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    if (!article) throw new NotFoundException('Article not found');
    if (
      user.role !== UserRole.ADMIN &&
      article.authorId !== user.userId &&
      article.editorId !== user.userId
    ) {
      throw new ForbiddenException('You do not have permission to access this article');
    }
    return article;
  }

  async getVersions(articleId: string) {
    const versions = await this.prisma.articleVersion.findMany({
      where: { articleId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        title: true,
        createdAt: true,
      },
    });
    return versions;
  }

  async rollback(id: string, versionNumber: number) {
    const version = await this.prisma.articleVersion.findFirst({
      where: { articleId: id, version: versionNumber },
    });
    if (!version) throw new NotFoundException('Version not found');

    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');

    const newVersion = existing.version + 1;

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        title: version.title,
        content: version.content,
        version: newVersion,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });

    await this.prisma.articleVersion.create({
      data: {
        articleId: id,
        title: article.title,
        content: article.content,
        version: newVersion,
      },
    });

    return this.serializeArticle(article);
  }

  private serializeArticle(article: any) {
    return {
      ...article,
      tags: JSON.parse(article.tags || '[]'),
      platforms: JSON.parse(article.platforms || '[]'),
      aiGeneratedParts: JSON.parse(article.aiGeneratedParts || '[]'),
    };
  }
}
