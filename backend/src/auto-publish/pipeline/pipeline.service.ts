import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ArticleRunStatus,
  RunStatus,
  ArticleStatus,
  TransactionType,
  BillingCategory,
} from '@cms-ng/shared';
import { PipelineStep, PipelineContext, StepTraceEntry } from './step.interface';
import { RedisService } from '../../redis/redis.service';
import { AutoPublishSchedulerService } from '../auto-publish-scheduler.service';
import { BillingService } from '../../billing/billing.service';
import { TopicCollectionStep } from './steps/topic-collection.step';
import { ResearchStep } from './steps/research.step';
import { ArticleGenerationStep } from './steps/article-generation.step';
import { ImageGenerationStep } from './steps/image-generation.step';
import { ArticleSaveStep } from './steps/article-save.step';
import { PublishStep } from './steps/publish.step';
import { NotificationStep } from './steps/notification.step';
import { BillingCheckStep } from './steps/billing-check.step';
import { EstimateOperationType } from '../../billing/dto/estimate-cost.dto';
import { safeJsonParse } from '../../common/json.utils';
import * as nodemailer from 'nodemailer';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly steps: PipelineStep[];
  private transporter?: nodemailer.Transporter;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private redis: RedisService,
    private billingService: BillingService,
    @Inject(forwardRef(() => AutoPublishSchedulerService))
    private scheduler: AutoPublishSchedulerService,
    private billingCheckStep: BillingCheckStep,
    private topicStep: TopicCollectionStep,
    private researchStep: ResearchStep,
    private articleGenStep: ArticleGenerationStep,
    private imageGenStep: ImageGenerationStep,
    private articleSaveStep: ArticleSaveStep,
    private publishStep: PublishStep,
    private notificationStep: NotificationStep,
  ) {
    this.steps = [
      this.billingCheckStep,
      this.topicStep,
      this.researchStep,
      this.articleGenStep,
      this.articleSaveStep,
      this.imageGenStep,
      this.publishStep,
      this.notificationStep,
    ];
    this.initMailer();
  }

  private initMailer(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — email notifications disabled');
    }
  }

  /**
   * Run the full pipeline for a single task execution.
   * Creates a Run record and processes `batchSize` articles.
   */
  async runTask(taskId: string, triggerType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<void> {
    // Check kill switch first — blocks both scheduled and manual triggers
    // MySQL is the source of truth (issue #48 P0), not Redis
    const killSwitchActive = await this.scheduler.isKillSwitchActive();
    if (killSwitchActive) {
      this.logger.warn(`Kill switch active — skipping task ${taskId} (${triggerType})`);
      return;
    }

    const task = await this.prisma.autoPublishTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      this.logger.error(`Task ${taskId} not found`);
      return;
    }
    if (task.status !== 'ACTIVE') {
      this.logger.warn(`Task ${taskId} is not ACTIVE (status=${task.status}), skipping`);
      return;
    }

    // Acquire concurrency lock to prevent duplicate runs
    const lockKey = `auto-publish:task:${taskId}`;
    const lockAcquired = await this.redis.acquireLock(lockKey, 600); // 10 min TTL
    if (!lockAcquired) {
      // 区分两种场景：Redis 不可用 (fail-closed) vs. 同任务并发去重
      if (!this.redis.isAvailable) {
        this.logger.error(
          `Task ${taskId} BLOCKED: Redis unavailable, fail-closed lock denied (${triggerType})`,
        );
      } else {
        this.logger.warn(`Task ${taskId} is already running — skipping duplicate trigger`);
      }
      return;
    }

    try {
      await this.executeRun(task, triggerType);
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  private async executeRun(task: any, triggerType: 'SCHEDULED' | 'MANUAL'): Promise<void> {
    const taskId = task.id;

    // Create run record
    const run = await this.prisma.autoPublishRun.create({
      data: {
        taskId,
        status: RunStatus.RUNNING,
        totalArticles: task.batchSize,
        triggerType,
      },
    });

    const retryConfig = safeJsonParse<{ maxRetries: number; retryDelayMs: number }>(
      task.retryConfig,
      { maxRetries: 2, retryDelayMs: 30000 },
    );
    const contentConfig = safeJsonParse(task.contentConfig, {});
    const publishConfig = safeJsonParse(task.publishConfig, {});

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Process each article in the batch
    for (let i = 0; i < task.batchSize; i++) {
      // Create tracking record
      const articleRecord = await this.prisma.autoPublishArticle.create({
        data: {
          runId: run.id,
          taskId,
          status: ArticleRunStatus.PENDING,
        },
      });

      const ctx: PipelineContext = {
        taskId,
        runId: run.id,
        articleId: articleRecord.id,
        userId: task.createdBy,
        contentConfig: contentConfig as any,
        publishConfig: publishConfig as any,
      };

      try {
        await this.executeWithRetry(ctx, retryConfig);
        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`Article ${i + 1}: ${error.message}`);
        this.logger.error(
          `Pipeline failed for article ${i + 1} in run ${run.id}: ${error.message}`,
        );

        // Mark as PIPELINE_FAILED if we saved a partial article
        if (ctx.savedArticleId) {
          try {
            await this.prisma.article.update({
              where: { id: ctx.savedArticleId },
              data: { status: ArticleStatus.PIPELINE_FAILED },
            });
          } catch {
            // ignore — article may not exist
          }
        }
      }
    }

    // Update run record
    const runStatus =
      failedCount === 0
        ? RunStatus.COMPLETED
        : successCount > 0
          ? RunStatus.PARTIAL
          : RunStatus.FAILED;

    await this.prisma.autoPublishRun.update({
      where: { id: run.id },
      data: {
        status: runStatus,
        completedAt: new Date(),
        successCount,
        failedCount,
        errorLog: errors.length ? JSON.stringify(errors) : null,
      },
    });

    // Update task's lastRunAt
    await this.prisma.autoPublishTask.update({
      where: { id: taskId },
      data: { lastRunAt: new Date() },
    });

    // Send notification email
    await this.sendRunNotification(task, run.id, runStatus, successCount, failedCount, errors);

    this.logger.log(
      `Run ${run.id} completed: ${runStatus} (${successCount} success, ${failedCount} failed)`,
    );
  }

  /**
   * Retry a single failed article through the pipeline.
   * Unlike runTask, this only processes one article, not the full batch.
   */
  async retrySingleArticle(articleId: string): Promise<void> {
    // Check kill switch
    const killSwitchActive = await this.redis.get('auto-publish:kill-switch') === 'true';
    if (killSwitchActive) {
      this.logger.warn(`Kill switch active — skipping retry for article ${articleId}`);
      return;
    }

    const record = await this.prisma.autoPublishArticle.findUnique({
      where: { id: articleId },
      include: {
        run: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!record) {
      this.logger.error(`Auto-publish article ${articleId} not found`);
      return;
    }

    if (record.status !== ArticleRunStatus.FAILED) {
      this.logger.warn(`Article ${articleId} is not FAILED (status=${record.status}), skipping retry`);
      return;
    }

    const task = record.run.task;
    const retryConfig = safeJsonParse<{ maxRetries: number; retryDelayMs: number }>(
      task.retryConfig,
      { maxRetries: 2, retryDelayMs: 30000 },
    );
    const contentConfig = safeJsonParse(task.contentConfig, {});
    const publishConfig = safeJsonParse(task.publishConfig, {});

    // Reset the article status to PENDING for retry
    await this.prisma.autoPublishArticle.update({
      where: { id: articleId },
      data: {
        status: ArticleRunStatus.PENDING,
        failedStep: null,
        errorMessage: null,
        retryCount: 0,
      },
    });

    const ctx: PipelineContext = {
      taskId: task.id,
      runId: record.runId,
      articleId: record.id,
      userId: task.createdBy,
      contentConfig: contentConfig as any,
      publishConfig: publishConfig as any,
      // Preserve topic from previous run if available
      topic: record.topic || undefined,
    };

    try {
      await this.executeWithRetry(ctx, retryConfig);

      // Update run success count
      const run = await this.prisma.autoPublishRun.findUnique({
        where: { id: record.runId },
        include: { articles: true },
      });
      if (run) {
        const successCount = run.articles.filter(
          (a) => a.status === ArticleRunStatus.PUBLISHED,
        ).length;
        const failedCount = run.articles.filter(
          (a) => a.status === ArticleRunStatus.FAILED,
        ).length;
        const runStatus =
          failedCount === 0
            ? RunStatus.COMPLETED
            : successCount > 0
              ? RunStatus.PARTIAL
              : RunStatus.FAILED;

        await this.prisma.autoPublishRun.update({
          where: { id: record.runId },
          data: { status: runStatus, successCount, failedCount },
        });
      }

      this.logger.log(`Single article retry succeeded: ${articleId}`);
    } catch (error: any) {
      this.logger.error(`Single article retry failed for ${articleId}: ${error.message}`);

      if (ctx.savedArticleId) {
        try {
          await this.prisma.article.update({
            where: { id: ctx.savedArticleId },
            data: { status: ArticleStatus.PIPELINE_FAILED },
          });
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Execute the pipeline steps for a single article, with retry logic.
   */
  private async executeWithRetry(
    ctx: PipelineContext,
    retryConfig: { maxRetries: number; retryDelayMs: number },
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = retryConfig.retryDelayMs * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Retrying pipeline for ${ctx.topic || 'unknown'} (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}) after ${delay}ms`,
        );
        await this.sleep(delay);

        // Update retry count
        await this.prisma.autoPublishArticle.update({
          where: { id: ctx.articleId },
          data: { retryCount: attempt },
        });
      }

      // Initialize trace for this attempt
      ctx.trace = [];

      try {
        let currentCtx = ctx;
        for (const step of this.steps) {
          // Create trace entry for this step
          const traceEntry: StepTraceEntry = {
            step: step.name,
            status: 'success',
            startedAt: new Date().toISOString(),
            durationMs: 0,
            decisions: [],
            metadata: {},
          };

          // Update status to indicate we're working on this step
          await this.prisma.autoPublishArticle.update({
            where: { id: ctx.articleId },
            data: {
              status: step.successStatus,
              topic: currentCtx.topic || null,
            },
          });

          const t0 = Date.now();
          try {
            currentCtx = await step.execute(currentCtx);
            traceEntry.durationMs = Date.now() - t0;
            traceEntry.completedAt = new Date().toISOString();
          } catch (stepError: any) {
            traceEntry.durationMs = Date.now() - t0;
            traceEntry.completedAt = new Date().toISOString();
            traceEntry.status = 'failed';
            traceEntry.error = {
              message: stepError.message,
              stack: stepError.stack,
            };
            currentCtx.trace!.push(traceEntry);

            // Notification step is non-critical (issue #56): its failure
            // (e.g., SMTP timeout) should NOT mark the run FAILED because
            // the article has already been published. Log + continue.
            if (step.name === 'notification') {
              this.logger.warn(
                `Notification step failed for "${ctx.topic || 'unknown'}" ` +
                  `(non-critical, run status preserved): ${stepError.message}`,
              );
              // Deduct billing even if notification fails (article was published)
              await this.deductAutoPublishBilling(currentCtx);
              // Persist trace even on notification failure
              await this.persistTrace(ctx);
              return; // treat article as published-successfully
            }
            throw stepError;
          }

          currentCtx.trace!.push(traceEntry);
        }

        // All steps succeeded — deduct billing
        await this.deductAutoPublishBilling(currentCtx);
        // Persist execution trace
        await this.persistTrace(ctx);
        return; // success
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Pipeline step failed for "${ctx.topic || 'unknown'}" (attempt ${attempt + 1}): ${error.message}`,
        );
      }
    }

    // All retries exhausted — update tracking record with trace
    const totalDurationMs = ctx.trace?.reduce((sum, e) => sum + e.durationMs, 0) ?? 0;
    await this.prisma.autoPublishArticle.update({
      where: { id: ctx.articleId },
      data: {
        status: ArticleRunStatus.FAILED,
        failedStep: this.getFailedStep(ctx),
        errorMessage: lastError?.message || 'Unknown error',
        executionTrace: ctx.trace ? JSON.stringify(ctx.trace) : null,
        totalDurationMs,
      },
    });

    throw lastError || new Error('Pipeline failed with unknown error');
  }

  /**
   * Persist the execution trace to the tracking record.
   */
  private async persistTrace(ctx: PipelineContext): Promise<void> {
    const totalDurationMs =
      ctx.trace?.reduce((sum, e) => sum + e.durationMs, 0) ?? 0;
    await this.prisma.autoPublishArticle.update({
      where: { id: ctx.articleId },
      data: {
        executionTrace: ctx.trace ? JSON.stringify(ctx.trace) : null,
        totalDurationMs,
      },
    });
  }

  /**
   * Deduct billing after a successful auto-publish.
   * Wrapped in try-catch — billing failure should NOT roll back a published article.
   */
  private async deductAutoPublishBilling(ctx: PipelineContext): Promise<void> {
    if (!this.billingService.isEnabled()) return;

    const idempotencyKey = `auto_publish:${ctx.articleId}:${ctx.publishConfig.platform}`;

    try {
      // Estimate cost for this single article
      const estimation = await this.billingService.estimateCost(ctx.userId, {
        operationType: EstimateOperationType.AUTO_PUBLISH,
        batchSize: 1,
        platforms: [ctx.publishConfig.platform],
      });

      if (estimation.estimatedCost <= 0) return;

      await this.billingService.deduct({
        userId: ctx.userId,
        type: TransactionType.AUTO_PUBLISH,
        category: BillingCategory.PUBLISHING,
        amount: estimation.estimatedCost,
        description: `自动发布扣费: ${ctx.topic || 'unknown'} → ${ctx.publishConfig.platform}`,
        articleId: ctx.savedArticleId,
        platformPublishId: ctx.platformPublishId,
        idempotencyKey,
        metadata: {
          taskId: ctx.taskId,
          runId: ctx.runId,
          articleTrackingId: ctx.articleId,
          topic: ctx.topic,
          platform: ctx.publishConfig.platform,
        },
      });

      this.logger.log(
        `Auto-publish billing deducted: user=${ctx.userId}, ` +
          `amount=¥${estimation.estimatedCost.toFixed(4)}, article=${ctx.articleId}`,
      );

      // Check and trigger low-balance alert
      await this.billingService.checkAndAlertBalance(ctx.userId);
    } catch (error: any) {
      this.logger.warn(
        `Failed to deduct auto-publish billing (article still published): ` +
          `articleId=${ctx.articleId}, error=${error.message}`,
      );
    }
  }

  /**
   * Determine which step failed based on the execution trace or context state.
   */
  private getFailedStep(ctx: PipelineContext): string {
    // Prefer trace data — it records the actual failed step name
    const failedEntry = ctx.trace?.find((e) => e.status === 'failed');
    if (failedEntry) return failedEntry.step;

    // Fallback: heuristic based on context state
    if (!ctx.topic) return 'billing_check/topic-collection';
    if (!ctx.researchData) return 'research';
    if (!ctx.draft) return 'article-generation';
    if (!ctx.savedArticleId) return 'article-save';
    if (!ctx.platformPublishId) return 'publish';
    return 'notification';
  }

  private async sendRunNotification(
    task: any,
    runId: string,
    status: RunStatus,
    success: number,
    failed: number,
    errors: string[],
  ): Promise<void> {
    if (!this.transporter) return;

    const to = this.config.get<string>('NOTIFICATION_EMAIL');
    if (!to) return;

    const statusEmoji: Record<string, string> = {
      [RunStatus.COMPLETED]: '✅',
      [RunStatus.PARTIAL]: '⚠️',
      [RunStatus.FAILED]: '❌',
      [RunStatus.RUNNING]: '🔄',
    };

    const subject = `${statusEmoji[status] || ''} [Auto-Publish] ${task.name} — ${status}`;
    const body = [
      `Task: ${task.name}`,
      `Run ID: ${runId}`,
      `Status: ${status}`,
      `Success: ${success} / ${task.batchSize}`,
      `Failed: ${failed} / ${task.batchSize}`,
      '',
      ...(errors.length ? ['Errors:', ...errors.map((e) => `  - ${e}`)] : []),
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM', 'cms-ng@noreply.com'),
        to,
        subject,
        text: body,
      });
    } catch (error: any) {
      this.logger.warn(`Failed to send notification email: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
