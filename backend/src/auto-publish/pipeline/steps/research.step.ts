import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../../ai/ai.service';
import { ContentLanguage } from '@cms-ng/shared';
import { ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';
import type { ResearchKitResult } from '../../../ai/dto/writing-operations.dto';

@Injectable()
export class ResearchStep implements PipelineStep {
  readonly name = 'research';
  readonly successStatus = ArticleRunStatus.RESEARCHED;
  private readonly logger = new Logger(ResearchStep.name);

  constructor(private aiService: AIService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.topic) throw new Error('No topic selected');

    this.logger.log(`Researching topic: "${ctx.topic}"`);

    const researchKit = (await this.aiService.generateResearchKit(ctx.userId, {
      storyTitle: ctx.topic,
      storyDescription: '',
      storyAngle: '',
      storyTags: [],
      language: (ctx.contentConfig.language as ContentLanguage) || undefined,
    })) as ResearchKitResult;

    ctx.researchData = researchKit;

    // Collect trace data for observability
    const trace = ctx.trace?.[ctx.trace.length - 1];
    if (trace) {
      const timelineCount = researchKit.timeline?.length || 0;
      const peopleCount = researchKit.people?.length || 0;
      const dataCount = researchKit.data?.length || 0;
      const opinionsCount = researchKit.opinions?.length || 0;

      trace.metadata = {
        researchKit: {
          timelineCount,
          peopleCount,
          dataCount,
          opinionsCount,
        },
        searchSources: ['wikipedia', 'tavily'],
        fullResearchKit: researchKit,
      };

      trace.decisions = [
        `Research completed: ${timelineCount} timeline, ${peopleCount} people, ${dataCount} data points, ${opinionsCount} opinions`,
      ];
    }

    this.logger.log(
      `Research completed: ${researchKit.timeline?.length || 0} timeline, ` +
        `${researchKit.people?.length || 0} people, ` +
        `${researchKit.data?.length || 0} data points, ` +
        `${researchKit.opinions?.length || 0} opinions`,
    );
    return ctx;
  }
}
