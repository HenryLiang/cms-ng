import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { ArticleStatus } from '@cms-ng/shared';

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

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

  async findAll(reporterId?: string) {
    const where = reporterId ? { reporterId } : {};
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

  private serializeStory(story: any) {
    return {
      ...story,
      tags: JSON.parse(story.tags || '[]'),
    };
  }
}
