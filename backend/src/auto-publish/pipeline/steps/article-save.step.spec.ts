import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ArticleSaveStep } from './article-save.step';
import type { PipelineContext } from '../step.interface';

describe('ArticleSaveStep', () => {
  it('emits an article projection update after auto-publish creates a draft', async () => {
    const prisma = {
      story: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      article: { create: jest.fn() },
      articleVersion: { create: jest.fn() },
      autoPublishArticle: { update: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    const eventEmitter = { emit: jest.fn() };
    const step = new ArticleSaveStep(
      prisma,
      eventEmitter as unknown as EventEmitter2,
    );
    prisma.story.findFirst.mockResolvedValue({ id: 'story-1' });
    prisma.article.create.mockResolvedValue({
      id: 'article-1',
      title: '自动发布稿件',
      content: '<p>正文</p>',
    });
    prisma.articleVersion.create.mockResolvedValue({ id: 'version-1' });
    prisma.autoPublishArticle.update.mockResolvedValue({ id: 'tracking-1' });

    await step.execute({
      articleId: 'tracking-1',
      taskId: 'task-1',
      runId: 'run-1',
      userId: 'user-1',
      topic: '选题',
      draft: {
        title: '自动发布稿件',
        content: '<p>正文</p>',
        tags: [],
      },
      contentConfig: { language: 'SIMPLIFIED_CHINESE' },
      publishConfig: { platform: 'WECHAT' },
    } as unknown as PipelineContext);

    expect(eventEmitter.emit).toHaveBeenCalledWith('article.updated', {
      articleId: 'article-1',
    });
  });
});
