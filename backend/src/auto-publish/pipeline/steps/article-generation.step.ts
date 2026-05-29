import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../../ai/ai.service';
import { ContentLanguage, ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';
import type { ResearchKitResult } from '../../../ai/dto/writing-operations.dto';

@Injectable()
export class ArticleGenerationStep implements PipelineStep {
  readonly name = 'article-generation';
  readonly successStatus = ArticleRunStatus.DRAFTED;
  private readonly logger = new Logger(ArticleGenerationStep.name);

  constructor(private aiService: AIService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.topic) throw new Error('No topic selected');

    this.logger.log(`Generating article for: "${ctx.topic}"`);

    const language = (ctx.contentConfig.language as ContentLanguage) || undefined;
    const maxLength = ctx.contentConfig.maxLength || 800;

    // Build instruction from content config
    const styleMap: Record<string, string> = {
      news_brief: `以快讯体撰写，简明扼要，控制在 ${maxLength} 字以内`,
      standard: `以标准新闻报道体撰写，结构完整，控制在 ${maxLength} 字以内`,
      analysis: `以深度分析体撰写，多角度论述，控制在 ${maxLength} 字以内`,
      listicle: `以列表体撰写，要点清晰，控制在 ${maxLength} 字以内`,
    };
    const styleInstruction =
      styleMap[ctx.contentConfig.style] ||
      `控制在 ${maxLength} 字以内`;

    const customPrompt = ctx.contentConfig.systemPrompt
      ? `${styleInstruction}。${ctx.contentConfig.systemPrompt}`
      : styleInstruction;

    const draft = await this.aiService.generateDraft(ctx.userId, undefined, {
      storyTitle: ctx.topic,
      storyDescription: '',
      storyAngle: '',
      storyTags: [],
      currentTitle: ctx.topic,
      currentSubtitle: '',
      instruction: customPrompt,
      language,
      researchKit: ctx.researchData as ResearchKitResult | undefined,
    });

    // Generate excerpt
    let excerpt = '';
    try {
      excerpt = await this.aiService.generateExcerpt(ctx.userId, undefined, {
        title: draft.title,
        content: draft.content.replace(/<[^>]+>/g, ''),
        maxLength: 200,
        language,
      });
    } catch {
      excerpt = draft.content.replace(/<[^>]+>/g, '').slice(0, 200);
    }

    ctx.draft = {
      title: draft.title,
      subtitle: draft.subtitle,
      content: draft.content,
      excerpt,
      tags: [ctx.topic],
    };

    this.logger.log(`Article drafted: "${draft.title}"`);
    return ctx;
  }
}
