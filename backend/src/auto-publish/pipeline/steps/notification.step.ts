import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';

@Injectable()
export class NotificationStep implements PipelineStep {
  readonly name = 'notification';
  readonly successStatus = ArticleRunStatus.PUBLISHED; // stays PUBLISHED
  private readonly logger = new Logger(NotificationStep.name);

  constructor(private config: ConfigService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    // MVP: log notification. Email notification will be handled at the
    // run level (after all articles complete), not per-article.
    this.logger.log(
      `Pipeline completed for article: topic="${ctx.topic}", ` +
        `title="${ctx.draft?.title}", status=PUBLISHED`,
    );
    return ctx;
  }
}
