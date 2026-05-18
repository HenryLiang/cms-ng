import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { ArticlesService } from '../articles/articles.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { ArticleStatus, UserRole } from '@cms-ng/shared';
import { ResearchKitResult } from '../ai/dto/writing-operations.dto';

@Injectable()
export class StoriesService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private articlesService: ArticlesService,
  ) {}

  async create(reporterId: string, dto: CreateStoryDto) {
    const story = await this.prisma.story.create({
      data: {
        title: dto.title,
        description: dto.description,
        angle: dto.angle,
        status: dto.status ?? ArticleStatus.DRAFT,
        priority: dto.priority ?? 0,
        tags: JSON.stringify(dto.tags ?? []),
        deadline: dto.deadline ? new Date(dto.deadline) : null,
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

  async findAll(user: { userId: string; role: string }) {
    let where: any = {};

    if (user.role === UserRole.REPORTER) {
      where = { reporterId: user.userId };
    } else if (user.role === UserRole.EDITOR) {
      where = {
        OR: [
          { reporterId: user.userId },
          { editorId: user.userId },
          { status: { in: [ArticleStatus.PENDING_REVIEW, ArticleStatus.IN_REVIEW, ArticleStatus.REVISION] } },
        ],
      };
    }
    // ADMIN sees everything (no where clause)

    const stories = await this.prisma.story.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        _count: { select: { articles: true } },
      },
    });
    return stories.map((s) => this.serializeStory(s));
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
        deadline: dto.deadline !== undefined ? (dto.deadline ? new Date(dto.deadline) : null) : undefined,
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
      throw new ForbiddenException('You do not have permission to modify this story');
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

  async generateResearchKit(userId: string, storyId: string): Promise<ResearchKitResult> {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');

    const tags = JSON.parse(story.tags || '[]') as string[];

    return this.aiService.generateResearchKit(userId, {
      storyTitle: story.title,
      storyDescription: story.description || undefined,
      storyAngle: story.angle || undefined,
      storyTags: tags,
    });
  }

  async generateDraftFromResearchKit(
    userId: string,
    storyId: string,
    researchKit: ResearchKitResult,
    instruction?: string,
  ) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');

    const tags = JSON.parse(story.tags || '[]') as string[];

    // 1. Generate draft using AI with research kit
    const draft = await this.aiService.generateDraft(userId, undefined, {
      storyTitle: story.title,
      storyDescription: story.description || undefined,
      storyAngle: story.angle || undefined,
      storyTags: tags,
      instruction,
      researchKit,
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

  private serializeStory(story: any) {
    return {
      ...story,
      tags: JSON.parse(story.tags || '[]'),
    };
  }
}
