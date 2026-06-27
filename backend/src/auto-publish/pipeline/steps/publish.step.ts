import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WordPressService } from '../../../channels/wordpress.service';
import { PublishStatus, ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';

@Injectable()
export class PublishStep implements PipelineStep {
  readonly name = 'publish';
  readonly successStatus = ArticleRunStatus.PUBLISHED;
  private readonly logger = new Logger(PublishStep.name);

  constructor(
    private prisma: PrismaService,
    private wordPressService: WordPressService,
  ) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.savedArticleId) throw new Error('No saved article to publish');
    if (!ctx.draft) throw new Error('No draft available');

    this.logger.log(`Publishing article ${ctx.savedArticleId} to ${ctx.publishConfig.platform}`);

    // 1. Create PlatformPublish record (so WordPressService can use it)
    const publish = await this.prisma.platformPublish.upsert({
      where: {
        articleId_platform: {
          articleId: ctx.savedArticleId,
          platform: ctx.publishConfig.platform,
        },
      },
      create: {
        articleId: ctx.savedArticleId,
        platform: ctx.publishConfig.platform,
        status: PublishStatus.READY,
        adaptedTitle: ctx.draft.title,
        adaptedContent: ctx.draft.content,
        adaptedExcerpt: ctx.draft.excerpt || null,
        adaptedTags: JSON.stringify(ctx.draft.tags || []),
        coverImages: JSON.stringify(ctx.coverImageUrl ? [ctx.coverImageUrl] : []),
      },
      update: {
        status: PublishStatus.READY,
        adaptedTitle: ctx.draft.title,
        adaptedContent: ctx.draft.content,
        adaptedExcerpt: ctx.draft.excerpt || null,
        adaptedTags: JSON.stringify(ctx.draft.tags || []),
        coverImages: JSON.stringify(ctx.coverImageUrl ? [ctx.coverImageUrl] : []),
      },
    });

    ctx.platformPublishId = publish.id;

    // 2. Publish via WordPressService
    const wpStatus = (ctx.publishConfig.postStatus as 'publish' | 'draft') || 'publish';
    const result = await this.wordPressService.publish(ctx.savedArticleId, wpStatus);

    // 3. Update tracking record
    await this.prisma.autoPublishArticle.update({
      where: { id: ctx.articleId },
      data: { platformPublishId: result.id },
    });

    // Trace observability
    const trace = ctx.trace?.[ctx.trace.length - 1];
    if (trace) {
      trace.metadata = {
        platform: ctx.publishConfig.platform,
        platformPublishId: publish.id,
        publishedUrl: result.publishedUrl || null,
      };
      trace.decisions = [
        `Published to ${ctx.publishConfig.platform}: ${result.publishedUrl || 'pending'}`,
      ];
    }

    this.logger.log(
      `Article published to WordPress: ${result.publishedUrl || 'pending'}`,
    );
    return ctx;
  }
}
