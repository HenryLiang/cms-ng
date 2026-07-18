import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, AutoPublishTask } from '@prisma/client';
import {
  AutoTaskStatus,
  ArticleRunStatus,
  PublishStatus,
} from '@cms-ng/shared';
import { AutoPublishSchedulerService } from './auto-publish-scheduler.service';
import { PipelineService } from './pipeline/pipeline.service';
import { WordPressService } from '../channels/wordpress.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { safeJsonParse } from '../common/json.utils';
import type { StepTraceEntry } from './pipeline/step.interface';

@Injectable()
export class AutoPublishService {
  private readonly logger = new Logger(AutoPublishService.name);

  constructor(
    private prisma: PrismaService,
    private scheduler: AutoPublishSchedulerService,
    private pipeline: PipelineService,
    private wordpress: WordPressService,
  ) {}

  // ===== Task CRUD =====

  async createTask(userId: string, dto: CreateTaskDto) {
    const task = await this.prisma.autoPublishTask.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        status: AutoTaskStatus.PAUSED, // always start paused
        scheduleType: dto.scheduleType || 'FIXED_TIME',
        scheduleConfig: JSON.stringify(dto.scheduleConfig),
        topicStrategy: JSON.stringify(dto.topicStrategy),
        contentConfig: JSON.stringify(dto.contentConfig),
        filterConfig: JSON.stringify(dto.filterConfig || {}),
        publishConfig: JSON.stringify(dto.publishConfig),
        batchSize: dto.batchSize || 1,
        retryConfig: JSON.stringify(
          dto.retryConfig || { maxRetries: 2, retryDelayMs: 30000 },
        ),
        createdBy: userId,
      },
    });

    return this.formatTask(task);
  }

  async findAll() {
    const tasks = await this.prisma.autoPublishTask.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { runs: true } },
      },
    });
    return tasks.map((t) => ({
      ...this.formatTask(t),
      createdByUser: t.user,
      runCount: t._count.runs,
    }));
  }

  async findOne(id: string) {
    const task = await this.prisma.autoPublishTask.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: { _count: { select: { articles: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    return {
      ...this.formatTask(task),
      createdByUser: task.user,
      recentRuns: task.runs.map((r) => ({
        ...r,
        errorLog: r.errorLog ? safeJsonParse(r.errorLog, []) : [],
        articleCount: r._count.articles,
      })),
    };
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.autoPublishTask.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Task not found');

    const data: Prisma.AutoPublishTaskUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.scheduleType !== undefined) data.scheduleType = dto.scheduleType;
    if (dto.batchSize !== undefined) data.batchSize = dto.batchSize;

    // JSON fields — merge with existing
    if (dto.scheduleConfig)
      data.scheduleConfig = JSON.stringify(dto.scheduleConfig);
    if (dto.topicStrategy)
      data.topicStrategy = JSON.stringify(dto.topicStrategy);
    if (dto.contentConfig)
      data.contentConfig = JSON.stringify(dto.contentConfig);
    if (dto.filterConfig) data.filterConfig = JSON.stringify(dto.filterConfig);
    if (dto.publishConfig)
      data.publishConfig = JSON.stringify(dto.publishConfig);
    if (dto.retryConfig) data.retryConfig = JSON.stringify(dto.retryConfig);

    const task = await this.prisma.autoPublishTask.update({
      where: { id },
      data,
    });

    // Update cron if schedule or status changed
    if (dto.status !== undefined || dto.scheduleConfig) {
      if ((task.status as AutoTaskStatus) === AutoTaskStatus.ACTIVE) {
        await this.scheduler.registerTaskCron(task);
      } else {
        this.scheduler.removeTaskCron(id);
      }
    }

    return this.formatTask(task);
  }

  async remove(id: string) {
    const existing = await this.prisma.autoPublishTask.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Task not found');

    this.scheduler.removeTaskCron(id);
    await this.prisma.autoPublishTask.delete({ where: { id } });
    return { deleted: true };
  }

  async toggleTask(id: string) {
    const task = await this.prisma.autoPublishTask.findUnique({
      where: { id },
    });
    if (!task) throw new NotFoundException('Task not found');

    const newStatus =
      (task.status as AutoTaskStatus) === AutoTaskStatus.ACTIVE
        ? AutoTaskStatus.PAUSED
        : AutoTaskStatus.ACTIVE;

    const updated = await this.prisma.autoPublishTask.update({
      where: { id },
      data: { status: newStatus },
    });

    if (newStatus === AutoTaskStatus.ACTIVE) {
      await this.scheduler.registerTaskCron(updated);
    } else {
      this.scheduler.removeTaskCron(id);
    }

    return this.formatTask(updated);
  }

  // ===== Manual run =====

  async manualRun(id: string) {
    const task = await this.prisma.autoPublishTask.findUnique({
      where: { id },
    });
    if (!task) throw new NotFoundException('Task not found');

    // Run asynchronously — don't block the response
    this.pipeline.runTask(id, 'MANUAL').catch((error) => {
      this.logger.error(
        `Manual run for task ${id} failed: ${(error as Error).message}`,
      );
    });

    return { message: 'Manual run triggered', taskId: id };
  }

  // ===== Run records =====

  async findRuns(query: {
    taskId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where: Prisma.AutoPublishRunWhereInput = {};
    if (query.taskId) where.taskId = query.taskId;
    if (query.status) where.status = query.status;

    const [runs, total] = await Promise.all([
      this.prisma.autoPublishRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          task: { select: { id: true, name: true } },
          _count: { select: { articles: true } },
        },
      }),
      this.prisma.autoPublishRun.count({ where }),
    ]);

    return {
      data: runs.map((r) => ({
        ...r,
        errorLog: r.errorLog ? safeJsonParse(r.errorLog, []) : [],
        articleCount: r._count.articles,
        taskName: r.task.name,
      })),
      meta: { page, pageSize, total },
    };
  }

  async findRunById(id: string) {
    const run = await this.prisma.autoPublishRun.findUnique({
      where: { id },
      include: {
        task: { select: { id: true, name: true } },
        articles: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Run not found');

    return {
      ...run,
      errorLog: run.errorLog ? safeJsonParse(run.errorLog, []) : [],
      taskName: run.task.name,
      articles: run.articles.map((a) => ({
        ...a,
        executionTrace: a.executionTrace
          ? safeJsonParse<StepTraceEntry[]>(a.executionTrace, [])
          : null,
      })),
    };
  }

  // ===== Article tracking =====

  async findRunArticles(runId: string) {
    const articles = await this.prisma.autoPublishArticle.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    return articles.map((a) => ({
      ...a,
      executionTrace: a.executionTrace
        ? safeJsonParse<StepTraceEntry[]>(a.executionTrace, [])
        : null,
    }));
  }

  async findArticleTrace(articleId: string) {
    const article = await this.prisma.autoPublishArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        topic: true,
        status: true,
        failedStep: true,
        errorMessage: true,
        retryCount: true,
        totalDurationMs: true,
        executionTrace: true,
      },
    });
    if (!article) throw new NotFoundException('Auto-publish article not found');

    return {
      ...article,
      executionTrace: article.executionTrace
        ? safeJsonParse<StepTraceEntry[]>(article.executionTrace, [])
        : [],
    };
  }

  async withdrawArticle(id: string) {
    const record = await this.prisma.autoPublishArticle.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Auto-publish article not found');
    if ((record.status as ArticleRunStatus) !== ArticleRunStatus.PUBLISHED) {
      throw new BadRequestException('Only published articles can be withdrawn');
    }
    if (!record.platformPublishId) {
      throw new BadRequestException('No platform publish record to withdraw');
    }

    // Get the PlatformPublish record to find the published URL
    const publish = await this.prisma.platformPublish.findUnique({
      where: { id: record.platformPublishId },
    });

    // Delete from WordPress if published URL exists
    if (publish?.publishedUrl) {
      try {
        await this.wordpress.deletePost(publish.publishedUrl, publish.notes);
      } catch (error) {
        this.logger.warn(
          `WordPress deletion failed for ${publish.publishedUrl}: ${(error as Error).message}`,
        );
      }
    }

    // Update PlatformPublish status
    await this.prisma.platformPublish.update({
      where: { id: record.platformPublishId },
      data: { status: PublishStatus.FAILED, notes: 'Withdrawn by user' },
    });

    // Update tracking record
    await this.prisma.autoPublishArticle.update({
      where: { id },
      data: { status: ArticleRunStatus.WITHDRAWN },
    });

    return { withdrawn: true };
  }

  async retryArticle(id: string) {
    const record = await this.prisma.autoPublishArticle.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Auto-publish article not found');
    if ((record.status as ArticleRunStatus) !== ArticleRunStatus.FAILED) {
      throw new BadRequestException('Only failed articles can be retried');
    }

    // Retry only this single article, not the entire batch
    this.pipeline.retrySingleArticle(id).catch((error) => {
      this.logger.error(
        `Retry for article ${id} failed: ${(error as Error).message}`,
      );
    });

    return { message: 'Retry triggered for single article', articleId: id };
  }

  // ===== Kill Switch =====

  async killSwitch(enable: boolean, operatorId: string, reason?: string) {
    if (enable) {
      await this.scheduler.enableKillSwitch(operatorId, reason);
    } else {
      await this.scheduler.disableKillSwitch(operatorId);
    }
    return { killSwitchActive: await this.scheduler.isKillSwitchActive() };
  }

  // ===== Stats =====

  async getStats() {
    const [totalTasks, activeTasks, totalRuns, totalArticles] =
      await Promise.all([
        this.prisma.autoPublishTask.count(),
        this.prisma.autoPublishTask.count({
          where: { status: AutoTaskStatus.ACTIVE },
        }),
        this.prisma.autoPublishRun.count(),
        this.prisma.autoPublishArticle.count(),
      ]);

    const [successArticles, failedArticles, killSwitchActive] =
      await Promise.all([
        this.prisma.autoPublishArticle.count({
          where: { status: ArticleRunStatus.PUBLISHED },
        }),
        this.prisma.autoPublishArticle.count({
          where: { status: ArticleRunStatus.FAILED },
        }),
        this.scheduler.isKillSwitchActive(),
      ]);

    return {
      totalTasks,
      activeTasks,
      totalRuns,
      totalArticles,
      successArticles,
      failedArticles,
      successRate:
        totalArticles > 0
          ? Math.round((successArticles / totalArticles) * 100)
          : 0,
      killSwitchActive,
    };
  }

  // ===== Helpers =====

  private formatTask(task: AutoPublishTask) {
    return {
      ...task,
      scheduleConfig: safeJsonParse(task.scheduleConfig, {}),
      topicStrategy: safeJsonParse(task.topicStrategy, {}),
      contentConfig: safeJsonParse(task.contentConfig, {}),
      filterConfig: safeJsonParse(task.filterConfig, {}),
      publishConfig: safeJsonParse(task.publishConfig, {}),
      retryConfig: safeJsonParse(task.retryConfig, {}),
    };
  }
}
