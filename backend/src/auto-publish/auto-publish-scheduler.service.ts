import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, validateCronExpression } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PipelineService } from './pipeline/pipeline.service';
import { AutoTaskStatus } from '@cms-ng/shared';
import { safeJsonParse } from '../common/json.utils';

@Injectable()
export class AutoPublishSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AutoPublishSchedulerService.name);
  private static readonly KILL_SWITCH_KEY = 'auto-publish:kill-switch';
  private static readonly KILL_SWITCH_ID = 'auto-publish'; // KillSwitch 表的单例 id

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => PipelineService))
    private pipelineService: PipelineService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing auto-publish scheduler...');
    await this.loadActiveTasks();
  }

  onModuleDestroy(): void {
    this.logger.log('Shutting down auto-publish scheduler');
  }

  /**
   * Load all ACTIVE tasks from DB and register their cron jobs.
   */
  private async loadActiveTasks(): Promise<void> {
    const tasks = await this.prisma.autoPublishTask.findMany({
      where: { status: AutoTaskStatus.ACTIVE },
    });

    this.logger.log(`Found ${tasks.length} active auto-publish tasks`);

    for (const task of tasks) {
      void this.registerTaskCron(task);
    }
  }

  /**
   * Register a cron job for a task based on its schedule config.
   */
  async registerTaskCron(task: {
    id: string;
    name: string;
    scheduleConfig: string;
  }): Promise<void> {
    const config = safeJsonParse<{ times: string[]; timezone: string }>(
      task.scheduleConfig,
      { times: [], timezone: 'Asia/Hong_Kong' },
    );

    if (!config.times?.length) {
      this.logger.warn(`Task ${task.name} has no scheduled times`);
      return;
    }

    // Remove existing job if any
    this.removeTaskCron(task.id);

    // Create a cron job for each time
    for (const [idx, time] of config.times.entries()) {
      // Validate upfront — issue #50 acceptance: any failure must throw,
      // never silently skip. timeToCron throws BadRequestException on invalid
      // input; that bubbles up to the controller as HTTP 400.
      const cronExpression = this.timeToCron(time);

      const jobName = `auto-publish-${task.id}-${idx}`;
      const job = new CronJob(
        cronExpression,
        async () => {
          const killActive = await this.isKillSwitchActive();
          if (killActive) {
            this.logger.warn(`Kill switch active — skipping task ${task.name}`);
            return;
          }
          this.logger.log(`Cron triggered: ${task.name} at ${time}`);
          try {
            await this.pipelineService.runTask(task.id, 'SCHEDULED');
          } catch (error) {
            this.logger.error(
              `Task ${task.name} failed: ${(error as Error).message}`,
            );
          }
        },
        undefined,
        false,
        config.timezone,
      );

      this.schedulerRegistry.addCronJob(jobName, job);
      job.start();
      this.logger.log(
        `Registered cron job: ${task.name} at ${time} (${config.timezone})`,
      );
    }

    // Compute and store nextRunAt
    await this.updateNextRunAt(task.id, config.times, config.timezone);
  }

  /**
   * Remove all cron jobs for a task.
   */
  removeTaskCron(taskId: string): void {
    const prefix = `auto-publish-${taskId}-`;
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((job, name) => {
      if (name.startsWith(prefix)) {
        void job.stop();
        this.schedulerRegistry.deleteCronJob(name);
      }
    });
  }

  /**
   * Enable the kill switch — stops all scheduled and manual runs.
   * MySQL 为唯一真源（issue #48 P0 修复），Redis 仅作 best-effort 缓存。
   */
  async enableKillSwitch(operatorId: string, reason?: string): Promise<void> {
    await this.prisma.killSwitch.upsert({
      where: { id: AutoPublishSchedulerService.KILL_SWITCH_ID },
      create: {
        id: AutoPublishSchedulerService.KILL_SWITCH_ID,
        enabled: true,
        enabledAt: new Date(),
        enabledBy: operatorId,
        reason: reason ?? null,
      },
      update: {
        enabled: true,
        enabledAt: new Date(),
        enabledBy: operatorId,
        reason: reason ?? null,
      },
    });
    // Redis 缓存失败不影响业务（DB 已是真源）
    await this.redis.set(AutoPublishSchedulerService.KILL_SWITCH_KEY, '1');
    this.logger.warn(
      `Kill switch ENABLED by ${operatorId} (reason: ${reason || 'n/a'})`,
    );
  }

  /**
   * Disable the kill switch.
   */
  async disableKillSwitch(operatorId: string): Promise<void> {
    await this.prisma.killSwitch.upsert({
      where: { id: AutoPublishSchedulerService.KILL_SWITCH_ID },
      create: {
        id: AutoPublishSchedulerService.KILL_SWITCH_ID,
        enabled: false,
      },
      update: {
        enabled: false,
        enabledAt: null,
        enabledBy: operatorId,
        reason: null,
      },
    });
    await this.redis.del(AutoPublishSchedulerService.KILL_SWITCH_KEY);
    this.logger.log(`Kill switch DISABLED by ${operatorId}`);
  }

  /**
   * 查询 kill switch 状态 — MySQL 为唯一真源（issue #48 P0 修复）。
   * 不读 Redis，避免 Redis 不可用时返回错误结果。
   */
  async isKillSwitchActive(): Promise<boolean> {
    const row = await this.prisma.killSwitch.findUnique({
      where: { id: AutoPublishSchedulerService.KILL_SWITCH_ID },
    });
    return row?.enabled === true;
  }

  /**
   * Normalize a schedule entry to a standard 5-field cron expression.
   *
   * Two input shapes are accepted (issue #50):
   *
   *  1. `HH:MM` shorthand (legacy, e.g. "08:00") -> expands to daily cron
   *     "0 8 * * *". Hour 00-23, minute 00-59.
   *
   *  2. Standard 5-field cron expression (e.g. star-slash-5 every minute).
   *     Validated via the `cron` library's `validateCronExpression` and
   *     returned verbatim if valid.
   *
   * Throws `BadRequestException` (HTTP 400) on anything else — issue #50
   * acceptance criterion: "any failure throws 400, never silently skips".
   */
  private timeToCron(time: string): string {
    // (1) HH:MM shorthand
    const hhmm = time.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      const hour = parseInt(hhmm[1], 10);
      const minute = parseInt(hhmm[2], 10);
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new BadRequestException(
          `Invalid time "${time}": hours must be 00-23 and minutes 00-59`,
        );
      }
      return `${minute} ${hour} * * *`; // every day at HH:MM
    }

    // (2) Standard cron — validate before returning
    const result = validateCronExpression(time);
    if (result.valid) {
      return time;
    }

    // (3) Anything else: surface a 400, never silently skip
    const errorMsg =
      (result.error && (result.error as { message?: string }).message) ||
      'unparseable';
    throw new BadRequestException(
      `Invalid cron expression "${time}": ${errorMsg}`,
    );
  }

  /**
   * Update the nextRunAt field for a task.
   *
   * Supports both HH:MM shorthand and standard cron (issue #50). For standard
   * cron we delegate to the `cron` library's `sendAt()` helper which knows
   * the actual next-fire time; for HH:MM we keep the simple "next occurrence"
   * approximation.
   */
  private async updateNextRunAt(
    taskId: string,
    times: string[],
    timezone: string,
  ): Promise<void> {
    const now = new Date();
    let earliest: Date | null = null;

    for (const time of times) {
      let next: Date | null = null;
      const hhmm = time.match(/^(\d{1,2}):(\d{2})$/);

      if (hhmm) {
        const hour = parseInt(hhmm[1], 10);
        const minute = parseInt(hhmm[2], 10);
        next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
      } else {
        // Standard cron — use sendAt() to compute the real next fire time
        try {
          const { sendAt } = await import('cron');
          const nextLuxon = sendAt(time).setZone(timezone);
          next = nextLuxon.toJSDate();
        } catch {
          // skip — will be re-validated by registerTaskCron on next call
          continue;
        }
      }

      if (next && (!earliest || next < earliest)) {
        earliest = next;
      }
    }

    if (earliest) {
      await this.prisma.autoPublishTask.update({
        where: { id: taskId },
        data: { nextRunAt: earliest },
      });
    }
  }
}
