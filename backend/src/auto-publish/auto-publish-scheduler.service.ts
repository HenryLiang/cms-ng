import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PipelineService } from './pipeline/pipeline.service';
import { AutoTaskStatus, AutoTaskStatus as TaskStatus } from '@cms-ng/shared';
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
      this.registerTaskCron(task);
    }
  }

  /**
   * Register a cron job for a task based on its schedule config.
   */
  registerTaskCron(task: {
    id: string;
    name: string;
    scheduleConfig: string;
  }): void {
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
    config.times.forEach((time, idx) => {
      const cronExpression = this.timeToCron(time);
      if (!cronExpression) {
        this.logger.warn(`Invalid time format "${time}" for task ${task.name}`);
        return;
      }

      const jobName = `auto-publish-${task.id}-${idx}`;
      const job = new CronJob(cronExpression, async () => {
        const killActive = await this.isKillSwitchActive();
        if (killActive) {
          this.logger.warn(`Kill switch active — skipping task ${task.name}`);
          return;
        }
        this.logger.log(`Cron triggered: ${task.name} at ${time}`);
        try {
          await this.pipelineService.runTask(task.id, 'SCHEDULED');
        } catch (error: any) {
          this.logger.error(`Task ${task.name} failed: ${error.message}`);
        }
      }, undefined, false, config.timezone);

      this.schedulerRegistry.addCronJob(jobName, job);
      job.start();
      this.logger.log(
        `Registered cron job: ${task.name} at ${time} (${config.timezone})`,
      );
    });

    // Compute and store nextRunAt
    this.updateNextRunAt(task.id, config.times, config.timezone);
  }

  /**
   * Remove all cron jobs for a task.
   */
  removeTaskCron(taskId: string): void {
    const prefix = `auto-publish-${taskId}-`;
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((job, name) => {
      if (name.startsWith(prefix)) {
        job.stop();
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
   * Convert a time string like "08:00" to a cron expression.
   */
  private timeToCron(time: string): string | null {
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${minute} ${hour} * * *`; // every day at HH:MM
  }

  /**
   * Update the nextRunAt field for a task.
   */
  private async updateNextRunAt(
    taskId: string,
    times: string[],
    timezone: string,
  ): Promise<void> {
    const now = new Date();
    let earliest: Date | null = null;

    for (const time of times) {
      const match = time.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) continue;
      const hour = parseInt(match[1], 10);
      const minute = parseInt(match[2], 10);

      // Simple approximation: find next occurrence in local time
      const next = new Date(now);
      next.setHours(hour, minute, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      if (!earliest || next < earliest) {
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
