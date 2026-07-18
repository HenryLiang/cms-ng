import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentType } from '@prisma/client';

export interface AIOperationLogOptions<T> {
  userId: string;
  articleId?: string;
  agentType: string;
  action: string;
  prompt: string;
  model: string;
  fn: () => Promise<{ result: T; tokensUsed?: number }>;
  fallback: T;
  /**
   * Optional side-effect to run after a successful log row is persisted.
   * Used by ai.service.ts to deduct billing against the new op id.
   * If this throws, the error surfaces to the caller (callers that want
   * billing failures swallowed should wrap it themselves, matching the
   * pre-refactor behaviour of `deductLLMBilling`).
   */
  onSuccess?: (aiOpId: string, tokensUsed?: number) => Promise<void>;
}

export interface AIOperationLogSuccess<T> {
  ok: true;
  result: T;
  tokensUsed?: number;
  aiOpId: string;
}

export interface AIOperationLogFailure<T> {
  ok: false;
  result: T;
  error: Error;
}

/**
 * Single source of truth for "run an AI operation, persist an AIOperation
 * audit row, return the result or a fallback on failure".
 *
 * Why: the try/catch + prisma.aIOperation.create + logger.error +
 * fallback pattern was duplicated in 12+ places inside ai.service.ts.
 * Centralising the audit bookkeeping:
 *   - removes drift risk (one place to evolve the schema, error
 *     formatting, billing hook, etc.)
 *   - makes the actual AI prompt / parsing logic in ai.service.ts more
 *     readable (the surrounding try/catch noise goes away)
 *   - gives us one place to add things like sampling / cost ceilings
 *
 * Behaviour preserved vs. the original copy-pasted blocks:
 *   - Success row: { agentType, action, prompt, result: JSON.stringify(result),
 *     model, tokensUsed, durationMs, articleId, createdBy }
 *   - Failure row: same minus tokensUsed, with result: JSON.stringify({ error })
 *   - On failure: logger.error(`${action} failed:`, error.message) and
 *     returns `fallback` to the caller.
 */
@Injectable()
export class AIOperationLogger {
  private readonly logger = new Logger(AIOperationLogger.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Run an AI operation and log the result. Always resolves: returns
   * `fn().result` on success, `fallback` on failure.
   *
   * If `onSuccess` throws (typically a billing-deduction failure), the
   * error is logged at warn level and swallowed — the AI result is still
   * returned to the caller. This matches the pre-refactor behaviour of
   * `deductLLMBilling` in ai.service.ts, which had its own try/catch
   * that logged and swallowed billing errors.
   */
  async run<T>(opts: AIOperationLogOptions<T>): Promise<T> {
    const startTime = Date.now();
    try {
      const { result, tokensUsed } = await opts.fn();
      const aiOp = await this.persistSuccess(
        opts,
        result,
        tokensUsed,
        Date.now() - startTime,
      );
      if (opts.onSuccess) {
        try {
          await opts.onSuccess(aiOp.id, tokensUsed);
        } catch (hookError) {
          this.logger.warn(
            `${opts.action} post-success hook failed: ${(hookError as Error)?.message ?? String(hookError)}`,
          );
        }
      }
      return result;
    } catch (error) {
      this.logger.error(
        `${opts.action} failed:`,
        (error as Error)?.message ?? String(error),
      );
      await this.persistFailure(opts, error, Date.now() - startTime);
      return opts.fallback;
    }
  }

  private async persistSuccess<T>(
    opts: AIOperationLogOptions<T>,
    result: T,
    tokensUsed: number | undefined,
    durationMs: number,
  ) {
    return this.prisma.aIOperation.create({
      data: {
        // Cast: callers pass string literals like 'STORY' / 'WRITING' that
        // are valid AgentType enum values, but TS can't prove that across
        // a string-typed parameter.
        agentType: opts.agentType as AgentType,
        action: opts.action,
        prompt: opts.prompt,
        result: JSON.stringify(result),
        model: opts.model,
        tokensUsed,
        durationMs,
        articleId: opts.articleId,
        createdBy: opts.userId,
      },
    });
  }

  private async persistFailure<T>(
    opts: AIOperationLogOptions<T>,
    error: unknown,
    durationMs: number,
  ) {
    return this.prisma.aIOperation.create({
      data: {
        agentType: opts.agentType as AgentType,
        action: opts.action,
        prompt: opts.prompt,
        result: JSON.stringify({
          error: (error as Error)?.message ?? String(error),
        }),
        model: opts.model,
        durationMs,
        articleId: opts.articleId,
        createdBy: opts.userId,
      },
    });
  }
}
