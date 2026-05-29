import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../../ai/ai.service';
import { ContentLanguage } from '@cms-ng/shared';
import { ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';

@Injectable()
export class ResearchStep implements PipelineStep {
  readonly name = 'research';
  readonly successStatus = ArticleRunStatus.RESEARCHED;
  private readonly logger = new Logger(ResearchStep.name);

  constructor(private aiService: AIService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.topic) throw new Error('No topic selected');

    this.logger.log(`Researching topic: "${ctx.topic}"`);

    const researchKit = await this.aiService.generateResearchKit(ctx.userId, {
      storyTitle: ctx.topic,
      storyDescription: '',
      storyAngle: '',
      storyTags: [],
      language: (ctx.contentConfig.language as ContentLanguage) || undefined,
    });

    ctx.researchData = researchKit;
    this.logger.log(
      `Research completed: ${researchKit.timeline?.length || 0} timeline, ` +
        `${researchKit.people?.length || 0} people, ` +
        `${researchKit.data?.length || 0} data points`,
    );
    return ctx;
  }
}
