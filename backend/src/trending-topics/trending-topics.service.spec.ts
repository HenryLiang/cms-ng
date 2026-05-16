jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

jest.mock('rss-parser', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import Parser from 'rss-parser';

describe('TrendingTopicsService', () => {
  let service: TrendingTopicsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let aiService: { generateStorySuggestions: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    aiService = { generateStorySuggestions: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendingTopicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AIService, useValue: aiService },
      ],
    }).compile();

    service = module.get<TrendingTopicsService>(TrendingTopicsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockTopic = (override?: any) => ({
    id: 'topic-id',
    title: 'Test Topic',
    description: 'Desc',
    source: 'twitter',
    heatScore: 50,
    tags: '["tag1"]',
    status: 'OPEN',
    suggestedAngles: null,
    createdBy: 'user-id',
    adoptedStoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...override,
  });

  describe('create', () => {
    it('should create topic with serialized tags', async () => {
      prisma.trendingTopic.create.mockResolvedValue(mockTopic());

      const result = await service.create('user-id', {
        title: 'Test Topic',
        description: 'Desc',
        source: 'twitter',
        heatScore: 50,
        tags: ['tag1'],
        status: 'OPEN',
      } as any);

      expect(prisma.trendingTopic.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Topic',
          tags: '["tag1"]',
          heatScore: 50,
          status: 'OPEN',
          createdBy: 'user-id',
        }),
      });
      expect(result.tags).toEqual(['tag1']);
    });
  });

  describe('findAll', () => {
    it('should return topics ordered by heatScore', async () => {
      prisma.trendingTopic.findMany.mockResolvedValue([
        mockTopic({ id: 't1', heatScore: 90 }),
        mockTopic({ id: 't2', heatScore: 30 }),
      ]);

      const result = await service.findAll();

      expect(prisma.trendingTopic.findMany).toHaveBeenCalledWith({
        orderBy: [{ heatScore: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].heatScore).toBe(90);
    });
  });

  describe('findOne', () => {
    it('should return topic', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());

      const result = await service.findOne('topic-id');

      expect(prisma.trendingTopic.findUnique).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
      });
      expect(result.id).toBe('topic-id');
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update topic and parse tags', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());
      prisma.trendingTopic.update.mockResolvedValue(mockTopic({ tags: '["updated"]' }));

      const result = await service.update('topic-id', { tags: ['updated'] } as any, 'user-id', 'REPORTER');

      expect(prisma.trendingTopic.update).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
        data: expect.objectContaining({ tags: '["updated"]' }),
      });
      expect(result.tags).toEqual(['updated']);
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', {}, 'user-id', 'REPORTER')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({ createdBy: 'other-user' }));

      await expect(service.update('topic-id', { title: 'Hacked' } as any, 'user-id', 'REPORTER')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete topic when found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());
      prisma.trendingTopic.delete.mockResolvedValue(mockTopic());

      const result = await service.remove('topic-id', 'user-id', 'REPORTER');

      expect(prisma.trendingTopic.delete).toHaveBeenCalledWith({ where: { id: 'topic-id' } });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'user-id', 'REPORTER')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({ createdBy: 'other-user' }));

      await expect(service.remove('topic-id', 'user-id', 'REPORTER')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateAISuggestions', () => {
    it('should call AI service with user profile and recent topics', async () => {
      prisma.user.findUnique.mockResolvedValue({
        name: 'Test User',
        expertise: '["tech"]',
        department: 'News',
      });
      prisma.trendingTopic.findMany.mockResolvedValue([
        { title: 'Topic A' },
        { title: 'Topic B' },
      ]);
      aiService.generateStorySuggestions.mockResolvedValue([
        { title: 'Suggestion 1', description: 'Desc', suggestedAngle: 'Angle', reason: 'Reason' },
      ]);

      const result = await service.generateAISuggestions('user-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: { name: true, expertise: true, department: true },
      });
      expect(aiService.generateStorySuggestions).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({ name: 'Test User', expertise: ['tech'], department: 'News' }),
        ['Topic A', 'Topic B'],
      );
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.generateAISuggestions('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('adoptTopic', () => {
    it('should create story and mark topic as adopted', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({
        suggestedAngles: '["Angle 1", "Angle 2"]',
      }));
      prisma.story.create.mockResolvedValue({ id: 'story-id' });
      prisma.trendingTopic.update.mockResolvedValue(mockTopic());

      const result = await service.adoptTopic('topic-id', 'user-id');

      expect(prisma.story.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Topic',
          angle: 'Angle 1',
          status: 'DRAFT',
          priority: 1,
          reporterId: 'user-id',
        }),
      });
      expect(prisma.trendingTopic.update).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
        data: { status: 'ADOPTED', adoptedStoryId: 'story-id' },
      });
      expect(result.storyId).toBe('story-id');
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.adoptTopic('nonexistent', 'user-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when topic is already adopted', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({ status: 'ADOPTED', adoptedStoryId: 'existing-story-id' }));

      await expect(service.adoptTopic('topic-id', 'user-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('fetchGoogleTrends', () => {
    const MockedParser = Parser as unknown as jest.Mock;

    beforeEach(() => {
      MockedParser.mockClear();
    });

    it('should parse merged-format news items and map to topics', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{
          title: 'Trend 1',
          contentSnippet: 'Snippet',
          'ht:approx_traffic': '50,000+',
          'ht:news_item': {
            'ht:news_item_title': ['News 1', 'News 2'],
            'ht:news_item_snippet': ['Snippet 1', 'Snippet 2'],
            'ht:news_item_url': ['http://a.com', 'http://b.com'],
            'ht:news_item_source': ['Source A', 'Source B'],
          },
        }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchGoogleTrends('HK', 'today');

      expect(mockParseURL).toHaveBeenCalledWith('https://trends.google.com/trending/rss?geo=HK');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Trend 1');
      expect(result[0].heatScore).toBe(98);
      expect(result[0].articles).toHaveLength(2);
      expect(result[0].articles[0].title).toBe('News 1');
    });

    it('should handle single news item format', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{
          title: 'Trend 2',
          'ht:approx_traffic': '5,000+',
          'ht:news_item': {
            'ht:news_item_title': 'Single News',
            'ht:news_item_snippet': 'Single Snippet',
            'ht:news_item_url': 'http://single.com',
            'ht:news_item_source': 'Single Source',
          },
        }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchGoogleTrends('US', 'week');

      expect(result[0].articles).toHaveLength(1);
      expect(result[0].articles[0].title).toBe('Single News');
      expect(result[0].heatScore).toBe(85);
    });

    it('should default geo to HK when empty', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({ items: [] });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      await service.fetchGoogleTrends('', 'today');

      expect(mockParseURL).toHaveBeenCalledWith('https://trends.google.com/trending/rss?geo=HK');
    });

    it('should return empty array when feed has no items', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({ items: [] });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchGoogleTrends('HK', 'today');

      expect(result).toEqual([]);
    });

    it('should throw error when RSS parser fails', async () => {
      const mockParseURL = jest.fn().mockRejectedValue(new Error('Network timeout'));
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      await expect(service.fetchGoogleTrends('HK', 'today')).rejects.toThrow('Google Trends 获取失败');
    });
  });

  describe('parseTrafficToScore (private)', () => {
    it('should return 50 for empty traffic', () => {
      expect((service as any).parseTrafficToScore('')).toBe(50);
    });

    it('should return 98 for 50,000+', () => {
      expect((service as any).parseTrafficToScore('50,000+')).toBe(98);
    });

    it('should return 95 for 20,000+', () => {
      expect((service as any).parseTrafficToScore('20,000+')).toBe(95);
    });

    it('should return 90 for 10,000+', () => {
      expect((service as any).parseTrafficToScore('10,000+')).toBe(90);
    });

    it('should return 85 for 5,000+', () => {
      expect((service as any).parseTrafficToScore('5,000+')).toBe(85);
    });

    it('should return 80 for 2,000+', () => {
      expect((service as any).parseTrafficToScore('2,000+')).toBe(80);
    });

    it('should return 75 for 1,000+', () => {
      expect((service as any).parseTrafficToScore('1,000+')).toBe(75);
    });

    it('should return 70 for 500+', () => {
      expect((service as any).parseTrafficToScore('500+')).toBe(70);
    });

    it('should return 65 for 200+', () => {
      expect((service as any).parseTrafficToScore('200+')).toBe(65);
    });

    it('should return 60 for 100+', () => {
      expect((service as any).parseTrafficToScore('100+')).toBe(60);
    });

    it('should return 50 for low traffic', () => {
      expect((service as any).parseTrafficToScore('50+')).toBe(50);
    });
  });

  describe('normalizeNewsItems (private)', () => {
    it('should return empty array for null input', () => {
      expect((service as any).normalizeNewsItems(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect((service as any).normalizeNewsItems(undefined)).toEqual([]);
    });

    it('should handle merged format with array properties', () => {
      const input = {
        'ht:news_item_title': ['Title 1', 'Title 2'],
        'ht:news_item_snippet': ['Snippet 1', 'Snippet 2'],
        'ht:news_item_url': ['http://a.com', 'http://b.com'],
        'ht:news_item_source': ['Source A', 'Source B'],
      };
      const result = (service as any).normalizeNewsItems(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Title 1',
        snippet: 'Snippet 1',
        url: 'http://a.com',
        source: 'Source A',
      });
    });

    it('should handle single object format', () => {
      const input = {
        'ht:news_item_title': 'Single Title',
        'ht:news_item_snippet': 'Single Snippet',
        'ht:news_item_url': 'http://single.com',
        'ht:news_item_source': 'Single Source',
      };
      const result = (service as any).normalizeNewsItems(input);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Single Title');
    });

    it('should use title as snippet fallback when snippet is empty', () => {
      const input = {
        'ht:news_item_title': 'Title Only',
        'ht:news_item_snippet': '',
        'ht:news_item_url': 'http://x.com',
        'ht:news_item_source': '',
      };
      const result = (service as any).normalizeNewsItems(input);
      expect(result[0].snippet).toBe('Title Only');
    });
  });
});
