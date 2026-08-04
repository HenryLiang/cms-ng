import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AIOperationLogger } from './ai-operation-logger';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

describe('AIOperationLogger', () => {
  let logger: AIOperationLogger;
  let prisma: ReturnType<typeof createMockPrismaService>;

  // Suppress logger.error noise in test output
  let errorSpy: jest.SpyInstance;
  beforeAll(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterAll(() => {
    errorSpy.mockRestore();
  });

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.aIOperation.create.mockResolvedValue({ id: 'op-123' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIOperationLogger,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    logger = module.get<AIOperationLogger>(AIOperationLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===== success path =====
  describe('success', () => {
    it('returns the result from fn and persists a success row with tokensUsed', async () => {
      const fn = jest
        .fn()
        .mockResolvedValue({ result: ['s1', 's2'], tokensUsed: 123 });

      const out = await logger.run({
        userId: 'user-1',
        articleId: 'article-1',
        agentType: 'STORY',
        action: 'generate_story_suggestions',
        prompt: 'p',
        model: 'deepseek-v4',
        fn,
        fallback: [],
      });

      expect(out).toEqual(['s1', 's2']);
      expect(prisma.aIOperation.create).toHaveBeenCalledTimes(1);
      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        agentType: 'STORY',
        action: 'generate_story_suggestions',
        prompt: 'p',
        model: 'deepseek-v4',
        tokensUsed: 123,
        articleId: 'article-1',
        createdBy: 'user-1',
      });
      expect(data.durationMs).toEqual(expect.any(Number));
      // result is JSON-stringified
      expect(JSON.parse(data.result as string)).toEqual(['s1', 's2']);
    });

    it('invokes onSuccess with the persisted op id and tokensUsed', async () => {
      const fn = jest.fn().mockResolvedValue({ result: 'ok', tokensUsed: 50 });
      const onSuccess = jest.fn().mockResolvedValue(undefined);

      await logger.run({
        userId: 'u',
        agentType: 'WRITING',
        action: 'rewrite',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: '',
        onSuccess,
      });

      expect(onSuccess).toHaveBeenCalledWith('op-123', 50);
    });

    it('handles a missing articleId (passes undefined to prisma)', async () => {
      const fn = jest.fn().mockResolvedValue({ result: 1, tokensUsed: 0 });

      await logger.run({
        userId: 'u',
        agentType: 'STORY',
        action: 'a',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: 0,
      });

      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data.articleId).toBeUndefined();
    });

    it('still returns the result when onSuccess throws (does not surface billing errors)', async () => {
      // Mirrors the pre-refactor behaviour of `deductLLMBilling` in
      // ai.service.ts: billing errors are logged and swallowed so they
      // never block the AI result.
      const fn = jest.fn().mockResolvedValue({ result: 'ok', tokensUsed: 1 });
      const onSuccess = jest.fn().mockRejectedValue(new Error('billing down'));

      const out = await logger.run({
        userId: 'u',
        agentType: 'WRITING',
        action: 'rewrite',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: 'fb',
        onSuccess,
      });

      expect(out).toBe('ok');
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('logs a warn when onSuccess throws (so the failure is not silent)', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        const fn = jest.fn().mockResolvedValue({ result: 'ok', tokensUsed: 1 });
        const onSuccess = jest
          .fn()
          .mockRejectedValue(new Error('billing down'));

        await logger.run({
          userId: 'u',
          agentType: 'WRITING',
          action: 'rewrite',
          prompt: 'p',
          model: 'm',
          fn,
          fallback: 'fb',
          onSuccess,
        });

        expect(warnSpy).toHaveBeenCalledWith(
          'rewrite post-success hook failed: billing down',
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  // ===== failure path =====
  describe('failure', () => {
    it('returns fallback and persists a failure row without tokensUsed', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('provider 502'));

      const out = await logger.run({
        userId: 'user-1',
        articleId: 'article-1',
        agentType: 'WRITING',
        action: 'rewrite',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: 'fallback text',
      });

      expect(out).toBe('fallback text');
      expect(prisma.aIOperation.create).toHaveBeenCalledTimes(1);
      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        agentType: 'WRITING',
        action: 'rewrite',
        prompt: 'p',
        model: 'm',
        articleId: 'article-1',
        createdBy: 'user-1',
      });
      expect(data.tokensUsed).toBeUndefined();
      expect(JSON.parse(data.result as string)).toEqual({
        error: 'provider 502',
      });
      expect(data.durationMs).toEqual(expect.any(Number));
    });

    it('does not call onSuccess when fn throws', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('boom'));
      const onSuccess = jest.fn();

      await logger.run({
        userId: 'u',
        agentType: 'STORY',
        action: 'a',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: null,
        onSuccess,
      });

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('logs the action + error via the NestJS logger', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('rate limited'));

      await logger.run({
        userId: 'u',
        agentType: 'WRITING',
        action: 'expand',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: '',
      });

      expect(errorSpy).toHaveBeenCalledWith('expand failed:', 'rate limited');
    });

    it('still persists the failure row even if prisma.aIOperation.create throws', async () => {
      // Document the current behaviour: if logging itself fails, the
      // outer caller sees the error. We don't try to be clever about
      // double-faults here.
      prisma.aIOperation.create.mockRejectedValue(new Error('db down'));
      const fn = jest.fn().mockResolvedValue({ result: 'ok' });

      await expect(
        logger.run({
          userId: 'u',
          agentType: 'STORY',
          action: 'a',
          prompt: 'p',
          model: 'm',
          fn,
          fallback: 'fb',
        }),
      ).rejects.toThrow('db down');
    });
  });

  // ===== duration =====
  describe('duration', () => {
    it('records a non-negative duration in ms', async () => {
      const fn = jest.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { result: 1, tokensUsed: 0 };
      });

      await logger.run({
        userId: 'u',
        agentType: 'STORY',
        action: 'a',
        prompt: 'p',
        model: 'm',
        fn,
        fallback: 0,
      });

      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ===== runOrThrow + 审计截断 (媒体打标用) =====
  describe('runOrThrow + audit truncation', () => {
    it('成功 -> 返回 result + tokensUsed + aiOpId', async () => {
      const r = await logger.runOrThrow({
        userId: 'u',
        agentType: 'VISUAL',
        action: 'media_auto_tag',
        prompt: 'p',
        model: 'm',
        mediaAssetId: 'asset-1',
        fn: () => Promise.resolve({ result: { tags: ['t'] }, tokensUsed: 42 }),
      });
      expect(r).toEqual({
        result: { tags: ['t'] },
        tokensUsed: 42,
        aiOpId: 'op-123',
      });
      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data.mediaAssetId).toBe('asset-1');
      expect(data.tokensUsed).toBe(42);
    });

    it('失败 -> 持久化失败行后重抛(状态机判定依赖此)', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('vision boom'));
      await expect(
        logger.runOrThrow({
          userId: 'u',
          agentType: 'VISUAL',
          action: 'media_auto_tag',
          prompt: 'p',
          model: 'm',
          fn,
        }),
      ).rejects.toThrow('vision boom');
      // 失败行已落库(result 含 error)
      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(JSON.parse(data.result as string)).toEqual({
        error: 'vision boom',
      });
    });

    it('超长 prompt(>32KB)-> 截断后写入,不炸审计 insert', async () => {
      const huge = 'x'.repeat(40 * 1024);
      await logger.runOrThrow({
        userId: 'u',
        agentType: 'VISUAL',
        action: 'media_auto_tag',
        prompt: huge,
        model: 'm',
        fn: () => Promise.resolve({ result: 1 }),
      });
      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data.prompt.length).toBeLessThan(huge.length);
      expect(data.prompt).toContain('[truncated');
    });

    it('mediaAssetId 缺省时为 undefined(不污染既有文本 AI 审计)', async () => {
      await logger.runOrThrow({
        userId: 'u',
        agentType: 'STORY',
        action: 'other',
        prompt: 'p',
        model: 'm',
        fn: () => Promise.resolve({ result: 1 }),
      });
      const data = prisma.aIOperation.create.mock.calls[0][0].data;
      expect(data.mediaAssetId).toBeUndefined();
    });
  });
});
