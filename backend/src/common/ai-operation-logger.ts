import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentType } from '@prisma/client';

export interface AIOperationLogOptions<T> {
  userId: string;
  articleId?: string;
  /** 媒体打标等场景:关联的 MediaAsset.id(仅 action=media_auto_tag 时填充) */
  mediaAssetId?: string;
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

  /**
   * Variant for state-machine callers (e.g. media auto-tagging): identical
   * audit bookkeeping to {@link run}, but failures are RE-THROWN after the
   * failure row is persisted, and success returns the audit metadata the
   * caller needs (aiOpId for billing idempotency, tokensUsed for metering).
   *
   * Why: `run()` never throws and always returns `fallback`, which makes it
   * impossible for a caller to drive a DONE/FAILED state machine without
   * sentinel conventions. Callers must still perform their own DB writes /
   * billing / side effects AFTER this resolves — never inside onSuccess
   * (hook errors are swallowed).
   */
  async runOrThrow<T>(
    opts: Omit<AIOperationLogOptions<T>, 'fallback' | 'onSuccess'>,
  ): Promise<{ result: T; tokensUsed?: number; aiOpId: string }> {
    const startTime = Date.now();
    try {
      const { result, tokensUsed } = await opts.fn();
      const aiOp = await this.persistSuccess(
        opts,
        result,
        tokensUsed,
        Date.now() - startTime,
      );
      return { result, tokensUsed, aiOpId: aiOp.id };
    } catch (error) {
      this.logger.error(
        `${opts.action} failed:`,
        (error as Error)?.message ?? String(error),
      );
      await this.persistFailure(opts, error, Date.now() - startTime);
      throw error;
    }
  }

  private async persistSuccess<T>(
    opts:
      | AIOperationLogOptions<T>
      | Omit<AIOperationLogOptions<T>, 'fallback' | 'onSuccess'>,
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
        prompt: truncateForAudit(opts.prompt),
        result: truncateForAudit(JSON.stringify(result)),
        model: opts.model,
        tokensUsed,
        durationMs,
        articleId: opts.articleId,
        mediaAssetId: opts.mediaAssetId,
        createdBy: opts.userId,
      },
    });
  }

  private async persistFailure<T>(
    opts:
      | AIOperationLogOptions<T>
      | Omit<AIOperationLogOptions<T>, 'fallback' | 'onSuccess'>,
    error: unknown,
    durationMs: number,
  ) {
    return this.prisma.aIOperation.create({
      data: {
        agentType: opts.agentType as AgentType,
        action: opts.action,
        prompt: truncateForAudit(opts.prompt),
        result: truncateForAudit(
          JSON.stringify({
            error: (error as Error)?.message ?? String(error),
          }),
        ),
        model: opts.model,
        durationMs,
        articleId: opts.articleId,
        mediaAssetId: opts.mediaAssetId,
        createdBy: opts.userId,
      },
    });
  }
}

/**
 * 审计字段兜底截断(AIOperation.prompt/result 为 @db.Text,64KB 上限)。
 * 调用方本不应把大体量内容(如 base64 图片)放进 prompt —— 这是与调用方
 * 无关的最后防线,防 insert 失败把审计链路本身炸掉。
 */
const AUDIT_FIELD_MAX = 32 * 1024;

function truncateForAudit(text: string): string {
  return text.length > AUDIT_FIELD_MAX
    ? `${text.slice(0, AUDIT_FIELD_MAX)}…[truncated, ${text.length} chars total]`
    : text;
}
