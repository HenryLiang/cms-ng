import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { StorySuggestion } from '../ai/dto/story-suggestion.dto';
import { UserRole } from '@cms-ng/shared';
import Parser from 'rss-parser';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

  async update(id: string, dto: UpdateTopicDto, userId: string, userRole: string) {
    const existing = await this.prisma.trendingTopic.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Topic not found');
    if (userRole !== UserRole.ADMIN && existing.createdBy !== userId) {
      throw new ForbiddenException('You do not have permission to update this topic');
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

  async remove(id: string, userId: string, userRole: string) {
    const existing = await this.prisma.trendingTopic.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Topic not found');
    if (userRole !== UserRole.ADMIN && existing.createdBy !== userId) {
      throw new ForbiddenException('You do not have permission to delete this topic');
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
    if (topic.status === 'ADOPTED') {
      throw new BadRequestException('Topic has already been adopted');
    }

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

  async fetchGoogleTrends(geo: string, _timeRange: string) {
    try {
      const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
      const requestOptions: any = {};
      if (proxyUrl) {
        requestOptions.agent = new HttpsProxyAgent(proxyUrl);
      }

      const parser = new Parser({
        customFields: {
          item: ['ht:approx_traffic', 'ht:picture', 'ht:picture_source', 'ht:news_item'],
        },
        requestOptions,
      });

      const feedUrl = `https://trends.google.com/trending/rss?geo=${geo || 'HK'}`;
      const feed = await parser.parseURL(feedUrl);

      return (feed.items || []).map((item: any) => {
        const traffic = item['ht:approx_traffic'] || '';
        const articles = this.normalizeNewsItems(item['ht:news_item']);
        const firstNews = articles[0];
        const snippet = firstNews?.snippet;
        const description = snippet || firstNews?.title || item.contentSnippet || item.title || '';

        return {
          title: item.title || '',
          description,
          source: 'google-trends',
          heatScore: this.parseTrafficToScore(traffic),
          tags: [],
          articles: articles.slice(0, 3),
        };
      });
    } catch (error: any) {
      throw new Error(`Google Trends 获取失败: ${error.message}`);
    }
  }

  async importFromGoogleTrends(userId: string, data: any) {
    const topic = await this.prisma.trendingTopic.create({
      data: {
        title: data.title,
        description: data.description,
        source: 'google-trends',
        heatScore: data.heatScore ?? 50,
        tags: JSON.stringify(data.tags ?? []),
        status: 'OPEN',
        createdBy: userId,
      },
    });
    return this.serializeTopic(topic);
  }

  private normalizeNewsItems(newsItemField: any): { title: string; source: string; snippet: string; url: string }[] {
    if (!newsItemField) return [];
    // rss-parser merges multiple <ht:news_item> siblings into a single object with array properties
    const isMergedFormat =
      typeof newsItemField === 'object' &&
      !Array.isArray(newsItemField) &&
      Array.isArray(newsItemField['ht:news_item_title']);

    if (isMergedFormat) {
      const titles = newsItemField['ht:news_item_title'] || [];
      const snippets = newsItemField['ht:news_item_snippet'] || [];
      const urls = newsItemField['ht:news_item_url'] || [];
      const sources = newsItemField['ht:news_item_source'] || [];
      const count = Math.max(titles.length, snippets.length, urls.length, sources.length);
      const articles = [];
      for (let i = 0; i < count; i++) {
        const title = titles[i] || '';
        const snippet = snippets[i] || '';
        articles.push({
          title,
          source: sources[i] || '',
          snippet: snippet || title,
          url: urls[i] || '',
        });
      }
      return articles;
    }

    // Single news item as object
    if (typeof newsItemField === 'object' && !Array.isArray(newsItemField)) {
      const title = newsItemField['ht:news_item_title'] || '';
      return [{
        title,
        source: newsItemField['ht:news_item_source'] || '',
        snippet: newsItemField['ht:news_item_snippet'] || title,
        url: newsItemField['ht:news_item_url'] || '',
      }];
    }

    return [];
  }

  private parseTrafficToScore(traffic: string): number {
    if (!traffic) return 50;
    const num = parseInt(traffic.replace(/[^0-9]/g, ''), 10);
    if (num >= 50000) return 98;
    if (num >= 20000) return 95;
    if (num >= 10000) return 90;
    if (num >= 5000) return 85;
    if (num >= 2000) return 80;
    if (num >= 1000) return 75;
    if (num >= 500) return 70;
    if (num >= 200) return 65;
    if (num >= 100) return 60;
    return 50;
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
