import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { StorySuggestion } from '../ai/dto/story-suggestion.dto';

@Injectable()
export class TrendingTopicsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
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
    return topics.map((t) => this.serializeTopic(t));
  }

  async findOne(id: string) {
    const topic = await this.prisma.trendingTopic.findUnique({
      where: { id },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return this.serializeTopic(topic);
  }

  async update(id: string, dto: UpdateTopicDto) {
    const existing = await this.prisma.trendingTopic.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Topic not found');

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

  async remove(id: string) {
    const existing = await this.prisma.trendingTopic.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Topic not found');
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

    const expertise = JSON.parse(user.expertise || '[]');

    return this.aiService.generateStorySuggestions(
      userId,
      {
        name: user.name,
        expertise: Array.isArray(expertise) ? expertise : [],
        department: user.department || undefined,
      },
      recentTopics.map((t) => t.title),
    );
  }

  async adoptTopic(topicId: string, userId: string) {
    const topic = await this.prisma.trendingTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    // Create a Story from the topic
    const story = await this.prisma.story.create({
      data: {
        title: topic.title,
        description: topic.description,
        angle: topic.suggestedAngles
          ? JSON.parse(topic.suggestedAngles)[0]
          : undefined,
        status: 'DRAFT',
        priority: topic.heatScore >= 80 ? 2 : topic.heatScore >= 50 ? 1 : 0,
        tags: topic.tags,
        reporterId: userId,
      },
    });

    // Mark topic as adopted
    await this.prisma.trendingTopic.update({
      where: { id: topicId },
      data: { status: 'ADOPTED', adoptedStoryId: story.id },
    });

    return { storyId: story.id, topicId };
  }

  private serializeTopic(topic: any) {
    return {
      ...topic,
      tags: JSON.parse(topic.tags || '[]'),
      suggestedAngles: topic.suggestedAngles
        ? JSON.parse(topic.suggestedAngles)
        : undefined,
    };
  }
}
