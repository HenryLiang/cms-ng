import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
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

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private schedulerRegistry: SchedulerRegistry,
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
   * Persisted to Redis so it survives server restarts.
   */
  async enableKillSwitch(): Promise<void> {
    await this.redis.set(AutoPublishSchedulerService.KILL_SWITCH_KEY, 'true');
    this.logger.warn('Kill switch ENABLED — all auto-publish tasks paused');
  }

  /**
   * Disable the kill switch.
   */
  async disableKillSwitch(): Promise<void> {
    await this.redis.del(AutoPublishSchedulerService.KILL_SWITCH_KEY);
    this.logger.log('Kill switch DISABLED — auto-publish tasks resumed');
  }

  async isKillSwitchActive(): Promise<boolean> {
    const value = await this.redis.get(AutoPublishSchedulerService.KILL_SWITCH_KEY);
    return value === 'true';
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
