jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@cms-ng/shared';
import { AIService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { TopicSourceCatalog } from './sources/topic-source.catalog';
import { TrendingTopicsService } from './trending-topics.service';

describe('TrendingTopicsService', () => {
  let service: TrendingTopicsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let aiService: { generateStorySuggestions: jest.Mock };
  let sourceCatalog: { fetch: jest.Mock };

  const mockTopic = (override?: Record<string, unknown>) => ({
    id: 'topic-id',
    title: 'Test Topic',
    description: 'Desc',
    source: 'bbc',
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

  beforeEach(async () => {
    prisma = createMockPrismaService();
    aiService = { generateStorySuggestions: jest.fn() };
    sourceCatalog = { fetch: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendingTopicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AIService, useValue: aiService },
        { provide: TopicSourceCatalog, useValue: sourceCatalog },
      ],
    }).compile();
    service = module.get(TrendingTopicsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a curated topic with serialized tags', async () => {
    prisma.trendingTopic.create.mockResolvedValue(mockTopic());
    const result = await service.create('user-id', {
      title: 'Test Topic',
      tags: ['tag1'],
      heatScore: 50,
    });
    expect(prisma.trendingTopic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Test Topic',
        tags: '["tag1"]',
        createdBy: 'user-id',
      }),
    });
    expect(result.tags).toEqual(['tag1']);
  });

  it('lists curated topics by heat and creation time', async () => {
    prisma.trendingTopic.findMany.mockResolvedValue([
      mockTopic({ id: 't1', heatScore: 90 }),
      mockTopic({ id: 't2', heatScore: 30 }),
    ]);
    const result = await service.findAll();
    expect(prisma.trendingTopic.findMany).toHaveBeenCalledWith({
      orderBy: [{ heatScore: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result.map((topic) => topic.id)).toEqual(['t1', 't2']);
  });

  it('enforces ownership while updating curated topics', async () => {
    prisma.trendingTopic.findUnique.mockResolvedValue(
      mockTopic({ createdBy: 'other-user' }),
    );
    await expect(
      service.update(
        'topic-id',
        { title: 'Changed' },
        'user-id',
        UserRole.REPORTER,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('deletes an owned curated topic', async () => {
    prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());
    prisma.trendingTopic.delete.mockResolvedValue(mockTopic());
    await expect(
      service.remove('topic-id', 'user-id', UserRole.REPORTER),
    ).resolves.toEqual({ success: true });
    expect(prisma.trendingTopic.delete).toHaveBeenCalledWith({
      where: { id: 'topic-id' },
    });
  });

  it('generates suggestions from the user profile and recent curated topics', async () => {
    prisma.user.findUnique.mockResolvedValue({
      name: 'Reporter',
      expertise: '["tech"]',
      department: 'News',
    });
    prisma.trendingTopic.findMany.mockResolvedValue([{ title: 'AI' }]);
    aiService.generateStorySuggestions.mockResolvedValue([
      { title: 'Suggestion' },
    ]);
    await service.generateAISuggestions('user-id');
    expect(aiService.generateStorySuggestions).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({ expertise: ['tech'] }),
      ['AI'],
    );
  });

  it('adopts an open topic into a story and marks it adopted', async () => {
    prisma.trendingTopic.findUnique.mockResolvedValue(
      mockTopic({ suggestedAngles: '["Angle 1"]' }),
    );
    prisma.story.create.mockResolvedValue({ id: 'story-id' });
    prisma.trendingTopic.update.mockResolvedValue(mockTopic());
    await expect(service.adoptTopic('topic-id', 'user-id')).resolves.toEqual({
      storyId: 'story-id',
      topicId: 'topic-id',
    });
    expect(prisma.story.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        angle: 'Angle 1',
        reporterId: 'user-id',
      }),
    });
  });

  it('rejects missing and already-adopted topics', async () => {
    prisma.trendingTopic.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    prisma.trendingTopic.findUnique.mockResolvedValueOnce(
      mockTopic({ status: 'ADOPTED' }),
    );
    await expect(service.adoptTopic('topic-id', 'user-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('keeps legacy source methods as catalog-backed compatibility shims', async () => {
    sourceCatalog.fetch.mockResolvedValue({ items: [] });
    await service.fetchGoogleTrends('US', '24h', 2, 5);
    expect(sourceCatalog.fetch).toHaveBeenCalledWith(
      'google-trends',
      {},
      { page: 2, limit: 5, params: { geo: 'US', timeRange: '24h' } },
    );
  });

  it('imports every candidate through one persistence path', async () => {
    prisma.trendingTopic.create.mockResolvedValue(
      mockTopic({ source: 'google-trends' }),
    );
    await service.importFromGoogleTrends('user-id', {
      title: 'Imported',
      source: 'ignored',
    });
    expect(prisma.trendingTopic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Imported',
        source: 'google-trends',
        createdBy: 'user-id',
      }),
    });
  });
});
