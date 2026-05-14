import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

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

      const result = await service.update('topic-id', { tags: ['updated'] } as any);

      expect(prisma.trendingTopic.update).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
        data: expect.objectContaining({ tags: '["updated"]' }),
      });
      expect(result.tags).toEqual(['updated']);
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete topic when found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());
      prisma.trendingTopic.delete.mockResolvedValue(mockTopic());

      const result = await service.remove('topic-id');

      expect(prisma.trendingTopic.delete).toHaveBeenCalledWith({ where: { id: 'topic-id' } });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
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
  });
});
