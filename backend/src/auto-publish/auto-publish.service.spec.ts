import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AutoPublishService } from './auto-publish.service';
import { AutoPublishSchedulerService } from './auto-publish-scheduler.service';
import { PipelineService } from './pipeline/pipeline.service';
import { WordPressService } from '../channels/wordpress.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutoTaskStatus,
  ArticleRunStatus,
  PublishStatus,
} from '@cms-ng/shared';

// Mock modules that have ESM compatibility issues with Jest
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));
jest.mock('../ai/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({})),
}));

describe('AutoPublishService', () => {
  let service: AutoPublishService;
  // DI wiring sanity checks:module.get 会抛错若 provider 未注册,虽不读但保留隐式校验
  let _prisma: PrismaService;
  let _scheduler: AutoPublishSchedulerService;
  let _pipeline: PipelineService;
  let _wordpress: WordPressService;

  const mockPrisma = {
    autoPublishTask: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    autoPublishRun: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    autoPublishArticle: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    platformPublish: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockScheduler = {
    registerTaskCron: jest.fn(),
    removeTaskCron: jest.fn(),
    enableKillSwitch: jest.fn().mockResolvedValue(undefined),
    disableKillSwitch: jest.fn().mockResolvedValue(undefined),
    isKillSwitchActive: jest.fn().mockResolvedValue(false),
  };

  const mockPipeline = {
    runTask: jest.fn().mockResolvedValue(undefined),
    retrySingleArticle: jest.fn().mockResolvedValue(undefined),
  };

  const mockWordPress = {
    deletePost: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoPublishService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AutoPublishSchedulerService, useValue: mockScheduler },
        { provide: PipelineService, useValue: mockPipeline },
        { provide: WordPressService, useValue: mockWordPress },
      ],
    }).compile();

    service = module.get<AutoPublishService>(AutoPublishService);
    _prisma = module.get<PrismaService>(PrismaService);
    _scheduler = module.get<AutoPublishSchedulerService>(
      AutoPublishSchedulerService,
    );
    _pipeline = module.get<PipelineService>(PipelineService);
    _wordpress = module.get<WordPressService>(WordPressService);

    jest.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create a task with PAUSED status', async () => {
      const dto = {
        name: 'Test Task',
        scheduleConfig: { times: ['08:00'], timezone: 'Asia/Hong_Kong' },
        topicStrategy: { fixedKeywords: ['test'] },
        contentConfig: { style: 'news', maxLength: 800 },
        publishConfig: { platform: 'WORDPRESS' },
      };

      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        status: AutoTaskStatus.PAUSED,
        scheduleConfig: JSON.stringify(dto.scheduleConfig),
        topicStrategy: JSON.stringify(dto.topicStrategy),
        contentConfig: JSON.stringify(dto.contentConfig),
        filterConfig: '{}',
        publishConfig: JSON.stringify(dto.publishConfig),
        retryConfig: '{"maxRetries":2,"retryDelayMs":30000}',
      };

      mockPrisma.autoPublishTask.create.mockResolvedValue(mockTask);

      const result = await service.createTask('user-1', dto as any);

      expect(mockPrisma.autoPublishTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Test Task',
          status: AutoTaskStatus.PAUSED,
          createdBy: 'user-1',
        }),
      });
      expect(result.name).toBe('Test Task');
    });
  });

  describe('manualRun', () => {
    it('should trigger pipeline run for existing task', async () => {
      const mockTask = { id: 'task-1', status: AutoTaskStatus.ACTIVE };
      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(mockTask);

      const result = await service.manualRun('task-1');

      expect(mockPipeline.runTask).toHaveBeenCalledWith('task-1', 'MANUAL');
      expect(result).toEqual({
        message: 'Manual run triggered',
        taskId: 'task-1',
      });
    });

    it('should throw NotFoundException for non-existent task', async () => {
      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(null);

      await expect(service.manualRun('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not throw when pipeline.runTask rejects (fire-and-forget #56 contract)', async () => {
      // Pipeline rejection must be swallowed by the .catch in manualRun so the
      // controller returns 200 immediately and the failure is logged async.
      // If this test ever throws, the swallow was removed and a 500 will
      // surface to the API caller — that's the #56 regression.
      const mockTask = { id: 'task-1', status: AutoTaskStatus.ACTIVE };
      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(mockTask);
      mockPipeline.runTask = jest
        .fn()
        .mockReturnValue(Promise.reject(new Error('Notification step failed')));

      const result = await service.manualRun('task-1');
      expect(result).toEqual({
        message: 'Manual run triggered',
        taskId: 'task-1',
      });

      // Let the microtask queue drain so the .catch handler logs
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  describe('withdrawArticle', () => {
    it('should withdraw a published article and call WordPress delete', async () => {
      const mockRecord = {
        id: 'article-1',
        status: ArticleRunStatus.PUBLISHED,
        platformPublishId: 'publish-1',
      };
      const mockPublish = {
        id: 'publish-1',
        publishedUrl: 'https://example.com/?p=123',
        notes: 'withdraw notes',
      };

      mockPrisma.autoPublishArticle.findUnique.mockResolvedValue(mockRecord);
      mockPrisma.platformPublish.findUnique.mockResolvedValue(mockPublish);
      mockPrisma.platformPublish.update.mockResolvedValue({});
      mockPrisma.autoPublishArticle.update.mockResolvedValue({});

      const result = await service.withdrawArticle('article-1');

      expect(mockWordPress.deletePost).toHaveBeenCalledWith(
        'https://example.com/?p=123',
        'withdraw notes',
      );
      expect(mockPrisma.platformPublish.update).toHaveBeenCalledWith({
        where: { id: 'publish-1' },
        data: { status: PublishStatus.FAILED, notes: 'Withdrawn by user' },
      });
      expect(result).toEqual({ withdrawn: true });
    });

    it('should throw BadRequestException for non-published article', async () => {
      const mockRecord = {
        id: 'article-1',
        status: ArticleRunStatus.FAILED,
        platformPublishId: 'publish-1',
      };

      mockPrisma.autoPublishArticle.findUnique.mockResolvedValue(mockRecord);

      await expect(service.withdrawArticle('article-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent article', async () => {
      mockPrisma.autoPublishArticle.findUnique.mockResolvedValue(null);

      await expect(service.withdrawArticle('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('retryArticle', () => {
    it('should retry a single failed article', async () => {
      const mockRecord = {
        id: 'article-1',
        status: ArticleRunStatus.FAILED,
      };

      mockPrisma.autoPublishArticle.findUnique.mockResolvedValue(mockRecord);

      const result = await service.retryArticle('article-1');

      expect(mockPipeline.retrySingleArticle).toHaveBeenCalledWith('article-1');
      expect(result).toEqual({
        message: 'Retry triggered for single article',
        articleId: 'article-1',
      });
    });

    it('should throw BadRequestException for non-failed article', async () => {
      const mockRecord = {
        id: 'article-1',
        status: ArticleRunStatus.PUBLISHED,
      };

      mockPrisma.autoPublishArticle.findUnique.mockResolvedValue(mockRecord);

      await expect(service.retryArticle('article-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('toggleTask', () => {
    it('should await registerTaskCron before returning when activating a task', async () => {
      // Deferred tracker: registerTaskCron's completion is signaled through this
      let resolveRegister: () => void;
      const registerDone = new Promise<void>((res) => {
        resolveRegister = res;
      });

      mockScheduler.registerTaskCron.mockImplementation(async () => {
        await registerDone;
      });

      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        status: AutoTaskStatus.PAUSED,
        nextRunAt: null,
      };
      const updatedTask = {
        ...mockTask,
        status: AutoTaskStatus.ACTIVE,
        nextRunAt: new Date('2026-06-05T08:00:00.000Z'),
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(mockTask);
      mockPrisma.autoPublishTask.update.mockResolvedValue(updatedTask);

      const togglePromise = service.toggleTask('task-1');

      // Give toggleTask a chance to return synchronously if it doesn't await registerTaskCron
      await new Promise((r) => setTimeout(r, 10));

      // Check whether toggleTask has resolved yet using Promise.race trick
      let toggleResolved = false;
      togglePromise.then(() => {
        toggleResolved = true;
      });

      // If toggleTask awaited registerTaskCron, it should still be pending after 10ms
      // (because registerDone is not resolved yet)
      await new Promise((r) => setTimeout(r, 5));
      expect(toggleResolved).toBe(false);

      // Now complete registerTaskCron
      resolveRegister!();

      // toggleTask should now complete
      const result = await togglePromise;
      expect(result.status).toBe(AutoTaskStatus.ACTIVE);
    });

    it('should call removeTaskCron when pausing a task', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        status: AutoTaskStatus.ACTIVE,
        nextRunAt: new Date(),
      };
      const updatedTask = {
        ...mockTask,
        status: AutoTaskStatus.PAUSED,
        nextRunAt: null,
      };

      mockPrisma.autoPublishTask.findUnique.mockResolvedValue(mockTask);
      mockPrisma.autoPublishTask.update.mockResolvedValue(updatedTask);

      await service.toggleTask('task-1');

      expect(mockScheduler.removeTaskCron).toHaveBeenCalledWith('task-1');
    });
  });

  describe('killSwitch', () => {
    it('should enable kill switch and forward operator + reason', async () => {
      mockScheduler.isKillSwitchActive.mockResolvedValue(true);

      const result = await service.killSwitch(
        true,
        'admin-uuid-1',
        'emergency',
      );

      expect(mockScheduler.enableKillSwitch).toHaveBeenCalledWith(
        'admin-uuid-1',
        'emergency',
      );
      expect(result).toEqual({ killSwitchActive: true });
    });

    it('should disable kill switch and forward operator', async () => {
      mockScheduler.isKillSwitchActive.mockResolvedValue(false);

      const result = await service.killSwitch(false, 'admin-uuid-1');

      expect(mockScheduler.disableKillSwitch).toHaveBeenCalledWith(
        'admin-uuid-1',
      );
      expect(result).toEqual({ killSwitchActive: false });
    });
  });

  describe('getStats', () => {
    it('should return aggregated statistics', async () => {
      mockPrisma.autoPublishTask.count
        .mockResolvedValueOnce(10) // totalTasks
        .mockResolvedValueOnce(3); // activeTasks
      mockPrisma.autoPublishRun.count.mockResolvedValue(50);
      // autoPublishArticle.count is called 3 times in order:
      // 1. totalArticles (no filter), 2. successArticles, 3. failedArticles
      mockPrisma.autoPublishArticle.count
        .mockResolvedValueOnce(100) // totalArticles
        .mockResolvedValueOnce(80) // successArticles
        .mockResolvedValueOnce(20); // failedArticles
      mockScheduler.isKillSwitchActive.mockResolvedValue(false);

      const result = await service.getStats();

      expect(result).toEqual({
        totalTasks: 10,
        activeTasks: 3,
        totalRuns: 50,
        totalArticles: 100,
        successArticles: 80,
        failedArticles: 20,
        successRate: 80,
        killSwitchActive: false,
      });
    });
  });
});
