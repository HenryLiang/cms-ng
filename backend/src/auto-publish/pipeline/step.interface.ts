import { ArticleRunStatus } from '@cms-ng/shared';

/**
 * A single step's execution trace — timing, decisions, metadata, and errors.
 */
export interface StepTraceEntry {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  decisions?: string[];
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Context passed through the pipeline — each step reads inputs and writes outputs.
 */
export interface PipelineContext {
  // Immutable task config
  taskId: string;
  runId: string;
  articleId: string; // AutoPublishArticle.id (tracking record)
  userId: string; // Task creator

  // Config (parsed from JSON)
  contentConfig: {
    style: string;
    maxLength: number;
    language: string;
    systemPrompt?: string;
  };
  publishConfig: {
    platform: string;
    wordpressSiteId?: string;
    category?: string;
    postStatus?: string;
  };

  // Mutable — populated by steps
  topic?: string;
  researchData?: unknown;
  draft?: {
    title: string;
    subtitle?: string;
    content: string;
    excerpt?: string;
    tags?: string[];
  };
  coverImageUrl?: string;
  savedArticleId?: string; // CMS Article.id
  savedStoryId?: string;
  platformPublishId?: string;

  // Observability — step trace collector (initialized by pipeline engine)
  trace?: StepTraceEntry[];
}

/**
 * A single step in the auto-publish pipeline.
 */
export interface PipelineStep {
  /** Unique step name (used for error tracking). */
  readonly name: string;

  /** The ArticleRunStatus that this step sets on success. */
  readonly successStatus: ArticleRunStatus;

  /**
   * Execute the step. Mutates and returns the context.
   * Throw an error to signal step failure — the pipeline engine handles retries.
   */
  execute(ctx: PipelineContext): Promise<PipelineContext>;
}
