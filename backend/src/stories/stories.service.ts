import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { ArticlesService } from '../articles/articles.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { FindAllStoriesDto } from './dto/find-all-stories.dto';
import { ArticleStatus, UserRole, ContentLanguage } from '@cms-ng/shared';
import { ResearchKitResult } from '../ai/dto/writing-operations.dto';
import { safeJsonParse } from '../common/json.utils';

@Injectable()
export class StoriesService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private articlesService: ArticlesService,
  ) {}

  async create(reporterId: string, dto: CreateStoryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: reporterId },
      select: { preferredLanguage: true },
    });
    const contentLanguage =
      dto.contentLanguage ??
      user?.preferredLanguage ??
      ContentLanguage.TRADITIONAL_CHINESE_HK;

    const story = await this.prisma.story.create({
      data: {
        title: dto.title,
        description: dto.description,
        angle: dto.angle,
        status: dto.status ?? ArticleStatus.DRAFT,
        priority: dto.priority ?? 0,
        tags: JSON.stringify(dto.tags ?? []),
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        contentLanguage,
        reporterId,
      },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        _count: { select: { articles: true } },
      },
    });
    return this.serializeStory(story);
  }

  async findAll(
    user: { userId: string; role: string },
    query: FindAllStoriesDto = {},
  ) {
    const {
      page = 1,
      pageSize = 20,
      status,
      contentLanguage,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

    // 1) 角色基线 where
    const where: Prisma.StoryWhereInput = {};

    if (user.role === UserRole.REPORTER) {
      where.reporterId = user.userId;
    } else if (user.role === UserRole.EDITOR) {
      where.OR = [
        { reporterId: user.userId },
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
      ];
    }
    // ADMIN sees everything (no role-based where)

    // 2) 应用 query 过滤
    if (status) where.status = status;
    if (contentLanguage) where.contentLanguage = contentLanguage;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // 3) data + total 并行查询
    const [stories, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: order },
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          editor: { select: { id: true, name: true, email: true } },
          _count: { select: { articles: true } },
        },
      }),
      this.prisma.story.count({ where }),
    ]);

    return {
      data: stories.map((s) => this.serializeStory(s)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async findOne(id: string) {
    const story = await this.prisma.story.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        articles: {
          orderBy: { updatedAt: 'desc' },
          include: {
            author: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!story) throw new NotFoundException('Story not found');
    return this.serializeStory(story);
  }

  async update(id: string, dto: UpdateStoryDto) {
    const existing = await this.prisma.story.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Story not found');

    const story = await this.prisma.story.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        angle: dto.angle,
        status: dto.status,
        priority: dto.priority,
        tags: dto.tags !== undefined ? JSON.stringify(dto.tags) : undefined,
        contentLanguage: dto.contentLanguage,
        deadline:
          dto.deadline !== undefined
            ? dto.deadline
              ? new Date(dto.deadline)
              : null
            : undefined,
      },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        _count: { select: { articles: true } },
      },
    });
    return this.serializeStory(story);
  }

  async remove(id: string) {
    const existing = await this.prisma.story.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Story not found');

    // #55: 显式先清空关联 Article.storyId 防 orphan 数据。
    // schema 已有 onDelete: SetNull(双保险),但显式 updateMany
    // 让我们能在 service 层记录清理数,且对旧数据 schema 也安全。
    await this.prisma.article.updateMany({
      where: { storyId: id },
      data: { storyId: null },
    });

    await this.prisma.story.delete({ where: { id } });
    return { success: true };
  }

  async verifyAccess(id: string, user: { userId: string; role: string }) {
    const story = await this.prisma.story.findUnique({
      where: { id },
      select: { reporterId: true, editorId: true },
    });
    if (!story) throw new NotFoundException('Story not found');

    const canAccess =
      user.role === UserRole.ADMIN ||
      story.reporterId === user.userId ||
      story.editorId === user.userId;

    if (!canAccess) {
      throw new ForbiddenException(
        'You do not have permission to modify this story',
      );
    }
  }

  async assignEditor(id: string, editorId: string) {
    const story = await this.prisma.story.findUnique({ where: { id } });
    if (!story) throw new NotFoundException('Story not found');

    const editor = await this.prisma.user.findUnique({
      where: { id: editorId },
      select: { role: true },
    });
    if (!editor) throw new NotFoundException('Editor not found');
    if (editor.role !== UserRole.EDITOR && editor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Assigned user is not an editor');
    }

    const updated = await this.prisma.story.update({
      where: { id },
      data: { editorId },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        _count: { select: { articles: true } },
      },
    });
    return this.serializeStory(updated);
  }

  async generateResearchKit(
    userId: string,
    storyId: string,
    language?: ContentLanguage,
  ): Promise<ResearchKitResult> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const tags = safeJsonParse<string[]>(story.tags, []);

    return this.aiService.generateResearchKit(userId, {
      storyTitle: story.title,
      storyDescription: story.description || undefined,
      storyAngle: story.angle || undefined,
      storyTags: tags,
      language,
    });
  }

  async generateDraftFromResearchKit(
    userId: string,
    storyId: string,
    researchKit: ResearchKitResult,
    instruction?: string,
    language?: ContentLanguage,
    authorSlug?: string,
  ) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const tags = safeJsonParse<string[]>(story.tags, []);

    // 1. Generate draft using AI with research kit
    const draft = await this.aiService.generateDraft(userId, undefined, {
      storyTitle: story.title,
      storyDescription: story.description || undefined,
      storyAngle: story.angle || undefined,
      storyTags: tags,
      instruction,
      researchKit,
      language,
      authorSlug,
    });

    // 2. Create article from draft
    const article = await this.articlesService.create(userId, {
      storyId,
      title: draft.title,
      subtitle: draft.subtitle,
      content: draft.content,
      status: ArticleStatus.WRITING,
    });

    // 3. Update story status to WRITING
    await this.prisma.story.update({
      where: { id: storyId },
      data: { status: ArticleStatus.WRITING },
    });

    return article;
  }

  /**
   * Type alias for the common include shape used by create/findAll/update
   * /assignEditor (`{ reporter, editor, _count }`). findOne uses
   * `{ reporter, editor, articles: {...} }` instead — structurally
   * compatible via the generic constraint because both share
   * `reporter` and `editor`.
   */
  private static readonly STORY_COMMON_INCLUDE = {
    reporter: { select: { id: true, name: true, email: true } },
    editor: { select: { id: true, name: true, email: true } },
  } as const;
  private static readonly StoryCommon = {} as Prisma.StoryGetPayload<{
    include: typeof StoriesService.STORY_COMMON_INCLUDE;
  }>;

  private serializeStory<T extends typeof StoriesService.StoryCommon>(
    story: T,
  ): T & { tags: string[] } {
    return {
      ...story,
      tags: safeJsonParse(story.tags, []),
    };
  }
}
