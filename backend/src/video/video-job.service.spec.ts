import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { createMock } from '../common/test-helpers';
import { VideoJobService } from './video-job.service';
import { VideoGenProvider } from './providers/video-gen/video-gen-provider.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type { BillingService } from '../billing/billing.service';
import type { SearchService } from '../search/search.service';
import type { StorageService } from '../storage/storage.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const JOB = {
  id: 'job-1',
  userId: 'user-1',
  mode: 'TEXT_TO_CLIP',
  status: 'PENDING',
  prompt: '一只柴犬在樱花树下奔跑',
  provider: 'minimax',
  providerTaskId: null as string | null,
  durationSec: 6,
  resolution: '768P',
  aspectRatio: '9:16',
  costEstimate: 3,
  costActual: null,
  resultAssetId: null,
  failedStep: null as string | null,
  error: null as string | null,
  retryCount: 0,
  articleId: null,
  createdAt: new Date('2026-08-07T00:00:00Z'),
  updatedAt: new Date('2026-08-07T00:00:00Z'),
};

describe('VideoJobService', () => {
  let prisma: {
    videoGenerationJob: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    mediaAsset: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let billing: {
    isEnabled: jest.Mock;
    getConfig: jest.Mock;
    deduct: jest.Mock;
  };
  let storage: { put: jest.Mock };
  let search: { indexAsset: jest.Mock };
  let provider: jest.Mocked<VideoGenProvider>;
  let service: VideoJobService;

  function build(opts?: { enabled?: string; withProvider?: boolean }) {
    prisma = {
      videoGenerationJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      mediaAsset: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    billing = {
      isEnabled: jest.fn().mockReturnValue(true),
      getConfig: jest.fn().mockResolvedValue({ unitPrice: 2.0 }),
      deduct: jest.fn().mockResolvedValue({}),
    };
    storage = {
      put: jest.fn().mockResolvedValue({
        url: 'https://cos/x.mp4',
        key: 'video/job-1.mp4',
      }),
    };
    search = { indexAsset: jest.fn().mockResolvedValue(undefined) };
    provider = {
      name: 'minimax',
      submit: jest.fn(),
      poll: jest.fn(),
      estimateCost: jest.fn().mockReturnValue(3),
    } as unknown as jest.Mocked<VideoGenProvider>;
    const config = createMock<ConfigService>({
      get: jest.fn((key: string) =>
        key === 'VIDEO_GENERATION_ENABLED'
          ? (opts?.enabled ?? 'true')
          : undefined,
      ),
    } as unknown as ConfigService);
    service = new VideoJobService(
      prisma as unknown as PrismaService,
      config,
      billing as unknown as BillingService,
      storage as unknown as StorageService,
      search as unknown as SearchService,
      opts?.withProvider === false ? null : provider,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  describe('能力开关', () => {
    it('VIDEO_GENERATION_ENABLED!=true 时关闭', () => {
      build({ enabled: 'false' });
      expect(service.isEnabled()).toBe(false);
    });
    it('开关 true 但无 provider 时降级关闭', () => {
      build({ withProvider: false });
      expect(service.isEnabled()).toBe(false);
    });
    it('关闭时 create 抛 503,不写库', async () => {
      build({ enabled: 'false' });
      await expect(service.create('user-1', { prompt: 'x' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.videoGenerationJob.create).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('落库 PENDING 并异步 kick 提交', async () => {
      build();
      prisma.videoGenerationJob.create.mockResolvedValue({ ...JOB });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...JOB });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.submit.mockResolvedValue({ taskId: 'mm-task-1' });

      const vo = await service.create('user-1', { prompt: JOB.prompt });
      // 等异步 kick 落定
      await new Promise((r) => setImmediate(r));

      expect(prisma.videoGenerationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            mode: 'TEXT_TO_CLIP',
            provider: 'minimax',
            costEstimate: 3,
          }),
        }),
      );
      expect(vo.status).toBe('PENDING');
      expect(provider.submit).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: JOB.prompt, durationSec: 6 }),
      );
    });

    it('指定的 provider 与当前启用不一致时拒绝', async () => {
      build();
      await expect(
        service.create('user-1', { prompt: 'x', provider: 'volcengine' }),
      ).rejects.toThrow(/仅启用 provider=minimax/);
    });
  });

  describe('submitStage', () => {
    it('抢占失败(非 PENDING)时不调 provider', async () => {
      build();
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 0 });
      await service.submitStage('job-1');
      expect(provider.submit).not.toHaveBeenCalled();
    });

    it('提交异常 → FAILED(failedStep=submit)', async () => {
      build();
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...JOB });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.submit.mockRejectedValue(new Error('quota exhausted'));

      await service.submitStage('job-1');

      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failedStep: 'submit',
          error: 'quota exhausted',
        }),
      });
    });
  });

  describe('pollStage', () => {
    it('processing → 触碰 updatedAt,不转移', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: 'mm-task-1',
        updatedAt: new Date(),
      });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.poll.mockResolvedValue({ state: 'processing' });

      await service.pollStage('job-1');

      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { updatedAt: expect.any(Date) },
      });
      expect(prisma.videoGenerationJob.updateMany).not.toHaveBeenCalled();
    });

    it('生成超时(30min)→ FAILED', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: 'mm-task-1',
        updatedAt: new Date(Date.now() - 31 * 60 * 1000),
      });
      prisma.videoGenerationJob.update.mockResolvedValue({});

      await service.pollStage('job-1');

      expect(provider.poll).not.toHaveBeenCalled();
      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            failedStep: 'poll',
          }),
        }),
      );
    });

    it('provider 轮询瞬时异常 → 不置失败,等下一轮', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: 'mm-task-1',
        updatedAt: new Date(),
      });
      provider.poll.mockRejectedValue(new Error('socket hangup'));

      await service.pollStage('job-1');

      expect(prisma.videoGenerationJob.update).not.toHaveBeenCalled();
      expect(prisma.videoGenerationJob.updateMany).not.toHaveBeenCalled();
    });

    it('缺 providerTaskId 但在宽限期内(submit 进行中)→ 跳过,防重复提交', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: null,
        updatedAt: new Date(), // submitStage 刚抢占,provider.submit 网络窗口内
      });

      await service.pollStage('job-1');

      expect(prisma.videoGenerationJob.updateMany).not.toHaveBeenCalled();
      expect(prisma.videoGenerationJob.update).not.toHaveBeenCalled();
    });

    it('缺 providerTaskId 且超过宽限期(真崩溃)→ 回退 PENDING 重新提交', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: null,
        updatedAt: new Date(Date.now() - 3 * 60 * 1000),
      });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });

      await service.pollStage('job-1');

      expect(prisma.videoGenerationJob.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', status: 'ASSETS_GENERATING' },
        data: { status: 'PENDING' },
      });
    });
  });

  describe('succeeded → 上传入库全链路', () => {
    it('下载→COS→登记 MediaAsset→计费→SUCCEEDED,且不发打标事件', async () => {
      build();
      const asset = { id: 'asset-1', url: 'https://cos/x.mp4' };
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: 'mm-task-1',
        updatedAt: new Date(),
      });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      prisma.mediaAsset.create.mockResolvedValue(asset);
      provider.poll.mockResolvedValue({
        state: 'succeeded',
        videoUrl: 'https://cdn/temp.mp4',
        width: 1080,
        height: 1920,
      });
      mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });

      await service.pollStage('job-1');

      expect(storage.put).toHaveBeenCalledWith(
        'video/job-1.mp4',
        expect.any(Buffer),
        'video/mp4',
      );
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mimeType: 'video/mp4',
            source: 'AI_GENERATED',
            sourceRef: 'videoJob:job-1',
            tagStatus: 'NONE',
            width: 1080,
            height: 1920,
            duration: 6,
          }),
        }),
      );
      expect(billing.deduct).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'AI_VIDEO',
          idempotencyKey: 'video:job-1',
        }),
      );
      expect(search.indexAsset).toHaveBeenCalledWith('asset-1');
      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            resultAssetId: 'asset-1',
          }),
        }),
      );
    });

    it('上传转存失败 → FAILED(failedStep=upload),供重试复用 provider 结果', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: 'mm-task-1',
        updatedAt: new Date(),
      });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.poll.mockResolvedValue({
        state: 'succeeded',
        videoUrl: 'https://cdn/temp.mp4',
      });
      mockedAxios.get.mockRejectedValue(new Error('download timeout'));

      await service.pollStage('job-1');

      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            failedStep: 'upload',
          }),
        }),
      );
    });
  });

  describe('retry / cancel', () => {
    it('upload 阶段失败重试 → 回 ASSETS_GENERATING 复用 providerTaskId(不重复扣费)', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'FAILED',
        failedStep: 'upload',
        providerTaskId: 'mm-task-1',
      });
      prisma.videoGenerationJob.update.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
      });
      provider.poll.mockResolvedValue({ state: 'processing' });

      await service.retry('user-1', 'job-1');

      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ASSETS_GENERATING',
            retryCount: { increment: 1 },
          }),
        }),
      );
      expect(provider.submit).not.toHaveBeenCalled();
    });

    it('非 upload 失败重试 → 回 PENDING 重新生成', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'FAILED',
        failedStep: 'generate',
        providerTaskId: 'mm-task-1',
      });
      prisma.videoGenerationJob.update.mockResolvedValue({ ...JOB });

      await service.retry('user-1', 'job-1');

      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('超过最大重试次数拒绝', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'FAILED',
        retryCount: 3,
      });
      await expect(service.retry('user-1', 'job-1')).rejects.toThrow(
        /最大重试次数/,
      );
    });

    it('cancel 抢占进行中状态;已完成任务不可取消', async () => {
      build();
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
      });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      await service.cancel('user-1', 'job-1');
      expect(prisma.videoGenerationJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );

      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.cancel('user-1', 'job-1')).rejects.toThrow(
        /不可取消/,
      );
    });
  });

  describe('sweep 僵尸清理', () => {
    it('上传阶段超 10 分钟 → FAILED(upload)', async () => {
      build();
      prisma.videoGenerationJob.findMany.mockResolvedValue([]);
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 2 });

      await service.sweep();

      expect(prisma.videoGenerationJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'UPLOADING' }),
          data: expect.objectContaining({
            status: 'FAILED',
            failedStep: 'upload',
          }),
        }),
      );
    });

    it('功能关闭时 sweep 整体跳过', async () => {
      build({ enabled: 'false' });
      await service.sweep();
      expect(prisma.videoGenerationJob.findMany).not.toHaveBeenCalled();
    });
  });
});
