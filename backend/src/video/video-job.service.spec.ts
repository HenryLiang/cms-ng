import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { NotificationLevel, NotificationType } from '@cms-ng/shared';
import { createMock } from '../common/test-helpers';
import { VideoJobService } from './video-job.service';
import { VideoGenProvider } from './providers/video-gen/video-gen-provider.interface';
import { ImageGenProvider } from './providers/image-gen/image-gen-provider.interface';
import { ComposeStep } from './pipeline/compose.step';
import type { ChatCompletionProvider } from '../ai/providers';
import type { PrismaService } from '../prisma/prisma.service';
import type { BillingService } from '../billing/billing.service';
import type { SearchService } from '../search/search.service';
import type { StorageService } from '../storage/storage.service';
import type { NotificationsService } from '../notifications/notifications.service';
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
  resolution: '720P',
  aspectRatio: '9:16',
  generateAudio: null as boolean | null,
  submitOptions: null as string | null,
  costEstimate: 3,
  costActual: null,
  resultAssetId: null,
  lastFrameAssetId: null as string | null,
  failedStep: null as string | null,
  error: null as string | null,
  retryCount: 0,
  articleId: null,
  script: null as string | null,
  storyboard: null as string | null,
  ttsProvider: null as string | null,
  createdAt: new Date('2026-08-07T00:00:00Z'),
  updatedAt: new Date('2026-08-07T00:00:00Z'),
};

