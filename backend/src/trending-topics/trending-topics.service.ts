import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@cms-ng/shared';
import type { TrendingTopic as TrendingTopicRecord } from '@prisma/client';
import { AIService } from '../ai/ai.service';
import { safeJsonParse } from '../common/json.utils';
import { PrismaService } from '../prisma/prisma.service';
import { StorySuggestion } from '../ai/dto/story-suggestion.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { TopicSourceCatalog } from './sources/topic-source.catalog';

interface ImportTopicInput {
  title: string;
  description?: string;
  source?: string;
  heatScore?: number;
  tags?: string[];
}

/** Curated-topic persistence and adoption. External source I/O lives in TopicSourceCatalog. */
@Injectable()
export class TrendingTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly sourceCatalog: TopicSourceCatalog,
  ) {}

  async create(userId: string, dto: CreateTopicDto) {
    const topic = await this.prisma.trendingTopic.create({
      data: {
        title: dto.title,
        description: dto.description,
        source: dto.source,
        heatScore: dto.heatScore ?? 0,
        tags: JSON.stringify(dto.tags ?? []),
        status: dto.status ?? 'OPEN',
        createdBy: userId,
      },
    });
    return this.serializeTopic(topic);
  }

  async findAll() {
    const topics = await this.prisma.trendingTopic.findMany({
      orderBy: [{ heatScore: 'desc' }, { createdAt: 'desc' }],
    });
    return topics.map((topic) => this.serializeTopic(topic));
  }

  async findOne(id: string) {
    const topic = await this.prisma.trendingTopic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException('Topic not found');
    return this.serializeTopic(topic);
  }

  async update(
    id: string,
    dto: UpdateTopicDto,
    userId: string,
    userRole: UserRole,
  ) {
    const existing = await this.prisma.trendingTopic.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Topic not found');
    if (userRole !== UserRole.ADMIN && existing.createdBy !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this topic',
      );
    }
    const topic = await this.prisma.trendingTopic.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        source: dto.source,
        heatScore: dto.heatScore,
        tags: dto.tags !== undefined ? JSON.stringify(dto.tags) : undefined,
        status: dto.status,
      },
    });
    return this.serializeTopic(topic);
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const existing = await this.prisma.trendingTopic.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Topic not found');
    if (userRole !== UserRole.ADMIN && existing.createdBy !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this topic',
      );
    }
    await this.prisma.trendingTopic.delete({ where: { id } });
    return { success: true };
  }

  async generateAISuggestions(userId: string): Promise<StorySuggestion[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, expertise: true, department: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const recentTopics = await this.prisma.trendingTopic.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { title: true },
    });
    const expertise = safeJsonParse<string[]>(user.expertise, []);
    return this.aiService.generateStorySuggestions(
      userId,
      {
        name: user.name,
        expertise: Array.isArray(expertise) ? expertise : [],
        department: user.department || undefined,
      },
      recentTopics.map((topic) => topic.title),
    );
  }

  async adoptTopic(topicId: string, userId: string) {
    const topic = await this.prisma.trendingTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    if (topic.status === 'ADOPTED') {
      throw new BadRequestException('Topic has already been adopted');
    }
    const story = await this.prisma.story.create({
      data: {
        title: topic.title,
        description: topic.description,
        angle: topic.suggestedAngles
          ? safeJsonParse<string[]>(topic.suggestedAngles, [])[0]
          : undefined,
        status: 'DRAFT',
        priority: topic.heatScore >= 80 ? 2 : topic.heatScore >= 50 ? 1 : 0,
        tags: topic.tags,
        reporterId: userId,
      },
    });
    await this.prisma.trendingTopic.update({
      where: { id: topicId },
      data: { status: 'ADOPTED', adoptedStoryId: story.id },
    });
    return { storyId: story.id, topicId };
  }

  /** Compatibility methods for existing source-specific routes. */
  fetchGoogleTrends(geo: string, timeRange: string, page = 1, limit = 10) {
    return this.sourceCatalog.fetch(
      'google-trends',
      {},
      { page, limit, params: { geo, timeRange } },
    );
  }

  fetchAllTrendingNews(geo?: string, page = 1, limit = 20) {
    return this.sourceCatalog.fetch(
      'all-news',
      {},
      { page, limit, params: { geo: geo || 'HK' } },
    );
  }

  fetchNewsBySource(sourceId: string, page = 1, limit = 10) {
    return this.sourceCatalog.fetch(sourceId, {}, { page, limit });
  }

  fetchBilibiliPartitionRanking(tid: number, page = 1, limit = 10) {
    return this.sourceCatalog.fetch(
      'bilibili-partition',
      {},
      { page, limit, params: { tid } },
    );
  }

  fetchNHKNews(page = 1, limit = 10) {
    return this.sourceCatalog.fetch('nhk', {}, { page, limit });
  }

  importFromGoogleTrends(userId: string, data: ImportTopicInput) {
    return this.importTopic(userId, { ...data, source: 'google-trends' });
  }

  async importTopic(userId: string, data: ImportTopicInput) {
    const topic = await this.prisma.trendingTopic.create({
      data: {
        title: data.title,
        description: data.description,
        source: data.source || 'imported',
        heatScore: data.heatScore ?? 50,
        tags: JSON.stringify(data.tags ?? []),
        status: 'OPEN',
        createdBy: userId,
      },
    });
    return this.serializeTopic(topic);
  }

  private serializeTopic(topic: TrendingTopicRecord) {
    return {
      ...topic,
      tags: safeJsonParse(topic.tags, []),
      suggestedAngles: topic.suggestedAngles
        ? safeJsonParse(topic.suggestedAngles, [] as string[])
        : undefined,
    };
  }
}
