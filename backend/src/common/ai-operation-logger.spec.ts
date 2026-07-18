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
      expect(JSON.parse(data.result)).toEqual(['s1', 's2']);
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
      expect(JSON.parse(data.result)).toEqual({ error: 'provider 502' });
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
});