/** L2 测试用的合法分镜(2 镜图片) */
const STORYBOARD_LLM_JSON = JSON.stringify({
  title: '测试成片',
  scenes: [
    {
      narration: '第一段口播文本,长度足够通过契约校验。',
      visual: {
        type: 'image',
        prompt: '城市天际线日出,电影感',
        durationHintSec: 5,
      },
    },
    {
      narration: '第二段口播文本,同样满足最低字数要求。',
      visual: { type: 'image', prompt: '咖啡杯特写,暖光', durationHintSec: 5 },
    },
  ],
});

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
    article: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let billing: {
    isEnabled: jest.Mock;
    getConfig: jest.Mock;
    deduct: jest.Mock;
  };
  let storage: { put: jest.Mock };
  let search: { indexAsset: jest.Mock };
  let notifications: { publish: jest.Mock };
  let provider: jest.Mocked<VideoGenProvider>;
  let chat: { chatCompletion: jest.Mock };
  let imageGen: jest.Mocked<ImageGenProvider> | null;
  let service: VideoJobService;

  function build(opts?: {
    enabled?: string;
    withProvider?: boolean;
    render?: string;
    withImageGen?: boolean;
  }) {
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
      article: { findUnique: jest.fn() },
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
    notifications = { publish: jest.fn().mockResolvedValue(undefined) };
    provider = {
      name: 'minimax',
      submit: jest.fn(),
      poll: jest.fn(),
      estimateCost: jest.fn().mockReturnValue(3),
    } as unknown as jest.Mocked<VideoGenProvider>;
    chat = {
      chatCompletion: jest
        .fn()
        // 第一次调用=脚本,第二次=分镜(顺序契约;各测试可按需覆盖)
        .mockResolvedValueOnce({
          content:
            '这是一段六十秒左右的口播脚本,字数足以通过脚本契约校验的最低长度要求,用于单元测试。',
        })
        .mockResolvedValue({ content: STORYBOARD_LLM_JSON }),
    };
    imageGen =
      opts?.withImageGen === false
        ? null
        : ({
            name: 'minimax',
            generate: jest
              .fn()
              .mockResolvedValue({ imageUrl: 'https://tmp/img.jpg' }),
          } as unknown as jest.Mocked<ImageGenProvider>);
    const config = createMock<ConfigService>({
      get: jest.fn((key: string) => {
        if (key === 'VIDEO_GENERATION_ENABLED') return opts?.enabled ?? 'true';
        if (key === 'VIDEO_RENDER_ENABLED') return opts?.render ?? 'true';
        return undefined;
      }),
    } as unknown as ConfigService);
    service = new VideoJobService(
      prisma as unknown as PrismaService,
      config,
      billing as unknown as BillingService,
      notifications as unknown as NotificationsService,
      storage as unknown as StorageService,
      search as unknown as SearchService,
      opts?.withProvider === false ? null : provider,
      chat as unknown as ChatCompletionProvider,
      imageGen,
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

  describe('L1 可选提交参数:参考物/seed/draft/尾帧(PRD §18)', () => {
    // 与 Seedance 2.x(非 mini)能力位一致(含 2026-08-08 实测的帧/参考互斥约束;
    // mini 另禁 draft,由通用的 caps.draft=false 路径覆盖)
    const V2_CAPS = {
      referenceRoles: [
        'first_frame',
        'last_frame',
        'reference_image',
        'reference_video',
        'reference_audio',
      ],
      seed: true,
      draft: true,
      returnLastFrame: true,
      frameReferenceExclusive: true,
    } as const;

    it('capability 暴露 provider 能力位(参考角色/限额/互斥约束/可选参数)', () => {
      build();
      (provider as { paramCapabilities?: unknown }).paramCapabilities = V2_CAPS;
      const caps = service.capability();
      expect(caps.references.roles).toEqual(V2_CAPS.referenceRoles);
      expect(caps.references.limits).toMatchObject({
        reference_video: 3,
        reference_audio: 3,
      });
      expect(caps.references.frameReferenceExclusive).toBe(true);
      expect(caps).toMatchObject({
        seed: true,
        draft: true,
        returnLastFrame: true,
      });
    });

    it('capability:provider 无能力位时缺省仅 first_frame、无可选参数、无互斥约束', () => {
      build();
      const caps = service.capability();
      expect(caps.references.roles).toEqual(['first_frame']);
      expect(caps.references.frameReferenceExclusive).toBe(false);
      expect(caps).toMatchObject({
        seed: false,
        draft: false,
        returnLastFrame: false,
      });
    });

    it('capability:provider 声明 durationCapabilities 时透出;缺省 fixed [6,10]', () => {
      build();
      // 缺省(provider 未声明)
      expect(service.capability().duration).toEqual({
        mode: 'fixed',
        min: 6,
        max: 10,
        allowed: [6, 10],
      });
      // provider 声明 free 档
      (provider as { durationCapabilities?: unknown }).durationCapabilities = {
        mode: 'free',
        min: 4,
        max: 15,
      };
      expect(service.capability().duration).toEqual({
        mode: 'free',
        min: 4,
        max: 15,
      });
    });

    it('L2 携带参考物/可选参数 → 400(仅 L1 支持)', async () => {
      build();
      await expect(
        service.create('user-1', {
          mode: 'ARTICLE_TO_VIDEO',
          articleId: 'art-1',
          references: [{ role: 'first_frame', url: 'https://cos/f.jpg' }],
        }),
      ).rejects.toThrow(/仅支持 L1/);
      expect(prisma.videoGenerationJob.create).not.toHaveBeenCalled();
    });

    it('角色超出 provider 能力位 → 400(缺省仅 first_frame)', async () => {
      build();
      await expect(
        service.create('user-1', {
          prompt: 'x',
          references: [{ role: 'reference_video', url: 'https://cos/m.mp4' }],
        }),
      ).rejects.toThrow(/不支持参考角色 reference_video/);
    });

    it('数量上限:首帧 >1 / 参考图 >9 / 参考音频 >3 → 400', async () => {
      build();
      (provider as { paramCapabilities?: unknown }).paramCapabilities = V2_CAPS;
      await expect(
        service.create('user-1', {
          prompt: 'x',
          references: [
            { role: 'first_frame', url: 'https://cos/a.jpg' },
            { role: 'first_frame', url: 'https://cos/b.jpg' },
          ],
        }),
      ).rejects.toThrow(/首帧参考最多 1 个/);
      await expect(
        service.create('user-1', {
          prompt: 'x',
          references: [...Array(10)].map((_, i) => ({
            role: 'reference_image' as const,
            url: `https://cos/${i}.jpg`,
          })),
        }),
      ).rejects.toThrow(/参考图最多 9 个/);
      await expect(
        service.create('user-1', {
          prompt: 'x',
          references: [
            { role: 'reference_image', url: 'https://cos/a.jpg' },
            ...[1, 2, 3, 4].map((i) => ({
              role: 'reference_audio' as const,
              url: `https://cos/${i}.mp3`,
            })),
          ],
        }),
      ).rejects.toThrow(/参考音频最多 3 个/);
    });

    it('参考音频单独存在(无图/视频搭配)→ 400', async () => {
      build();
      (provider as { paramCapabilities?: unknown }).paramCapabilities = V2_CAPS;
      await expect(
        service.create('user-1', {
          prompt: 'x',
          references: [{ role: 'reference_audio', url: 'https://cos/bgm.mp3' }],
        }),
      ).rejects.toThrow(/不能单独存在/);
    });

    it('provider 不支持 seed/draft/尾帧时传了 → 400', async () => {
      build(); // 缺省能力位全 false
      await expect(
        service.create('user-1', { prompt: 'x', seed: 42 }),
      ).rejects.toThrow(/不支持 seed/);
      await expect(
        service.create('user-1', { prompt: 'x', draft: true }),
      ).rejects.toThrow(/不支持 draft/);
      await expect(
        service.create('user-1', { prompt: 'x', returnLastFrame: true }),
      ).rejects.toThrow(/不支持返回尾帧/);
    });

    it('帧角色与参考角色互斥(Ark 实测 400)→ service 提前 400', async () => {
      build();
      (provider as { paramCapabilities?: unknown }).paramCapabilities = V2_CAPS;
      await expect(
        service.create('user-1', {
          prompt: 'x',
          references: [
            { role: 'first_frame', url: 'https://cos/f.jpg' },
            { role: 'reference_image', url: 'https://cos/r.jpg' },
          ],
        }),
      ).rejects.toThrow(/不能混合使用/);
      expect(prisma.videoGenerationJob.create).not.toHaveBeenCalled();
    });

    it('合法全量参数 → submitOptions 落库 JSON,并参与成本估算', async () => {
      build();
      (provider as { paramCapabilities?: unknown }).paramCapabilities = V2_CAPS;
      prisma.videoGenerationJob.create.mockResolvedValue({ ...JOB });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 0 });

      await service.create('user-1', {
        prompt: '果茶广告',
        seed: 42,
        draft: true,
        returnLastFrame: true,
        references: [
          { role: 'reference_image', url: 'https://cos/product.jpg' },
          { role: 'reference_video', url: 'https://cos/ref.mp4' },
          { role: 'reference_audio', url: 'https://cos/bgm.mp3' },
        ],
      });

      expect(prisma.videoGenerationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submitOptions: JSON.stringify({
              references: [
                { role: 'reference_image', url: 'https://cos/product.jpg' },
                { role: 'reference_video', url: 'https://cos/ref.mp4' },
                { role: 'reference_audio', url: 'https://cos/bgm.mp3' },
              ],
              seed: 42,
              draft: true,
              returnLastFrame: true,
            }),
          }),
        }),
      );
      expect(provider.estimateCost).toHaveBeenCalledWith(
        expect.objectContaining({ seed: 42, draft: true }),
      );
    });

    it('无可选参数 → submitOptions 落 null', async () => {
      build();
      prisma.videoGenerationJob.create.mockResolvedValue({ ...JOB });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 0 });

      await service.create('user-1', { prompt: 'x' });

      expect(prisma.videoGenerationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ submitOptions: null }),
        }),
      );
    });

    it('submitStage 解析 submitOptions 并透传 provider', async () => {
      build();
      (provider as { paramCapabilities?: unknown }).paramCapabilities = V2_CAPS;
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        submitOptions: JSON.stringify({
          references: [{ role: 'last_frame', url: 'https://cos/last.jpg' }],
          seed: 7,
          returnLastFrame: true,
        }),
      });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.submit.mockResolvedValue({ taskId: 't-1' });

      await service.submitStage('job-1');

      expect(provider.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [{ role: 'last_frame', url: 'https://cos/last.jpg' }],
          seed: 7,
          returnLastFrame: true,
        }),
      );
    });

    it('submitOptions 损坏 JSON → 按空 options 提交(fail-open)', async () => {
      build();
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        submitOptions: '{broken',
      });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.submit.mockResolvedValue({ taskId: 't-1' });

      await service.submitStage('job-1');

      expect(provider.submit).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: JOB.prompt }),
      );
      expect(provider.submit.mock.calls[0][0].references).toBeUndefined();
    });
  });

  describe('submitStage', () => {
    it('抢占失败(非 PENDING)时不调 provider', async () => {
      build();
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 0 });
      await service.submitStage('job-1');
      expect(provider.submit).not.toHaveBeenCalled();
    });

    it('generateAudio/480P 任务参数原样透传给 provider(L1 原生音频)', async () => {
      build();
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        resolution: '480P',
        generateAudio: true,
      });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      provider.submit.mockResolvedValue({ taskId: 't-1' });

      await service.submitStage('job-1');

      expect(provider.submit).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: '480P', generateAudio: true }),
      );
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
      prisma.videoGenerationJob.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...JOB, ...data }),
      );
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
      expect(notifications.publish).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.TASK,
        level: NotificationLevel.SUCCESS,
        title: '视频生成完成',
        message: '“一只柴犬在樱花树下奔跑”已生成，可前往视频创作查看。',
        actionUrl: '/dashboard/video',
        metadata: {
          jobId: 'job-1',
          status: 'SUCCEEDED',
          resultAssetId: 'asset-1',
        },
        dedupeKey: 'video-job:job-1:SUCCEEDED',
      });
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
      prisma.videoGenerationJob.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...JOB, ...data }),
      );
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
      expect(notifications.publish).toHaveBeenCalledWith({
        userId: 'user-1',
        type: NotificationType.TASK,
        level: NotificationLevel.ERROR,
        title: '视频生成失败',
        message: '“一只柴犬在樱花树下奔跑”生成失败：download timeout',
        actionUrl: '/dashboard/video',
        metadata: {
          jobId: 'job-1',
          status: 'FAILED',
          failedStep: 'upload',
          error: 'download timeout',
        },
        dedupeKey: 'video-job:job-1:FAILED',
      });
    });

    it('returnLastFrame:尾帧图入媒体库并回写 lastFrameAssetId;尾帧失败不影响主片', async () => {
      build();
      const videoAsset = { id: 'asset-1', url: 'https://cos/x.mp4' };
      const frameAsset = { id: 'asset-2', url: 'https://cos/x-last.jpg' };
      prisma.videoGenerationJob.findUnique.mockResolvedValue({
        ...JOB,
        status: 'ASSETS_GENERATING',
        providerTaskId: 'mm-task-1',
        updatedAt: new Date(),
      });
      prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.videoGenerationJob.update.mockResolvedValue({});
      prisma.mediaAsset.create
        .mockResolvedValueOnce(videoAsset)
        .mockResolvedValueOnce(frameAsset);
      provider.poll.mockResolvedValue({
        state: 'succeeded',
        videoUrl: 'https://cdn/temp.mp4',
        lastFrameUrl: 'https://cdn/temp-last.jpg',
      });
      mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });

      await service.pollStage('job-1');

      expect(storage.put).toHaveBeenCalledWith(
        'video/job-1-last-frame.jpg',
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mimeType: 'image/jpeg',
            sourceRef: 'videoJob:job-1:last-frame',
            tagStatus: 'NONE',
          }),
        }),
      );
      expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastFrameAssetId: 'asset-2' }),
        }),
      );
      expect(search.indexAsset).toHaveBeenCalledWith('asset-2');
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

  describe('L2 稿件一键成片', () => {
    const L2_JOB = {
      ...JOB,
      mode: 'ARTICLE_TO_VIDEO',
      articleId: 'article-1',
      prompt: '',
      providerTaskId: null,
      // 进行态夹具:updatedAt 必须新鲜,否则素材步 30min 超时闸门会抢先触发
      updatedAt: new Date(),
    };

    describe('create 校验', () => {
      it('缺 articleId → 503', async () => {
        build();
        await expect(
          service.create('user-1', { mode: 'ARTICLE_TO_VIDEO' }),
        ).rejects.toThrow(/articleId/);
      });

      it('渲染未启用 → 503', async () => {
        build({ render: 'false' });
        await expect(
          service.create('user-1', {
            mode: 'ARTICLE_TO_VIDEO',
            articleId: 'a',
          }),
        ).rejects.toThrow(/VIDEO_RENDER_ENABLED/);
      });

      it('图片 provider 未配置 → 503', async () => {
        build({ withImageGen: false });
        await expect(
          service.create('user-1', {
            mode: 'ARTICLE_TO_VIDEO',
            articleId: 'a',
          }),
        ).rejects.toThrow(/图片生成 provider/);
      });

      it('他人文章且非编辑/管理员 → 503', async () => {
        build();
        prisma.article.findUnique.mockResolvedValue({
          authorId: 'other-user',
          title: 't',
        });
        await expect(
          service.create('user-1', {
            mode: 'ARTICLE_TO_VIDEO',
            articleId: 'article-1',
          }),
        ).rejects.toThrow(/自己的文章/);
      });

      it('本人文章 → 落库 PENDING 并 kick 推进', async () => {
        build();
        prisma.article.findUnique.mockResolvedValue({
          authorId: 'user-1',
          title: 't',
        });
        prisma.videoGenerationJob.create.mockResolvedValue({ ...L2_JOB });
        prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 0 });

        const vo = await service.create(
          'user-1',
          { mode: 'ARTICLE_TO_VIDEO', articleId: 'article-1' },
          'REPORTER',
        );

        expect(prisma.videoGenerationJob.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              mode: 'ARTICLE_TO_VIDEO',
              articleId: 'article-1',
            }),
          }),
        );
        expect(vo.status).toBe('PENDING');
      });
    });

    describe('advanceL2 状态机', () => {
      function setupChain(opts?: { storyboardContent?: string }) {
        build();
        // 脚本 step 后 update 返回 STORYBOARDING;分镜后返回 ASSETS_GENERATING...
        // update 按 data.status 回显,模拟真实持久化
        prisma.videoGenerationJob.update.mockImplementation(
          (args: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...L2_JOB, ...args.data }),
        );
        prisma.videoGenerationJob.updateMany.mockResolvedValue({ count: 1 });
        if (opts?.storyboardContent !== undefined) {
          chat.chatCompletion.mockReset();
          chat.chatCompletion
            .mockResolvedValueOnce({
              content:
                '这是一段用于测试的口播脚本,长度足以通过脚本契约的最低字数校验要求。',
            })
            .mockResolvedValue({ content: opts.storyboardContent });
        }
        // 脚本 step 读文章(正文需 ≥50 字)
        prisma.article.findUnique.mockResolvedValue({
          title: '测试文章',
          content: `<p>${'正文内容。'.repeat(20)}</p>`,
        });
        // 素材下载转存
        mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });
        prisma.mediaAsset.create.mockResolvedValue({
          id: 'asset-1',
          url: 'https://cos/final.mp4',
        });
      }

      it('全链路:PENDING→…→SUCCEEDED(无 TTS 降级无配音)', async () => {
        setupChain();
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });
        const composeSpy = jest
          .spyOn(ComposeStep.prototype, 'run')
          .mockResolvedValue({
            outputPath: '/tmp/x.mp4',
            buffer: Buffer.from('mp4'),
            durationSec: 10.2,
            subtitleMode: 'soft',
          });
        jest
          .spyOn(ComposeStep.prototype, 'cleanup')
          .mockResolvedValue(undefined);

        await service.advance('job-1');

        const statuses = prisma.videoGenerationJob.update.mock.calls.map(
          (c: [{ data: { status?: string } }]) => c[0].data.status,
        );
        expect(statuses).toEqual(
          expect.arrayContaining([
            'STORYBOARDING',
            'ASSETS_GENERATING',
            'COMPOSING',
            'SUCCEEDED',
          ]),
        );
        // 无 TTS:落 ttsProvider=none
        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ ttsProvider: 'none' }),
          }),
        );
        // 成片登记 + 成片计费键
        expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              mimeType: 'video/mp4',
              sourceRef: 'videoJob:job-1',
              duration: 10,
            }),
          }),
        );
        expect(billing.getConfig).toHaveBeenCalledWith('ai_video_per_compose');
        expect(billing.deduct).toHaveBeenCalledWith(
          expect.objectContaining({ idempotencyKey: 'video-compose:job-1' }),
        );
        composeSpy.mockRestore();
      });

      it('并发 advance 重入被进程内互斥挡下(长步骤跨 cron tick 不重复调用 LLM)', async () => {
        setupChain();
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });
        // 脚本 LLM 挂起,保证第二次 advance 到达时第一次仍在 SCRIPTING 步骤
        let releaseScript!: (v: { content: string }) => void;
        chat.chatCompletion.mockReset();
        chat.chatCompletion
          .mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                releaseScript = resolve;
              }),
          )
          .mockResolvedValue({ content: STORYBOARD_LLM_JSON });

        const first = service.advance('job-1');
        await new Promise((r) => setImmediate(r)); // 让第一次推进进入脚本步骤
        await service.advance('job-1'); // 模拟下一 cron tick:应立即返回

        releaseScript({
          content:
            '这是一段用于测试的口播脚本,长度足以通过脚本契约的最低字数校验要求。',
        });
        await first;
        expect(chat.chatCompletion).toHaveBeenCalledTimes(2); // 脚本×1 + 分镜×1(无重入双倍)
      });

      it('原生音频模式:分镜要求全部视频镜,submit 带 generateAudio + 旁白注入', async () => {
        setupChain({
          storyboardContent: JSON.stringify({
            title: 't',
            scenes: [
              {
                narration: '第一镜口播文本,长度足够通过契约校验。',
                visual: {
                  type: 'video_clip',
                  prompt: '步道晨景',
                  durationHintSec: 5,
                },
              },
              {
                narration: '第二镜口播文本,同样满足最低字数要求。',
                visual: {
                  type: 'video_clip',
                  prompt: '江景傍晚',
                  durationHintSec: 5,
                },
              },
            ],
          }),
        });
        (provider as { supportsNativeAudio?: boolean }).supportsNativeAudio =
          true;
        provider.submit.mockResolvedValue({ taskId: 'pv-1' });
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });

        await service.advance('job-1');

        // 分镜 system prompt 切换为全视频镜规则
        const storyboardCall = chat.chatCompletion.mock.calls[1]?.[0];
        expect(storyboardCall.messages[0].content).toContain(
          '全部用 "video_clip"',
        );
        // 视频镜提交:generateAudio + 旁白注入 prompt
        expect(provider.submit).toHaveBeenCalledTimes(2);
        expect(provider.submit).toHaveBeenCalledWith(
          expect.objectContaining({
            generateAudio: true,
            prompt: expect.stringContaining('画外音旁白'),
          }),
        );
        expect(provider.submit).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: expect.stringContaining('第一镜口播文本'),
          }),
        );
      });

      it('原生音频模式:无 TTS 且片段支持原生音频时 ttsProvider 落 native', async () => {
        setupChain();
        (provider as { supportsNativeAudio?: boolean }).supportsNativeAudio =
          true;
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });
        jest.spyOn(ComposeStep.prototype, 'run').mockResolvedValue({
          outputPath: '/tmp/x.mp4',
          buffer: Buffer.from('mp4'),
          durationSec: 10,
          subtitleMode: 'none',
        });
        jest
          .spyOn(ComposeStep.prototype, 'cleanup')
          .mockResolvedValue(undefined);

        await service.advance('job-1');

        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ ttsProvider: 'native' }),
          }),
        );
        jest.restoreAllMocks();
      });

      it('分镜契约连续失败 → FAILED(failedStep=storyboard)', async () => {
        setupChain({ storyboardContent: '不是 JSON' });
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });

        await service.advance('job-1');

        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'FAILED',
              failedStep: 'storyboard',
            }),
          }),
        );
      });

      it('素材镜图片失败(含降级失败)→ FAILED(failedStep=assets)', async () => {
        setupChain({
          storyboardContent: JSON.stringify({
            title: 't',
            scenes: [
              {
                narration: '视频镜口播,长度足够通过校验的文本。',
                visual: { type: 'video_clip', prompt: 'p', durationHintSec: 5 },
              },
              {
                narration: '图片镜口播,长度足够通过校验的文本。',
                visual: { type: 'image', prompt: 'p2', durationHintSec: 5 },
              },
            ],
          }),
        });
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });
        // 视频提交失败 → 降级图卡片 → 图也失败
        provider.submit.mockRejectedValue(new Error('quota'));
        (imageGen as jest.Mocked<ImageGenProvider>).generate.mockRejectedValue(
          new Error('image quota'),
        );

        await service.advance('job-1');

        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'FAILED',
              failedStep: 'assets',
            }),
          }),
        );
      });

      it('视频镜失败降级图卡片后继续(不阻塞整条任务)', async () => {
        setupChain({
          storyboardContent: JSON.stringify({
            title: 't',
            scenes: [
              {
                narration: '视频镜口播,长度足够通过校验的文本。',
                visual: { type: 'video_clip', prompt: 'p', durationHintSec: 5 },
              },
              {
                narration: '图片镜口播,长度足够通过校验的文本。',
                visual: { type: 'image', prompt: 'p2', durationHintSec: 5 },
              },
            ],
          }),
        });
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });
        provider.submit.mockRejectedValue(new Error('quota'));
        const composeSpy = jest
          .spyOn(ComposeStep.prototype, 'run')
          .mockResolvedValue({
            outputPath: '/tmp/x.mp4',
            buffer: Buffer.from('mp4'),
            durationSec: 9,
            subtitleMode: 'none',
          });
        jest
          .spyOn(ComposeStep.prototype, 'cleanup')
          .mockResolvedValue(undefined);

        await service.advance('job-1');

        // 降级成功:分镜 checkpoint 里该镜已改写为 image 且素材就绪
        const storyboardWrites = prisma.videoGenerationJob.update.mock.calls
          .map((c: [{ data: { storyboard?: string } }]) => c[0].data.storyboard)
          .filter(Boolean);
        const finalSb = JSON.parse(
          storyboardWrites[storyboardWrites.length - 1] as string,
        ) as {
          scenes: Array<{
            visual: { type: string };
            asset?: { status: string };
          }>;
        };
        expect(finalSb.scenes[0].visual.type).toBe('image');
        expect(finalSb.scenes[0].asset?.status).toBe('done');
        expect(composeSpy).toHaveBeenCalled();
        composeSpy.mockRestore();
      });

      it('原生音频模式:视频镜失败降级图片 → 该镜静音(钉住已知行为),任务仍完成且 ttsProvider=native', async () => {
        setupChain({
          storyboardContent: JSON.stringify({
            title: 't',
            scenes: [
              {
                narration: '第一镜口播文本,长度足够通过契约校验。',
                visual: {
                  type: 'video_clip',
                  prompt: '步道晨景',
                  durationHintSec: 5,
                },
              },
              {
                narration: '第二镜口播文本,同样满足最低字数要求。',
                visual: {
                  type: 'video_clip',
                  prompt: '江景傍晚',
                  durationHintSec: 5,
                },
              },
            ],
          }),
        });
        (provider as { supportsNativeAudio?: boolean }).supportsNativeAudio =
          true;
        prisma.videoGenerationJob.findUnique.mockResolvedValue({ ...L2_JOB });
        // 两镜视频提交都失败 → 双双降级图卡片(该镜失去原生旁白 = 静音)
        provider.submit.mockRejectedValue(new Error('ModelNotOpen'));
        const composeSpy = jest
          .spyOn(ComposeStep.prototype, 'run')
          .mockResolvedValue({
            outputPath: '/tmp/x.mp4',
            buffer: Buffer.from('mp4'),
            durationSec: 10,
            subtitleMode: 'soft',
          });
        jest
          .spyOn(ComposeStep.prototype, 'cleanup')
          .mockResolvedValue(undefined);

        await service.advance('job-1');

        // 任务不阻塞:全链路完成
        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'SUCCEEDED' }),
          }),
        );
        // 配音通道仍记 native(原生模式意图),降级镜静音是已知降级代价
        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ ttsProvider: 'native' }),
          }),
        );
        // 钉住:降级镜改写为 image、无任何 voice(成片该镜无声,字幕仍在)
        const storyboardWrites = prisma.videoGenerationJob.update.mock.calls
          .map((c: [{ data: { storyboard?: string } }]) => c[0].data.storyboard)
          .filter(Boolean);
        const finalSb = JSON.parse(
          storyboardWrites[storyboardWrites.length - 1] as string,
        ) as {
          scenes: Array<{
            visual: { type: string };
            voice?: unknown;
            asset?: { status: string };
          }>;
        };
        for (const scene of finalSb.scenes) {
          expect(scene.visual.type).toBe('image');
          expect(scene.asset?.status).toBe('done');
          expect(scene.voice).toBeUndefined();
        }
        composeSpy.mockRestore();
      });
    });

    describe('L2 重试落点', () => {
      it('failedStep=voice(存量 TTS 行)→ 回 COMPOSING(配音步已移除)', async () => {
        build();
        prisma.videoGenerationJob.findUnique.mockResolvedValue({
          ...L2_JOB,
          status: 'FAILED',
          failedStep: 'voice',
          retryCount: 1,
        });
        prisma.videoGenerationJob.update.mockResolvedValue({ ...L2_JOB });

        await service.retry('user-1', 'job-1');

        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'COMPOSING' }),
          }),
        );
      });

      it('failedStep=upload(L2)→ 回 COMPOSING 重新合成', async () => {
        build();
        prisma.videoGenerationJob.findUnique.mockResolvedValue({
          ...L2_JOB,
          status: 'FAILED',
          failedStep: 'upload',
          retryCount: 1,
        });
        prisma.videoGenerationJob.update.mockResolvedValue({ ...L2_JOB });

        await service.retry('user-1', 'job-1');

        expect(prisma.videoGenerationJob.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'COMPOSING' }),
          }),
        );
      });
    });
  });
});
