import { Test, TestingModule } from '@nestjs/testing';
import { TopicCollectionStep } from './topic-collection.step';
import { PrismaService } from '../../../prisma/prisma.service';
import { TrendingTopicsService } from '../../../trending-topics/trending-topics.service';
import { PipelineContext } from '../step.interface';

// Mock modules that have ESM compatibility issues with Jest
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));
jest.mock('../../../ai/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({})),
}));

describe('TopicCollectionStep', () => {
  let step: TopicCollectionStep;
  let prisma: PrismaService;
  let trendingTopics: TrendingTopicsService;

  const mockPrisma = {
    autoPublishArticle: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    autoPublishTask: {
      findUnique: jest.fn(),
    },
    trendingTopic: {
      findMany: jest.fn(),
    },
  };

  const mockTrendingTopics = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicCollectionStep,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TrendingTopicsService, useValue: mockTrendingTopics },
      ],
    }).compile();

    step = module.get<TopicCollectionStep>(TopicCollectionStep);
    prisma = module.get<PrismaService>(PrismaService);
    trendingTopics = module.get<TrendingTopicsService>(TrendingTopicsService);

    jest.clearAllMocks();
  });

  const createCtx = (
    overrides: Partial<PipelineContext> = {},
  ): PipelineContext => ({
    taskId: 'task-1',
    runId: 'run-1',
    articleId: 'article-1',
    userId: 'user-1',
    contentConfig: {},
    publishConfig: {},
    ...overrides,
  });

  describe('execute', () => {
    it('should select a fixed keyword as topic', async () => {
      const ctx = createCtx({
        contentConfig: { language: 'TRADITIONAL_CHINESE_HK' },
        publishConfig: {},
      });

      const task = {
        topicStrategy: JSON.stringify({
          fixedKeywords: ['科技', 'AI', '创新'],
          useTrending: false,
        }),
        filterConfig: JSON.stringify({
          blockedKeywords: [],
        }),
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(task);
      mockPrisma.autoPublishArticle.findMany.mockResolvedValue([]);
      mockPrisma.autoPublishArticle.count.mockResolvedValue(0);

      const result = await step.execute(ctx);

      expect(result.topic).toBeDefined();
      expect(['科技', 'AI', '创新']).toContain(result.topic);
    });

    it('should filter out blocked keywords', async () => {
      const ctx = createCtx();

      const task = {
        topicStrategy: JSON.stringify({
          fixedKeywords: ['科技', 'AI'],
          useTrending: false,
        }),
        filterConfig: JSON.stringify({
          blockedKeywords: ['AI'],
        }),
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(task);
      mockPrisma.autoPublishArticle.findMany.mockResolvedValue([]);
      mockPrisma.autoPublishArticle.count.mockResolvedValue(0);

      const result = await step.execute(ctx);

      expect(result.topic).toBe('科技');
    });

    it('should deduplicate topics used in last 24 hours', async () => {
      const ctx = createCtx();

      const task = {
        topicStrategy: JSON.stringify({
          fixedKeywords: ['科技', 'AI'],
          useTrending: false,
        }),
        filterConfig: JSON.stringify({
          blockedKeywords: [],
        }),
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(task);
      mockPrisma.autoPublishArticle.findMany.mockResolvedValue([
        { topic: '科技' },
      ]);
      mockPrisma.autoPublishArticle.count.mockResolvedValue(0);

      const result = await step.execute(ctx);

      expect(result.topic).toBe('AI');
    });

    it('should fall back to deduped candidates when all unique topics are exhausted', async () => {
      const ctx = createCtx();

      const task = {
        topicStrategy: JSON.stringify({
          fixedKeywords: ['科技'],
          useTrending: false,
        }),
        filterConfig: JSON.stringify({
          blockedKeywords: [],
        }),
      };

      // '科技' was written in last 24h → dedup removes it from unique pool.
      // With the fallback, the step should reuse '科技' rather than fail.
      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(task);
      mockPrisma.autoPublishArticle.findMany.mockResolvedValue([
        { topic: '科技' },
      ]);
      mockPrisma.autoPublishArticle.count.mockResolvedValue(0);

      const result = await step.execute(ctx);

      expect(result.topic).toBe('科技');
    });

    it('should throw error when all keywords are filtered', async () => {
      const ctx = createCtx();

      const task = {
        topicStrategy: JSON.stringify({
          fixedKeywords: ['AI'],
          useTrending: false,
        }),
        filterConfig: JSON.stringify({
          blockedKeywords: ['AI'],
        }),
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(task);
      mockPrisma.autoPublishArticle.findMany.mockResolvedValue([]);

      await expect(step.execute(ctx)).rejects.toThrow(
        'No available topics after filtering',
      );
    });

    it('should throw error when no keywords and no trending', async () => {
      const ctx = createCtx();

      const task = {
        topicStrategy: JSON.stringify({
          fixedKeywords: [],
          useTrending: false,
        }),
        filterConfig: JSON.stringify({
          blockedKeywords: [],
        }),
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(task);
      mockPrisma.autoPublishArticle.findMany.mockResolvedValue([]);

      await expect(step.execute(ctx)).rejects.toThrow('No available topics');
    });
  });
});
