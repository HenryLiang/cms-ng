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

  execute(ctx: PipelineContext): Promise<PipelineContext> {
    // Trace observability
    const trace = ctx.trace?.[ctx.trace.length - 1];
    if (trace) {
      trace.metadata = {
        topic: ctx.topic,
        draftTitle: ctx.draft?.title,
      };
      trace.decisions = [
        `Pipeline completed for topic="${ctx.topic}", title="${ctx.draft?.title}"`,
      ];
    }

    // MVP: log notification. Email notification will be handled at the
    // run level (after all articles complete), not per-article.
    this.logger.log(
      `Pipeline completed for article: topic="${ctx.topic}", ` +
        `title="${ctx.draft?.title}", status=PUBLISHED`,
    );
    return Promise.resolve(ctx);
  }
}
