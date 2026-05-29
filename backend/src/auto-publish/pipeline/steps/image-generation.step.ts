import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../../ai/ai.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';

@Injectable()
export class ImageGenerationStep implements PipelineStep {
  readonly name = 'image-generation';
  readonly successStatus = ArticleRunStatus.IMAGED;
  private readonly logger = new Logger(ImageGenerationStep.name);

  constructor(
    private aiService: AIService,
    private prisma: PrismaService,
  ) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.draft) throw new Error('No draft available');
    if (!ctx.savedArticleId) {
      // Article should already be saved by article-save step
      throw new Error('No saved article ID — article-save step must run first');
    }

    this.logger.log(`Generating cover image for: "${ctx.draft.title}"`);

    try {
      const result = await this.aiService.generateArticleImage(
        ctx.userId,
        ctx.savedArticleId,
        ctx.draft.title,
        ctx.draft.content,
        { style: 'news', aspectRatio: '16:9' },
      );
      ctx.coverImageUrl = result.url;

      // Update the saved article with the cover image URL
      await this.prisma.article.update({
        where: { id: ctx.savedArticleId },
        data: { coverImage: result.url },
      });

      this.logger.log(`Cover image generated: ${result.url}`);
    } catch (error: any) {
      // Image generation is non-critical — log warning but don't fail the pipeline
      this.logger.warn(
        `Cover image generation failed (non-critical): ${error.message}`,
      );
    }

    return ctx;
  }
}
