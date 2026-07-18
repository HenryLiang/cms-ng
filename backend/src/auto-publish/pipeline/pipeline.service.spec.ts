import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AutoPublishSchedulerService } from '../auto-publish-scheduler.service';
import { PipelineService } from './pipeline.service';
import { PipelineStep, PipelineContext } from './step.interface';
import { ArticleRunStatus, RunStatus, ArticleStatus } from '@cms-ng/shared';
import { TopicCollectionStep } from './steps/topic-collection.step';
import { ResearchStep } from './steps/research.step';
import { ArticleGenerationStep } from './steps/article-generation.step';
import { ImageGenerationStep } from './steps/image-generation.step';
import { ArticleSaveStep } from './steps/article-save.step';
import { PublishStep } from './steps/publish.step';
import { NotificationStep } from './steps/notification.step';
import { BillingCheckStep } from './steps/billing-check.step';
import { BillingService } from '../../billing/billing.service';

// Mock modules that have ESM compatibility issues with Jest
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));
jest.mock('../../ai/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({})),
}));

describe('PipelineService — notification step isolation (issue #56)', () => {
  let service: PipelineService;

  // We use real step instances with stubbed `execute` so we can flip behavior
  // per test. The pipeline service itself is real — we just control step I/O.
  const steps: PipelineStep[] = [];
  const stepBehavior: Record<string, () => Promise<PipelineContext>> = {};

  const buildStep = (
    name: string,
    successStatus: ArticleRunStatus,
  ): PipelineStep => ({
    name,
    successStatus,
    execute: jest.fn(async (ctx: PipelineContext) => {
      await stepBehavior[name]();
      return ctx;
    }),
  });

  const mockPrisma = {
    autoPublishTask: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    autoPublishRun: {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    autoPublishArticle: {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    article: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: any) => {
      // No SMTP configured → transporter stays undefined → no email send attempted
      if (key === 'SMTP_HOST' || key === 'SMTP_USER' || key === 'SMTP_PASS') {
        return undefined;
      }
      if (key === 'SMTP_PORT') return 587;
      return defaultValue;
    }),
  };

  const mockRedis = {
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(true),
    isAvailable: true,
  };

  const mockScheduler = {
    isKillSwitchActive: jest.fn().mockResolvedValue(false),
  };

  const billingService = {
    isEnabled: jest.fn().mockReturnValue(false),
    checkBalance: jest.fn().mockResolvedValue(true),
    deduct: jest.fn().mockResolvedValue(null),
    credit: jest.fn().mockResolvedValue(null),
    estimateCost: jest.fn().mockResolvedValue({
      estimatedCost: 0,
      breakdown: [],
      sufficientBalance: true,
      currentBalance: 100,
    }),
    checkAndAlertBalance: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockResolvedValue({ unitPrice: 0.02 }),
  };

  const billingCheckStep = {
    name: 'billing_check',
    successStatus: ArticleRunStatus.PENDING,
    execute: jest
      .fn()
      .mockImplementation((ctx: PipelineContext) => Promise.resolve(ctx)),
  };

  beforeEach(async () => {
    // Reset step behaviors and instances
    steps.length = 0;
    Object.keys(stepBehavior).forEach((k) => delete stepBehavior[k]);

    // Default: all steps succeed and just pass ctx through
    [
      'billing_check',
      'topic-collection',
      'research',
      'article-generation',
      'article-save',
      'image-generation',
      'publish',
      'notification',
    ].forEach((name) => {
      stepBehavior[name] = jest.fn().mockResolvedValue(undefined);
    });

    // Build step instances with the same names the real pipeline uses
    steps.push(buildStep('billing_check', ArticleRunStatus.PENDING));
    steps.push(buildStep('topic-collection', ArticleRunStatus.TOPIC_SELECTED));
    steps.push(buildStep('research', ArticleRunStatus.RESEARCHED));
    steps.push(buildStep('article-generation', ArticleRunStatus.DRAFTED));
    steps.push(buildStep('article-save', ArticleRunStatus.SAVED));
    steps.push(buildStep('image-generation', ArticleRunStatus.IMAGED));
    steps.push(buildStep('publish', ArticleRunStatus.PUBLISHED));
    steps.push(buildStep('notification', ArticleRunStatus.PUBLISHED));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
        { provide: AutoPublishSchedulerService, useValue: mockScheduler },
        { provide: BillingService, useValue: billingService },
        { provide: BillingCheckStep, useValue: billingCheckStep },
        // Step stubs — replaced wholesale below; existence is enough for DI
        { provide: TopicCollectionStep, useValue: {} },
        { provide: ResearchStep, useValue: {} },
        { provide: ArticleGenerationStep, useValue: {} },
        { provide: ImageGenerationStep, useValue: {} },
        { provide: ArticleSaveStep, useValue: {} },
        { provide: PublishStep, useValue: {} },
        { provide: NotificationStep, useValue: {} },
      ],
    }).compile();

    service = module.get<PipelineService>(PipelineService);

    // Replace internal step list with our stubs
    (service as any).steps = steps;

    jest.clearAllMocks();
  });

  const setupTaskAndRun = (batchSize = 1) => {
    const taskId = 'task-1';
    const runId = 'run-1';
    const articleId = 'article-1';

    mockPrisma.autoPublishTask.findUnique.mockResolvedValue({
      id: taskId,
      status: 'ACTIVE',
      batchSize,
      retryConfig: '{"maxRetries":0,"retryDelayMs":100}',
      contentConfig: '{}',
      publishConfig: '{}',
      createdBy: 'user-1',
    });

    mockPrisma.autoPublishRun.create.mockResolvedValue({ id: runId, taskId });
    mockPrisma.autoPublishArticle.create.mockResolvedValue({ id: articleId });
  };

  it('marks run COMPLETED when the notification step throws (publish already succeeded)', async () => {
    setupTaskAndRun(1);

    // Notification step throws (e.g., SMTP failure) — but publish already succeeded
    stepBehavior['notification'] = jest
      .fn()
      .mockRejectedValue(new Error('SMTP timeout'));

    await service.runTask('task-1', 'MANUAL');

    // The run update should record COMPLETED, not FAILED
    const updateCall = mockPrisma.autoPublishRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe(RunStatus.COMPLETED);
    expect(updateCall.data.failedCount).toBe(0);
    expect(updateCall.data.successCount).toBe(1);

    // Article should NOT be marked FAILED — it was published
    const articleUpdates = mockPrisma.autoPublishArticle.update.mock.calls;
    const finalArticleUpdate = articleUpdates[articleUpdates.length - 1][0];
    expect(finalArticleUpdate.data.status).not.toBe(ArticleRunStatus.FAILED);
    expect(finalArticleUpdate.data.failedStep).toBeUndefined();
  });

  it('marks run FAILED when the publish step throws (real critical failure)', async () => {
    setupTaskAndRun(1);

    // Publish step throws (e.g., WordPress API down) — this IS critical
    stepBehavior['publish'] = jest
      .fn()
      .mockRejectedValue(new Error('WordPress API down'));

    await service.runTask('task-1', 'MANUAL');

    const updateCall = mockPrisma.autoPublishRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe(RunStatus.FAILED);
    expect(updateCall.data.failedCount).toBe(1);
    expect(updateCall.data.successCount).toBe(0);
  });

  it('marks run PARTIAL when some articles fail at critical step and notification also fails', async () => {
    // 2 articles: first article fails at publish (critical), second succeeds through notification
    // BUT: because notification throws on the second article, both still count: 1 success + 1 fail
    // The notification failure on article 2 should NOT count as a failure

    const taskId = 'task-1';
    const articleIds = ['article-1', 'article-2'];

    mockPrisma.autoPublishTask.findUnique.mockResolvedValue({
      id: taskId,
      status: 'ACTIVE',
      batchSize: 2,
      retryConfig: '{"maxRetries":0,"retryDelayMs":100}',
      contentConfig: '{}',
      publishConfig: '{}',
      createdBy: 'user-1',
    });
    mockPrisma.autoPublishRun.create.mockResolvedValue({ id: 'run-1', taskId });
    mockPrisma.autoPublishArticle.create
      .mockResolvedValueOnce({ id: articleIds[0] })
      .mockResolvedValueOnce({ id: articleIds[1] });

    // Track call count for publish — fail on first article, succeed on second
    let publishCallCount = 0;
    stepBehavior['publish'] = jest.fn().mockImplementation(() => {
      publishCallCount++;
      if (publishCallCount === 1) {
        throw new Error('WordPress down');
      }
    });

    // Notification throws for second article (after publish succeeded)
    let notifCallCount = 0;
    stepBehavior['notification'] = jest.fn().mockImplementation(() => {
      notifCallCount++;
      if (notifCallCount === 1) {
        throw new Error('SMTP timeout');
      }
    });

    await service.runTask('task-1', 'MANUAL');

    const updateCall = mockPrisma.autoPublishRun.update.mock.calls[0][0];
    // 1 article failed at publish (critical), 1 succeeded at all 7 steps → PARTIAL
    expect(updateCall.data.status).toBe(RunStatus.PARTIAL);
    expect(updateCall.data.failedCount).toBe(1);
    expect(updateCall.data.successCount).toBe(1);
  });

  it('does not mark article as PIPELINE_FAILED when only notification step failed', async () => {
    setupTaskAndRun(1);

    stepBehavior['notification'] = jest
      .fn()
      .mockRejectedValue(new Error('SMTP timeout'));

    await service.runTask('task-1', 'MANUAL');

    // The article update for FAILED status (with PIPELINE_FAILED ArticleStatus)
    // should never have been called — only the success status updates
    const articleStatusUpdates = mockPrisma.autoPublishArticle.update.mock.calls
      .map((call) => call[0].data.status)
      .filter((status) => status === ArticleRunStatus.FAILED);

    expect(articleStatusUpdates).toHaveLength(0);

    // The article table (CMS Article) should NOT be updated to PIPELINE_FAILED
    const articleTableCalls = mockPrisma.article.update.mock.calls;
    expect(articleTableCalls).toHaveLength(0);
  });
});
