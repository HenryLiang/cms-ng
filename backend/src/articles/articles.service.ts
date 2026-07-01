import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ArticleAccessService } from '../common/article-access.service';
import {
  parsePaginationParams,
  buildPaginatedResponse,
  type PaginatedResponse,
} from '../common/pagination';
import { AIService } from '../ai/ai.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { FindAllArticlesDto } from './dto/find-all-articles.dto';
import { ArticleStatus, UserRole, ContentLanguage } from '@cms-ng/shared';
import { safeJsonParse } from '../common/json.utils';
import {
  deserializeArticle,
  serializeArticleInput,
} from './article-serializer';
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
import { GenerateImageDto } from './dto/generate-image.dto';

@Injectable()
export class ArticlesService {
  /**
   * Allowed state transitions for Article (per PRD §8.4).
   * Key: current status, Value: list of valid next statuses.
   */
  // Note: keys/values are `string` rather than the `ArticleStatus` enum from
  // @cms-ng/shared to avoid TS2345 mismatches with Prisma's own enum
  // (two distinct TypeScript enum types with identical runtime values).
  private static readonly VALID_TRANSITIONS: Record<string, readonly string[]> = {
    [ArticleStatus.DRAFT]: [ArticleStatus.WRITING, ArticleStatus.ARCHIVED],
    [ArticleStatus.WRITING]: [
      ArticleStatus.AI_OPTIMIZING,
      ArticleStatus.PENDING_REVIEW,
      ArticleStatus.DRAFT,
      ArticleStatus.ARCHIVED,
    ],
    [ArticleStatus.AI_OPTIMIZING]: [
      ArticleStatus.PENDING_REVIEW,
      ArticleStatus.WRITING,
      ArticleStatus.DRAFT,
    ],
    [ArticleStatus.PENDING_REVIEW]: [
      ArticleStatus.IN_REVIEW,
      ArticleStatus.REVISION,
      ArticleStatus.DRAFT,
    ],
    [ArticleStatus.IN_REVIEW]: [
      ArticleStatus.APPROVED,
      ArticleStatus.REVISION,
      ArticleStatus.PENDING_REVIEW,
    ],
    [ArticleStatus.APPROVED]: [
      ArticleStatus.PUBLISHED,
      ArticleStatus.REVISION,
      ArticleStatus.IN_REVIEW,
    ],
    [ArticleStatus.PUBLISHED]: [ArticleStatus.ARCHIVED],
    [ArticleStatus.ARCHIVED]: [],
    [ArticleStatus.REVISION]: [
      ArticleStatus.WRITING,
      ArticleStatus.PENDING_REVIEW,
      ArticleStatus.DRAFT,
      ArticleStatus.ARCHIVED,
    ],
    [ArticleStatus.AUTO_PUBLISHED]: [ArticleStatus.ARCHIVED, ArticleStatus.PUBLISHED],
    [ArticleStatus.PIPELINE_FAILED]: [ArticleStatus.DRAFT, ArticleStatus.ARCHIVED],
  };

