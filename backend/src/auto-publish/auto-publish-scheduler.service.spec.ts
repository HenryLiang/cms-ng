import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AutoPublishSchedulerService } from './auto-publish-scheduler.service';
import { PipelineService } from './pipeline/pipeline.service';

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));
jest.mock('../ai/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({})),
}));

describe('AutoPublishSchedulerService — timeToCron (issue #50)', () => {
  let service: AutoPublishSchedulerService;

  const mockPrisma = {
    autoPublishTask: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    killSwitch: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
    getCronJobs: jest.fn().mockReturnValue(new Map()),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockPipeline = {
    runTask: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoPublishSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SchedulerRegistry, useValue: mockSchedulerRegistry },
        { provide: PipelineService, useValue: mockPipeline },
      ],
    }).compile();

    service = module.get<AutoPublishSchedulerService>(
      AutoPublishSchedulerService,
    );
    jest.clearAllMocks();
  });

  // timeToCron is private — we exercise it through registerTaskCron, the
  // production code path. We assert behavior by inspecting whether the
  // scheduler registry receives a cron job (valid) or a BadRequestException
  // bubbles up (invalid).

  describe('registerTaskCron — HH:MM form (legacy)', () => {
    it('converts 08:00 to a registered cron job', async () => {
      const task = {
        id: 'task-hhmm',
        name: 'HH:MM task',
        scheduleConfig: JSON.stringify({
          times: ['08:00'],
          timezone: 'Asia/Hong_Kong',
        }),
      };
      await service.registerTaskCron(task);

      expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);
      const [jobName] = mockSchedulerRegistry.addCronJob.mock.calls[0];
      expect(jobName).toBe('auto-publish-task-hhmm-0');
    });

    it('throws BadRequestException on out-of-range HH:MM (25:00)', async () => {
      const task = {
        id: 'task-bad-hhmm',
        name: 'bad HH:MM',
        scheduleConfig: JSON.stringify({
          times: ['25:00'],
          timezone: 'Asia/Hong_Kong',
        }),
      };
      await expect(
        service.registerTaskCron(task as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockSchedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });
  });

  describe('registerTaskCron — standard cron (issue #50 acceptance)', () => {
    it('accepts "*/5 * * * *" and registers a cron job', async () => {
      const task = {
        id: 'task-cron',
        name: 'cron task',
        scheduleConfig: JSON.stringify({
          times: ['*/5 * * * *'],
          timezone: 'Asia/Hong_Kong',
        }),
      };
      await service.registerTaskCron(task);

      expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);
      const [jobName] = mockSchedulerRegistry.addCronJob.mock.calls[0];
      expect(jobName).toBe('auto-publish-task-cron-0');
    });

    it('accepts complex cron "0 0 * * 0" (weekly Sunday midnight)', async () => {
      const task = {
        id: 'task-cron-weekly',
        name: 'weekly cron',
        scheduleConfig: JSON.stringify({
          times: ['0 0 * * 0'],
          timezone: 'Asia/Shanghai',
        }),
      };
      await service.registerTaskCron(task);

      expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerTaskCron — invalid cron must throw, never silently skip', () => {
    it('throws BadRequestException on garbage cron "not-a-cron"', async () => {
      const task = {
        id: 'task-bad-cron',
        name: 'bad cron',
        scheduleConfig: JSON.stringify({
          times: ['not-a-cron'],
          timezone: 'Asia/Hong_Kong',
        }),
      };

      await expect(
        service.registerTaskCron(task as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockSchedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on cron with out-of-range value "60 * * * *"', async () => {
      const task = {
        id: 'task-out-of-range',
        name: 'out of range cron',
        scheduleConfig: JSON.stringify({
          times: ['60 * * * *'],
          timezone: 'Asia/Hong_Kong',
        }),
      };

      await expect(
        service.registerTaskCron(task as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
