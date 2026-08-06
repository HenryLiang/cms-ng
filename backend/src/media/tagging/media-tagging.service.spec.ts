import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MediaTaggingService } from './media-tagging.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createMockPrismaService } from '../../prisma/prisma.service.mock';
import { BillingService } from '../../billing/billing.service';
import { AIOperationLogger } from '../../common/ai-operation-logger';
import { CHAT_VISION_PROVIDER } from '../../ai/providers';
import type { ChatCompletionProvider } from '../../ai/providers';
import { MediaSource, MediaTagStatus, MediaStatus } from '@cms-ng/shared';

/**
 * MediaTaggingService 单测:状态机、CAS claim、内存去重、开关四行为、
 * 余额不足不重试、每日配额、归一化与内容级过滤。
 * 视觉 provider 与 AIOperationLogger 全量 mock,不打真实 LLM。
 */
describe('MediaTaggingService', () => {
  let service: MediaTaggingService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let billing: {
    isEnabled: jest.Mock;
    checkBalance: jest.Mock;
    getConfig: jest.Mock;
    deduct: jest.Mock;
  };
  let aiLog: { runOrThrow: jest.Mock };
  let events: { emit: jest.Mock };
  let vision: {
    providerName: string;
    model: string;
    chatCompletion: jest.Mock;
  };
  let config: { get: jest.Mock };

  const baseAsset = {
    id: 'a1',
    ownerId: 'u1',
    status: MediaStatus.ACTIVE,
    source: 'UPLOAD',
    url: 'https://bkt.cos/img.png',
    fileName: 'original.png',
    mimeType: 'image/png',
    prompt: null,
    altText: null,
    title: null,
    tagStatus: MediaTagStatus.PENDING,
    tagRetryCount: 0,
    tagError: null,
    createdAt: new Date('2026-08-06T06:23:45.000Z'),
    updatedAt: new Date(Date.now() - 20 * 60 * 1000),
  };

  async function makeService(
    opts: {
      enabled?: boolean;
      vision?: ChatCompletionProvider | null;
    } = {},
  ): Promise<MediaTaggingService> {
    const enabled = opts.enabled ?? true;
    config.get.mockImplementation((key: string) => {
      if (key === 'MEDIA_TAGGING_ENABLED') return enabled ? 'true' : 'false';
      if (key === 'MEDIA_TAGGING_CONCURRENCY') return '2';
      if (key === 'MEDIA_TAGGING_DAILY_QUOTA') return '200';
      if (key === 'AI_VISION_IMAGE_MODE') return 'url';
      return undefined;
    });
    vision.providerName = 'kimi';
    vision.model = 'kimi-vision';
    vision.chatCompletion.mockResolvedValue({
      content: JSON.stringify({ tags: ['花海', '春天'], altText: '一片花海' }),
      usage: { totalTokens: 500 },
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaTaggingService,
        { provide: PrismaService, useValue: prisma },
        { provide: BillingService, useValue: billing },
        { provide: AIOperationLogger, useValue: aiLog },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: events },
        {
          provide: CHAT_VISION_PROVIDER,
          useValue: opts.vision === undefined ? vision : opts.vision,
        },
      ],
    }).compile();
    const svc = module.get<MediaTaggingService>(MediaTaggingService);
    // TestingModule 不保证自动调 onModuleInit,显式触发以初始化 enabled 状态
    svc.onModuleInit();
    return svc;
  }

  beforeEach(async () => {
    prisma = createMockPrismaService();
    billing = {
      isEnabled: jest.fn().mockReturnValue(true),
      checkBalance: jest.fn().mockResolvedValue(true),
      getConfig: jest.fn().mockResolvedValue({ unitPrice: 0.02 }),
      deduct: jest.fn().mockResolvedValue({}),
    };
    aiLog = {
      runOrThrow: jest.fn().mockResolvedValue({
        result: {
          tags: ['花海', '春天'],
          altText: '一片花海',
          title: '春日花海',
        },
        tokensUsed: 500,
        aiOpId: 'op1',
      }),
    };
    vision = {
      providerName: 'kimi',
      model: 'kimi-vision',
      chatCompletion: jest.fn(),
    };
    config = { get: jest.fn() };
    events = { emit: jest.fn() };
    // 默认 CAS claim 成功 + 回表 ACTIVE
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
    prisma.mediaAsset.update.mockResolvedValue({ ...baseAsset });
    prisma.mediaAsset.count.mockResolvedValue(0);
    service = await makeService();
  });

  describe('onModuleInit / 开关', () => {
    it('MEDIA_TAGGING_ENABLED=false -> isEnabled() false,enqueue 空操作', async () => {
      service = await makeService({ enabled: false });
      expect(service.isEnabled()).toBe(false);
      service.enqueue('a1');
      // 不应触发 CAS claim
      expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled();
    });

    it('vision provider 为 null -> 降级关闭(warn),isEnabled false', async () => {
      service = await makeService({ vision: null, enabled: true });
      expect(service.isEnabled()).toBe(false);
    });

    it('启用时 isEnabled true', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('processOne 状态机', () => {
    it('CAS claim count=0(已被别处处理)-> 放弃,不调 vision', async () => {
      prisma.mediaAsset.updateMany.mockResolvedValueOnce({ count: 0 });
      service.enqueue('a1');
      await flushMicrotasks();
      expect(vision.chatCompletion).not.toHaveBeenCalled();
    });

    it('成功 -> DONE + aiTags 回写 + altText 回填(空时)+ 计费', async () => {
      service.enqueue('a1');
      await flushMicrotasks();
      // 回写用 updateMany(status=ACTIVE + tagStatus=TAGGING 双 CAS 守卫)
      const writeCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.DONE,
      );
      expect(writeCall).toBeDefined();
      expect(writeCall![0].where).toEqual({
        id: 'a1',
        status: MediaStatus.ACTIVE,
        tagStatus: MediaTagStatus.TAGGING,
      });
      expect(writeCall![0].data.aiTags).toBe(JSON.stringify(['花海', '春天']));
      expect(writeCall![0].data.altText).toBe('一片花海');
      expect(writeCall![0].data.title).toBe('春日花海');
      expect(writeCall![0].data.fileName).toMatch(/^\d{14}_春日花海\.png$/);
      expect(writeCall![0].data.tagStatus).toBe(MediaTagStatus.DONE);
      expect(billing.deduct).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'ai:op1',
          amount: (500 / 1000) * 0.02,
        }),
      );
      // P2:回写成功(count>0)发射 updated 事件 -> SearchService 重建 ES 文档(含新 aiTags)
      expect(events.emit).toHaveBeenCalledWith('media.asset.updated', {
        assetId: 'a1',
      });
    });

    it('altText 已存在 -> 不覆盖人工(D3)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        altText: '人工alt',
      });
      service.enqueue('a1');
      await flushMicrotasks();
      const writeCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.DONE,
      );
      expect(writeCall![0].data.altText).toBe('人工alt');
    });

    it('标题无有效文字时完成标签回写但保留原文件名', async () => {
      aiLog.runOrThrow.mockResolvedValue({
        result: { tags: ['花海'], altText: '一片花海', title: '///' },
        tokensUsed: 500,
        aiOpId: 'op1',
      });
      service.enqueue('a1');
      await flushMicrotasks();
      const writeCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.DONE,
      );
      expect(writeCall![0].data.aiTags).toBe(JSON.stringify(['花海']));
      expect(writeCall![0].data.fileName).toBeUndefined();
      expect(writeCall![0].data.title).toBeUndefined();
    });

    it('AI 生图参与同一打标契约，但不改已有文件名', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        source: MediaSource.AI_GENERATED,
        fileName: 'ai-existing.png',
      });
      service.enqueue('a1');
      await flushMicrotasks();
      const writeCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.DONE,
      );
      expect(writeCall![0].data.title).toBeUndefined();
      expect(writeCall![0].data.fileName).toBeUndefined();
    });

    it('上传图片名使用 createdAt 的 Asia/Shanghai 秒级时间戳', async () => {
      service.enqueue('a1');
      await flushMicrotasks();
      const writeCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.DONE,
      );
      expect(writeCall![0].data.fileName).toBe('20260806142345_春日花海.png');
    });

    it('打标期间被软删(status 非 ACTIVE)-> 回写 count=0,跳过回写与计费', async () => {
      // 第一次 updateMany 是 CAS claim(count=1),第二次是回写(count=0)
      prisma.mediaAsset.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      service.enqueue('a1');
      await flushMicrotasks();
      // 不应抛错;count=0 时跳过计费(防陈旧 processOne 双重计费,M2)
      expect(billing.deduct).not.toHaveBeenCalled();
      // P2:count=0 未回写,不发射 updated 事件(防 ES 索引到非 ACTIVE 陈旧态)
      expect(events.emit).not.toHaveBeenCalledWith('media.asset.updated', {
        assetId: 'a1',
      });
    });

    it('余额不足 -> FAILED + tagError=INSUFFICIENT_BALANCE,不重试类错误', async () => {
      billing.checkBalance.mockResolvedValue(false);
      service.enqueue('a1');
      await flushMicrotasks();
      const failCall = prisma.mediaAsset.update.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.FAILED,
      );
      expect(failCall).toBeDefined();
      expect(failCall![0].data.tagError).toBe('INSUFFICIENT_BALANCE');
      expect(failCall![0].data.tagRetryCount).toEqual({ increment: 1 });
    });

    it('vision 抛错 -> FAILED + tagError 含消息 + retryCount+1', async () => {
      aiLog.runOrThrow.mockRejectedValue(new Error('vision timeout'));
      service.enqueue('a1');
      await flushMicrotasks();
      const failCall = prisma.mediaAsset.update.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.FAILED,
      );
      expect(failCall).toBeDefined();
      expect(failCall![0].data.tagError).toBe('vision timeout');
      expect(failCall![0].data.fileName).toBeUndefined();
    });

    it('usage 缺失 -> 按预估兜底扣费(堵免单盲区)', async () => {
      aiLog.runOrThrow.mockResolvedValue({
        result: { tags: ['t'], altText: 'a' },
        tokensUsed: undefined,
        aiOpId: 'op1',
      });
      service.enqueue('a1');
      await flushMicrotasks();
      // kimi 档预估 2500 tokens * 0.02/1k = 0.05
      expect(billing.deduct).toHaveBeenCalledWith(
        expect.objectContaining({ amount: (2500 / 1000) * 0.02 }),
      );
    });

    it('BILLING_ENABLED=false -> 不扣费,流程照常', async () => {
      billing.isEnabled.mockReturnValue(false);
      service.enqueue('a1');
      await flushMicrotasks();
      expect(billing.deduct).not.toHaveBeenCalled();
      // 状态仍 DONE
      expect(
        prisma.mediaAsset.updateMany.mock.calls.find(
          (c) => c[0]?.data?.tagStatus === MediaTagStatus.DONE,
        ),
      ).toBeDefined();
    });

    it('每日配额超限(claim 后)-> 回退 PENDING,不调 vision/不扣费(M3)', async () => {
      prisma.mediaAsset.count.mockResolvedValue(200); // 配额已满
      service.enqueue('a1');
      await flushMicrotasks();
      expect(vision.chatCompletion).not.toHaveBeenCalled();
      expect(billing.deduct).not.toHaveBeenCalled();
      // CAS revert:where tagStatus=TAGGING -> data PENDING(延后,不计失败、不增 retryCount)
      const revertCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) =>
          c[0]?.data?.tagStatus === MediaTagStatus.PENDING &&
          c[0]?.where?.tagStatus === MediaTagStatus.TAGGING,
      );
      expect(revertCall).toBeDefined();
    });
  });

  describe('retag', () => {
    it('开关关闭 -> ServiceUnavailableException', async () => {
      service = await makeService({ enabled: false });
      prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
      await expect(service.retag('a1', 'u1')).rejects.toThrow();
    });

    it('非本人 -> BadRequestException', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        ownerId: 'other',
      });
      await expect(service.retag('a1', 'u1')).rejects.toThrow();
    });

    it('活跃 TAGGING(未超时)-> ConflictException', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        tagStatus: MediaTagStatus.TAGGING,
        updatedAt: new Date(),
      });
      await expect(service.retag('a1', 'u1')).rejects.toThrow();
    });

    it('每日配额超限 -> 429', async () => {
      prisma.mediaAsset.count.mockResolvedValue(200);
      await expect(service.retag('a1', 'u1')).rejects.toThrow();
    });

    it('成功 -> PENDING + retryCount 清零 + 入队', async () => {
      prisma.mediaAsset.count.mockResolvedValue(0);
      await service.retag('a1', 'u1');
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({
            tagStatus: MediaTagStatus.PENDING,
            tagRetryCount: 0,
          }),
        }),
      );
    });

    it('DONE 且 taggedAt 在 10min 内 -> RETAG_TOO_FREQUENT 429(M4)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        tagStatus: MediaTagStatus.DONE,
        taggedAt: new Date(Date.now() - 5 * 60 * 1000), // 5min ago
      });
      await expect(service.retag('a1', 'u1')).rejects.toMatchObject({
        message: 'RETAG_TOO_FREQUENT',
      });
    });

    it('inFlight 中的僵尸 TAGGING -> ConflictException(防并发孪生,M2)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        tagStatus: MediaTagStatus.TAGGING,
        // updatedAt 20min ago(僵尸,本该允许强制重打),但 inFlight 中 -> 拒绝
      });
      (service as unknown as { inFlight: Set<string> }).inFlight.add('a1');
      await expect(service.retag('a1', 'u1')).rejects.toThrow(
        'TAGGING_IN_PROGRESS',
      );
    });
  });

  describe('sweepStale', () => {
    it('TAGGING 僵尸(updatedAt 超 10min)-> 重置 FAILED + retryCount+1(M1)', async () => {
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      // 第一类查询:zombies
      prisma.mediaAsset.findMany
        .mockResolvedValueOnce([{ id: 'z1' }]) // zombies
        .mockResolvedValueOnce([]) // stalePending
        .mockResolvedValueOnce([]); // failed
      service.enqueue = jest.fn();
      await service.sweepStale();
      const resetCall = prisma.mediaAsset.updateMany.mock.calls.find(
        (c) => c[0]?.data?.tagError === 'TAGGING_TIMEOUT_ZOMBIE',
      );
      expect(resetCall).toBeDefined();
      expect(resetCall![0].data.tagStatus).toBe(MediaTagStatus.FAILED);
      expect(resetCall![0].data.tagRetryCount).toEqual({ increment: 1 });
    });

    it('PENDING 超 10min -> 重新入队', async () => {
      service.enqueue = jest.fn();
      prisma.mediaAsset.findMany
        .mockResolvedValueOnce([]) // zombies
        .mockResolvedValueOnce([{ id: 'p1' }]) // stalePending
        .mockResolvedValueOnce([]); // failed
      await service.sweepStale();
      expect(service.enqueue).toHaveBeenCalledWith('p1');
    });

    it('FAILED 退避:未过 backoff 跳过,已过 -> PENDING + 入队', async () => {
      service.enqueue = jest.fn();
      // retryCount=1 -> 15min 退避;1min 未过跳过,20min 已过入队
      prisma.mediaAsset.findMany
        .mockResolvedValueOnce([]) // zombies
        .mockResolvedValueOnce([]) // stalePending
        .mockResolvedValueOnce([
          {
            id: 'f-recent',
            tagRetryCount: 1,
            updatedAt: new Date(Date.now() - 1 * 60 * 1000),
          },
          {
            id: 'f-old',
            tagRetryCount: 1,
            updatedAt: new Date(Date.now() - 20 * 60 * 1000),
          },
        ]); // failed
      await service.sweepStale();
      // 仅 f-old 入队
      expect(service.enqueue).toHaveBeenCalledTimes(1);
      expect(service.enqueue).toHaveBeenCalledWith('f-old');
      const pendingCall = prisma.mediaAsset.update.mock.calls.find(
        (c) => c[0]?.data?.tagStatus === MediaTagStatus.PENDING,
      );
      expect(pendingCall).toBeDefined();
      expect(pendingCall![0].where.id).toBe('f-old');
    });

    it('开关关闭 -> 整体跳过', async () => {
      service = await makeService({ enabled: false });
      await service.sweepStale();
      expect(prisma.mediaAsset.findMany).not.toHaveBeenCalled();
    });
  });
});

/** 排空微任务队列,让 fire-and-forget worker 跑完 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