  /**
   * Throws BadRequestException if the transition from→to is not in the
   * allowed transition matrix. Same-state updates are no-ops (allowed).
   */
  private validateStateTransition(from: string, to: string): void {
    if (from === to) return; // idempotent: no actual transition
    const allowed = ArticlesService.VALID_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new BadRequestException(
        `Invalid state transition: ${from} -> ${to}`,
      );
    }
  }

  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private articleAccess: ArticleAccessService,
  ) {}

  async create(authorId: string, dto: CreateArticleDto) {
    const story = await this.prisma.story.findUnique({
      where: { id: dto.storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const user = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { preferredLanguage: true },
    });
    const contentLanguage =
      dto.contentLanguage ?? user?.preferredLanguage ?? ContentLanguage.TRADITIONAL_CHINESE_HK;

    const article = await this.prisma.article.create({
      data: serializeArticleInput({
        storyId: dto.storyId,
        title: dto.title,
        subtitle: dto.subtitle,
        content: dto.content,
        excerpt: dto.excerpt,
        status: dto.status ?? ArticleStatus.DRAFT,
        tags: dto.tags ?? [],
        authorId,
        version: 1,
        contentLanguage,
      }),
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

    return deserializeArticle(article);
  }

  async findAll(
    user: { userId: string; role: string },
    query: FindAllArticlesDto = {},
  ): Promise<PaginatedResponse<ReturnType<typeof deserializeArticle>>> {
    const { storyId } = query;
    const { page, pageSize } = parsePaginationParams(query);

    let where: Prisma.ArticleWhereInput = {};

    if (user.role === UserRole.REPORTER) {
      where.authorId = user.userId;
    } else if (user.role === UserRole.EDITOR) {
      where = {
        OR: [
          { authorId: user.userId },
          { editorId: user.userId },
          {
            status: {
              in: [
                ArticleStatus.PENDING_REVIEW,
                ArticleStatus.IN_REVIEW,
                ArticleStatus.REVISION,
              ],
            },
          },
        ],
      };
    }
    // ADMIN sees everything

    if (storyId) {
      where = { ...where, storyId };
    }

    const skip = (page - 1) * pageSize;

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: { select: { id: true, name: true, email: true } },
          editor: { select: { id: true, name: true, email: true } },
          story: { select: { id: true, title: true } },
        },
      }),
      this.prisma.article.count({ where }),
    ]);

    return buildPaginatedResponse(
      articles.map((a) => deserializeArticle(a)),
      total,
      { page, pageSize },
    );
  }

  async getReviewQueue(editorId: string) {
    const articles = await this.prisma.article.findMany({
      where: {
        status: { in: [ArticleStatus.PENDING_REVIEW, ArticleStatus.IN_REVIEW] },
        OR: [{ editorId: editorId }, { editorId: null }],
      },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    return articles.map((a) => deserializeArticle(a));
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
    return deserializeArticle(article);
  }

  async update(id: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');

    // Validate state-machine transition when status is being changed
    if (dto.status && dto.status !== existing.status) {
      this.validateStateTransition(existing.status, dto.status);
    }

    const newVersion = existing.version + 1;

    const article = await this.prisma.article.update({
      where: { id },
      data: serializeArticleInput({
        title: dto.title,
        subtitle: dto.subtitle,
        content: dto.content,
        excerpt: dto.excerpt,
        status: dto.status,
        editorId: dto.editorId,
        coverImage: dto.coverImage,
        tags: dto.tags,
        contentLanguage: dto.contentLanguage,
        version: newVersion,
      }),
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

    return deserializeArticle(article);
  }

  async remove(id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    await this.prisma.article.delete({ where: { id } });
    return { success: true };
  }

  async verifyAccess(id: string, user: { userId: string; role: string }) {
    return this.articleAccess.checkAccess(id, user, {
      errorMessage: 'You do not have permission to modify this article',
    });
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
    return deserializeArticle(updated);
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
      throw new ForbiddenException(
        'This article is assigned to another editor',
      );
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

    // Validate state-machine transition: only articles currently in review
    // (IN_REVIEW) can be reviewed. Anything else (DRAFT, PUBLISHED, ARCHIVED, ...)
    // is an illegal review target.
    this.validateStateTransition(article.status, newStatus);

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
      article: deserializeArticle(updated),
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
      authorSlug: dto.authorSlug,
    }, dto.language);
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
      language: dto.language,
      authorSlug: dto.authorSlug,
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
      language: dto.language,
      authorSlug: dto.authorSlug,
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
      language: dto.language,
      authorSlug: dto.authorSlug,
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
      language: dto.language,
      authorSlug: dto.authorSlug,
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
      language: dto.language,
      authorSlug: dto.authorSlug,
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
      language: dto.language,
      authorSlug: dto.authorSlug,
    });
    return { reply: result };
  }

  async aiGenerateDraft(
    id: string,
    user: { userId: string; role: string },
    dto: GenerateDraftDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    if (!article.storyId) {
      throw new BadRequestException('Article is not linked to a Story');
    }
    const story = await this.prisma.story.findUnique({
      where: { id: article.storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const result = await this.aiService.generateDraft(user.userId, id, {
      storyTitle: story.title,
      storyDescription: story.description || undefined,
      storyAngle: story.angle || undefined,
      storyTags: safeJsonParse(story.tags, []),
      currentTitle: article.title,
      currentSubtitle: article.subtitle || undefined,
      instruction: dto.instruction,
      language: dto.language,
      authorSlug: dto.authorSlug,
    });

    return result;
  }

  async aiFactCheck(
    id: string,
    user: { userId: string; role: string },
    dto: FactCheckDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.factCheck(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
      language: dto.language,
    });
    return result;
  }

  async aiReview(
    id: string,
    user: { userId: string; role: string },
    dto: ReviewReportDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.generateReviewReport(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
      language: dto.language,
    });
    return result;
  }

  async aiOptimizeSEO(
    id: string,
    user: { userId: string; role: string },
    dto: OptimizeSEODto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.optimizeSEO(user.userId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
      language: dto.language,
    });
    return result;
  }

  async aiGenerateImage(
    id: string,
    user: { userId: string; role: string },
    dto: GenerateImageDto,
  ) {
    const article = await this.verifyAccessAndGet(id, user);
    const result = await this.aiService.generateArticleImage(
      user.userId,
      id,
      article.title,
      article.content,
      {
        style: dto.style,
        aspectRatio: dto.aspectRatio,
        size: dto.size,
        customPrompt: dto.customPrompt,
      },
    );

    // Optionally update coverImage
    await this.prisma.article.update({
      where: { id },
      data: { coverImage: result.url },
    });

    return result;
  }

  private async verifyAccessAndGet(
    id: string,
    user: { userId: string; role: string },
  ) {
    return this.articleAccess.findAndCheckAccess(id, user, {
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
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

  /**
   * Type alias for the common include shape used by 7 of 8 callers of
   * serializeArticle. findOne adds `versions` to this, which is
   * structurally compatible via the generic constraint.
   */
  private static readonly ARTICLE_COMMON_INCLUDE = {
    author: { select: { id: true, name: true, email: true } },
    editor: { select: { id: true, name: true, email: true } },
    story: { select: { id: true, title: true } },
  } as const;
  private static readonly ArticleCommon = {} as Prisma.ArticleGetPayload<{
    include: typeof ArticlesService.ARTICLE_COMMON_INCLUDE;
  }>;

  private serializeArticle<T extends typeof ArticlesService.ArticleCommon>(
    article: T,
  ): T & { tags: string[]; platforms: string[]; aiGeneratedParts: string[] } {
    return deserializeArticle(article) as T & {
      tags: string[];
      platforms: string[];
      aiGeneratedParts: string[];
    };
  }
}
