import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ArticleStatus,
  ArticleRunStatus,
  ContentLanguage,
} from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';

@Injectable()
export class ArticleSaveStep implements PipelineStep {
  readonly name = 'article-save';
  readonly successStatus = ArticleRunStatus.SAVED;
  private readonly logger = new Logger(ArticleSaveStep.name);

  constructor(private prisma: PrismaService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.draft) throw new Error('No draft to save');
    if (!ctx.topic) throw new Error('No topic');

    this.logger.log(`Saving article: "${ctx.draft.title}"`);

    // 1. Create or find a Story for this topic
    let storyCreated = false;
    let story = await this.prisma.story.findFirst({
      where: {
        title: ctx.topic,
        reporterId: ctx.userId,
      },
    });

    if (!story) {
      storyCreated = true;
      story = await this.prisma.story.create({
        data: {
          title: ctx.topic,
          description: `Auto-generated story for topic: ${ctx.topic}`,
          status: ArticleStatus.AUTO_PUBLISHED,
          reporterId: ctx.userId,
          tags: JSON.stringify(ctx.draft.tags || []),
          contentLanguage: ctx.contentConfig.language as ContentLanguage,
        },
      });
    }
    ctx.savedStoryId = story.id;

    // 2. Create the Article
    const article = await this.prisma.article.create({
      data: {
        title: ctx.draft.title,
        subtitle: ctx.draft.subtitle || null,
        content: ctx.draft.content,
        excerpt: ctx.draft.excerpt || null,
        status: ArticleStatus.AUTO_PUBLISHED,
        storyId: story.id,
        authorId: ctx.userId,
        tags: JSON.stringify(ctx.draft.tags || []),
        platforms: JSON.stringify([ctx.publishConfig.platform]),
        coverImage: ctx.coverImageUrl || null,
        aiGeneratedParts: JSON.stringify([
          'title',
          'subtitle',
          'content',
          'excerpt',
        ]),
        contentLanguage: ctx.contentConfig.language as ContentLanguage,
        publishedAt: new Date(),
      },
    });

    // Overwrite the temp articleId with the real CMS article ID
    ctx.savedArticleId = article.id;

    // 3. Create ArticleVersion
    await this.prisma.articleVersion.create({
      data: {
        title: article.title,
        content: article.content,
        version: 1,
        articleId: article.id,
      },
    });

    // 4. Update the tracking record
    await this.prisma.autoPublishArticle.update({
      where: { id: ctx.articleId },
      data: { articleId: article.id },
    });

    // Trace observability
    const trace = ctx.trace?.[ctx.trace.length - 1];
    if (trace) {
      trace.metadata = {
        storyId: story.id,
        articleId: article.id,
        storyCreated,
      };
      trace.decisions = [
        storyCreated
          ? `Created new story "${ctx.topic}"`
          : `Reused existing story "${ctx.topic}"`,
        `Article saved: id=${article.id}`,
      ];
    }

    this.logger.log(
      `Article saved: id=${article.id}, title="${article.title}"`,
    );
    return ctx;
  }
}
