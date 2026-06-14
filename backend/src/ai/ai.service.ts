import {
  Injectable,
  Inject,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as crypto from 'crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';
import type {
  ChatCompletionProvider,
  ChatMessage as ProviderChatMessage,
} from './providers';
import { CHAT_PROVIDER, KimiProvider } from './providers';
import {
  draftResultSchema,
  factCheckResultSchema,
  headlinesSchema,
  researchKitResultSchema,
  reviewReportResultSchema,
  seoResultSchema,
  storySuggestionsSchema,
} from './zod-schemas';
import { StorySuggestion } from './dto/story-suggestion.dto';
import { ContentLanguage, TransactionType, BillingCategory } from '@cms-ng/shared';
import {
  RewriteTextInput,
  ExpandTextInput,
  CondenseTextInput,
  PolishTextInput,
  GenerateHeadlinesInput,
  HeadlineOption,
  GenerateExcerptInput,
  ChatInput,
  ChatMessage,
  GenerateDraftInput,
  DraftResult,
  FactCheckInput,
  FactCheckResult,
  ResearchKitInput,
  ResearchKitResult,
  ResearchKitTimelineEvent,
  ResearchKitPerson,
  ResearchKitDataPoint,
  ResearchKitOpinion,
  ReviewReportInput,
  ReviewReportResult,
  OptimizeSEOInput,
  SEOResult,
  WikipediaEntry,
} from './dto/writing-operations.dto';
import { AIToolsService } from './tools/ai-tools.service';
import { BillingService, InsufficientBalanceException } from '../billing/billing.service';
import { PromptLoader } from './prompts/prompt-loader';
import { AIOperationLogger } from '../common/ai-operation-logger';

/**
 * Module-level safety bounds for the image-fetch path in `uploadToStorage`.
 * - `ALLOWED_IMAGE_TYPES` blocks SSRF amplification where a non-image
 *   `Content-Type` (e.g. `text/html`) would be uploaded to COS and later
 *   trusted by WordPress/the frontend as an image.
 * - `MAX_IMAGE_BYTES` caps the in-memory `arraybuffer` to prevent a malicious
 *   or misconfigured upstream from exhausting backend memory.
 */
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly seedreamApiKey: string;
  private readonly seedreamApiBase: string;
  private readonly seedreamModel: string;
  private readonly searchProvider: string;
  private readonly proxyEnabled: boolean;
  /** HTTP(S) proxy agent — used when Wikipedia/RSS are blocked by DNS pollution. */
  private readonly proxyAgent?: HttpsProxyAgent<string>;
  /** Loads AI prompt templates from disk. See ./prompts/prompt-loader.ts. */
  private readonly prompts = new PromptLoader();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private aiTools: AIToolsService,
    private billingService: BillingService,
    @Inject(CHAT_PROVIDER) private chatProvider: ChatCompletionProvider,
    @Inject(STORAGE_SERVICE) private storageService: StorageService,
    private aiLog: AIOperationLogger,
  ) {
    this.seedreamApiKey = this.config.get<string>('SEEDREAM_API_KEY') || '';
    this.seedreamApiBase =
      this.config.get<string>('SEEDREAM_API_BASE') ||
      'https://ark.cn-beijing.volces.com/api/v3';
    this.seedreamModel =
      this.config.get<string>('SEEDREAM_MODEL') || 'doubao-seedream-5-0-260128';
    this.searchProvider = this.config.get<string>('SEARCH_PROVIDER') || 'tavily';

    // Align with trending-topics: RSS_PROXY_ENABLED must be 'true' for
    // the proxy to be used for Wikipedia outbound calls.  When false (or
    // unset), Wikipedia calls go direct — even if HTTP_PROXY is set.
    this.proxyEnabled = (this.config.get<string>('RSS_PROXY_ENABLED') || '').toLowerCase() === 'true';
    const proxyUrl =
      this.config.get<string>('HTTP_PROXY') ||
      this.config.get<string>('http_proxy');
    if (this.proxyEnabled && proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent(proxyUrl);
    }
  }

  // ===== Billing helpers =====

  /**
   * Check balance before an AI operation. Throws InsufficientBalanceException
   * if billing is enabled and balance is insufficient.
   */
  private async checkAIBalance(userId: string, estimatedCost: number): Promise<void> {
    if (!this.billingService.isEnabled()) return;
    const sufficient = await this.billingService.checkBalance(userId, estimatedCost);
    if (!sufficient) {
      throw new InsufficientBalanceException(estimatedCost, 0);
    }
  }

  /**
   * Deduct billing for a successful LLM operation. Wrapped in try-catch so
   * billing failures NEVER block the AI operation result.
   */
  private async deductLLMBilling(params: {
    userId: string;
    aiOperationId: string;
    tokensUsed: number | undefined;
    articleId?: string;
    description: string;
  }): Promise<void> {
    if (!this.billingService.isEnabled()) return;
    try {
      const config = await this.billingService.getConfig('ai_llm_per_1k_tokens').catch(() => null);
      const unitPrice = config?.unitPrice ?? 0.02;
      const tokens = params.tokensUsed ?? 0;
      const amount = (tokens / 1000) * unitPrice;
      if (amount <= 0) return;

      await this.billingService.deduct({
        userId: params.userId,
        type: TransactionType.AI_LLM,
        category: BillingCategory.AI,
        amount,
        description: params.description,
        articleId: params.articleId,
        aiOperationId: params.aiOperationId,
        quantity: tokens,
        unitPrice,
        idempotencyKey: `ai:${params.aiOperationId}`,
      });
    } catch (error: any) {
      this.logger.warn(
        `Billing deduction failed for AI operation ${params.aiOperationId}: ${error.message}`,
      );
    }
  }

  /**
   * Deduct billing for a successful image generation. Wrapped in try-catch so
   * billing failures NEVER block the AI operation result.
   */
  private async deductImageBilling(params: {
    userId: string;
    aiOperationId: string;
    articleId?: string;
    description: string;
  }): Promise<void> {
    if (!this.billingService.isEnabled()) return;
    try {
      const config = await this.billingService.getConfig('ai_image_per_piece').catch(() => null);
      const unitPrice = config?.unitPrice ?? 0.5;
      if (unitPrice <= 0) return;

      await this.billingService.deduct({
        userId: params.userId,
        type: TransactionType.AI_IMAGE,
        category: BillingCategory.AI,
        amount: unitPrice,
        description: params.description,
        articleId: params.articleId,
        aiOperationId: params.aiOperationId,
        quantity: 1,
        unitPrice,
        idempotencyKey: `image:${params.aiOperationId}`,
      });
    } catch (error: any) {
      this.logger.warn(
        `Billing deduction failed for image operation ${params.aiOperationId}: ${error.message}`,
      );
    }
  }

  private getLanguageInstruction(language?: ContentLanguage): string {
    const map: Record<ContentLanguage, string> = {
      [ContentLanguage.SIMPLIFIED_CHINESE]:
        '请用简体中文回答，采用中国内地新闻风格：客观、严谨，使用标准现代汉语词汇',
      [ContentLanguage.TRADITIONAL_CHINESE_HK]:
        '请用繁体中文回答，采用香港本地新闻书面语风格：专业、中立，使用香港常用词汇',
      [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]:
        '请用香港新闻书面语为主、粤语口语自然点缀的风格回答。保持新闻的专业性和严谨性，在适当位置使用粤语特有词汇（如「嘅」「咗」「喺」「冇」等）增强亲和力，但避免过度口语化',
      [ContentLanguage.ENGLISH]:
        'Please answer in English, using British/American journalistic style: objective, concise, professional',
    };
    return map[language ?? ContentLanguage.TRADITIONAL_CHINESE_HK];
  }

  async generateStorySuggestions(
    userId: string,
    userProfile: { name: string; expertise: string[]; department?: string },
    recentTopics: string[] = [],
    language?: ContentLanguage,
  ): Promise<StorySuggestion[]> {
    const prompt = this.buildSuggestionPrompt(userProfile, recentTopics);

    // Pre-check balance (estimate ~2000 tokens for story suggestions)
    await this.checkAIBalance(userId, (2000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      agentType: 'STORY',
      action: 'generate_story_suggestions',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻编辑，擅长为记者发掘有价值的选题。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 对象格式，包含 suggestions 字段，不要包含任何其他文字。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        });

        let parsed: z.infer<typeof storySuggestionsSchema>;
        try {
          parsed = storySuggestionsSchema.parse(JSON.parse(response.content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (generateStorySuggestions): ${msg}; raw[:200]=${response.content.slice(0, 200)}`,
          );
          throw err;
        }
        const suggestions: StorySuggestion[] = Array.isArray(parsed)
          ? parsed
          : parsed.suggestions || [];

        return { result: suggestions.slice(0, 5), tokensUsed: response.usage?.totalTokens };
      },
      fallback: this.getFallbackSuggestions(userProfile),
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          description: 'AI 选题建议',
        }),
    });
  }

  // ===== 文本改写 =====
  async rewriteText(
    userId: string,
    articleId: string | undefined,
    input: RewriteTextInput,
    language?: ContentLanguage,
  ): Promise<string> {
    const styleMap: Record<string, string> = {
      serious: '严肃新闻风格，客观冷静',
      casual: '轻快报道风格，通俗易懂',
      academic: '学术分析风格，严谨深入',
      concise: '简洁凝练风格，去除冗余',
    };
    const styleDesc = input.style
      ? styleMap[input.style] || input.style
      : '保持原意但改善表达';
    const instructionSuffix = input.instruction
      ? '；额外要求：' + input.instruction
      : '';

    const prompt = this.prompts.render('writing', 'rewrite', {
      style: styleDesc,
      instruction: instructionSuffix,
      text: input.text,
    });

    return this.callTextAI(
      userId,
      articleId,
      'rewrite_text',
      prompt,
      input.text,
      language,
    );
  }

  // ===== 文本扩写 =====
  async expandText(
    userId: string,
    articleId: string | undefined,
    input: ExpandTextInput,
  ): Promise<string> {
    const language = input.language;
    const prompt = this.prompts.render('writing', 'expand', {
      instruction: input.instruction ? '额外要求：' + input.instruction : '',
      text: input.text,
    });

    return this.callTextAI(
      userId,
      articleId,
      'expand_text',
      prompt,
      input.text,
      language,
    );
  }

  // ===== 文本精简 =====
  async condenseText(
    userId: string,
    articleId: string | undefined,
    input: CondenseTextInput,
  ): Promise<string> {
    const language = input.language;
    const lengthHint = input.maxLength
      ? `控制在 ${input.maxLength} 字以内。`
      : '去除冗余，保留核心信息。';
    const prompt = this.prompts.render('writing', 'condense', {
      lengthHint,
      text: input.text,
    });

    return this.callTextAI(
      userId,
      articleId,
      'condense_text',
      prompt,
      input.text,
      language,
    );
  }

  // ===== 文本润色 =====
  async polishText(
    userId: string,
    articleId: string | undefined,
    input: PolishTextInput,
  ): Promise<string> {
    const language = input.language;
    const prompt = this.prompts.render('writing', 'polish', {
      text: input.text,
    });

    return this.callTextAI(
      userId,
      articleId,
      'polish_text',
      prompt,
      input.text,
      language,
    );
  }

  // ===== 标题生成 =====
  async generateHeadlines(
    userId: string,
    articleId: string | undefined,
    input: GenerateHeadlinesInput,
  ): Promise<HeadlineOption[]> {
    const language = input.language;

    const prompt = `请根据以下文章内容生成 ${input.count ?? 5} 个标题选项。

文章标题：${input.title}
${input.subtitle ? '副标题：' + input.subtitle : ''}
正文前500字：
${input.content.slice(0, 500)}

要求：
1. 每个标题都要像编辑拟的——有态度、有锐度、不套模板
2. 提供不同风格的标题（如：直击核心的硬标题、制造悬念的软标题、用数字破题的列表标题、抛反问的互动型标题）
3. 每个标题附带简短的理由说明
4. 避免「XXX：深度解读」「如何看待XXX」等 AI 模板标题

请输出 JSON 数组格式：
[
  { "title": "标题", "style": "风格标签", "reasoning": "推荐理由" }
]`;

    // Pre-check balance (estimate ~2000 tokens for headline generation)
    await this.checkAIBalance(userId, (2000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'generate_headlines',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一名有经验的新闻版面编辑，擅长起标题——不是 SEO 工具，是真正能抓人的标题。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          response_format: { type: 'json_object' },
        });

        let parsed: z.infer<typeof headlinesSchema>;
        try {
          parsed = headlinesSchema.parse(JSON.parse(response.content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (generateHeadlines): ${msg}; raw[:200]=${response.content.slice(0, 200)}`,
          );
          throw err;
        }
        const headlines: HeadlineOption[] = Array.isArray(parsed)
          ? parsed
          : (parsed as { headlines?: HeadlineOption[] }).headlines ||
            (parsed as { titles?: HeadlineOption[] }).titles ||
            [];

        return { result: headlines.slice(0, input.count ?? 5), tokensUsed: response.usage?.totalTokens };
      },
      fallback: this.getFallbackHeadlines(input.title),
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI 标题生成',
        }),
    });
  }

  // ===== 摘要生成 =====
  async generateExcerpt(
    userId: string,
    articleId: string | undefined,
    input: GenerateExcerptInput,
  ): Promise<string> {
    const language = input.language;

    const maxLen = input.maxLength ?? 200;
    const prompt = `请为以下文章写一段摘要，控制在 ${maxLen} 字以内。

文章标题：${input.title}
正文：
${input.content.slice(0, 2000)}

摘要要直接点出文章最核心的事实或冲突，不要写成「本文介绍了…」这种教科书式开头。直接输出摘要。`;

    // Pre-check balance (estimate ~1500 tokens for excerpt generation)
    await this.checkAIBalance(userId, (1500 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'generate_excerpt',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一名新闻记者，擅长用一两句话把事件说清楚。${this.getLanguageInstruction(language)}。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
        });

        return { result: response.content.trim(), tokensUsed: response.usage?.totalTokens };
      },
      fallback: input.content.slice(0, maxLen),
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI 摘要生成',
        }),
    });
  }

  // ===== 对话助手 =====
  async chatWithAI(
    userId: string,
    articleId: string | undefined,
    input: ChatInput,
  ): Promise<string> {
    const language = input.language;

    const contextMessages: ChatMessage[] = [];

    if (input.articleContext) {
      const ctx = input.articleContext;
      contextMessages.push({
        role: 'system',
        content: `当前文章上下文：
标题：${ctx.title}
${ctx.subtitle ? '副标题：' + ctx.subtitle : ''}
正文前800字：${ctx.content.slice(0, 800)}`,
      });
    }

    const messages: ProviderChatMessage[] = [
      {
        role: 'system',
        content:
          `你是一名有经验的新闻编辑，帮同事改稿。说话直接、有用、不绕弯子，就像在编辑部茶水间聊天。${this.getLanguageInstruction(language)}。

沟通原则：
- 像同事给建议，不像 AI 写模板
- 不要说「你的文章写得很好，但是…」这种废话开头
- 直接指出问题在哪，给出具体修改方向
- 如果有好例子，直接举出来
- 短回答比长回答好`,
      },
      ...contextMessages,
      ...input.messages,
    ];

    // Pre-check balance (estimate ~2000 tokens for chat)
    await this.checkAIBalance(userId, (2000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'chat_assistant',
      prompt: JSON.stringify(messages),
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages,
          temperature: 0.7,
        });

        return { result: response.content.trim(), tokensUsed: response.usage?.totalTokens };
      },
      fallback: 'AI 助手暂时无法回答，请稍后重试。',
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI 对话助手',
        }),
    });
  }

  // ===== 初稿生成 =====
  async generateDraft(
    userId: string,
    articleId: string | undefined,
    input: GenerateDraftInput,
  ): Promise<DraftResult> {
    const language = input.language;

    const tagsStr = input.storyTags.join(', ') || '未指定';

    // Build research kit section if available
    let researchKitSection = '';
    if (input.researchKit) {
      const rk = input.researchKit;
      const lines: string[] = [];

      if (rk.timeline?.length) {
        lines.push('【事件時間線】');
        rk.timeline.forEach((e) => {
          lines.push(
            `- ${e.date}：${e.event}${e.source ? `（來源：${e.source}）` : ''}`,
          );
        });
        lines.push('');
      }

      if (rk.people?.length) {
        lines.push('【關鍵人物】');
        rk.people.forEach((p) => {
          lines.push(
            `- ${p.name}（${p.role}）${p.background ? `：${p.background}` : ''}`,
          );
        });
        lines.push('');
      }

      if (rk.data?.length) {
        lines.push('【核心數據】');
        rk.data.forEach((d) => {
          lines.push(
            `- ${d.label}：${d.value}${d.source ? `（來源：${d.source}）` : ''}`,
          );
        });
        lines.push('');
      }

      if (rk.opinions?.length) {
        lines.push('【各方觀點】');
        rk.opinions.forEach((o) => {
          lines.push(
            `- ${o.source}${o.stance ? `（${o.stance}）` : ''}：${o.viewpoint}`,
          );
        });
        lines.push('');
      }

      if (rk.wikipedia?.length) {
        lines.push('【Wikipedia 參考資料】');
        rk.wikipedia.forEach((w) => {
          lines.push(
            `- ${w.title}（${w.language === 'zh' ? '中文' : '英文'}）：${w.extract}`,
          );
          lines.push(`  來源：${w.url}`);
        });
        lines.push('');
      }

      if (lines.length) {
        researchKitSection = lines.join('\n');
      }
    }

    const prompt = `请根据以下选题信息，写一篇新闻稿。记住：你是一名记者，不是 AI。

选题标题：${input.storyTitle}
${input.storyDescription ? '选题描述：' + input.storyDescription : ''}
${input.storyAngle ? '建议角度：' + input.storyAngle : ''}
相关标签：${tagsStr}
${input.currentTitle ? '当前稿件标题（可参考）：' + input.currentTitle : ''}
${input.currentSubtitle ? '当前副标题（可参考）：' + input.currentSubtitle : ''}
${input.instruction ? '额外要求：' + input.instruction : ''}
${researchKitSection ? '\n【已搜集背景資料】\n\n' + researchKitSection : ''}

写作要点：
- 标题要像一个编辑拟的，不是 AI 生成的。可以直接抛观点、制造反差或提炼最尖锐的细节
- 导语别绕弯子，第一句话就把最有新闻价值的信息端出来
- 行文节奏要像真人：有的段落两三百字铺陈细节，有的段落一句话收住制造停顿感
- 背景资料里的数据、引语、时间线是素材，要穿插进叙述里，不是用「据了解」「资料显示」生硬地丢上去
- 观点和事实要分明，但不需要每句话都标「谁说了什么」
- 结尾要有收束感，可以是一个反问、一个展望、一个数据，或者干脆一段干净利落的陈述
${researchKitSection ? '\n注意：背景资料中已包含多方信息，请在行文中自然引用，不要整段搬运。\n' : ''}
格式要求：
1. 正文使用 HTML 格式，仅使用以下标签：p, h2, h3, ul, ol, li, blockquote, strong, em
2. 只输出 JSON，不要解释文字

输出 JSON：
{
  "title": "稿件标题",
  "subtitle": "副标题",
  "content": "<p>导语段落...</p><h2>小标题</h2><p>正文...</p>"
}`;

    // Pre-check balance (estimate ~4000 tokens for draft generation)
    await this.checkAIBalance(userId, (4000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'generate_draft',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一名跑线多年、有独立判断力的新闻记者。你的稿子读起来要像人写的——没有 AI 味。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。\n\n写作原则：\n- 能用一个词说清的，不要用一句话\n- 段落长短不一，长段落讲细节，短段落制造冲击力\n- 导语直接抛出最有新闻价值的事实，避免套话开头\n- 适当让读者感受到记者的判断和态度，而非中立的复读机\n- 禁止使用 AI 高频词汇和句式：\「值得注意的是」「由此可见」「毋庸置疑」「随着…的发展」「综上所述」「让我们」\n- 禁止每段用相同的开头句式，禁止过度使用「此外」「与此同时」连接段落`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        });

        let parsed: z.infer<typeof draftResultSchema>;
        try {
          parsed = draftResultSchema.parse(JSON.parse(response.content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (generateDraft): ${msg}; raw[:200]=${response.content.slice(0, 200)}`,
          );
          throw err;
        }
        const result: DraftResult = {
          title: parsed.title || input.currentTitle || input.storyTitle,
          subtitle: parsed.subtitle ?? undefined,
          content: this.sanitizeDraftHTML(parsed.content || ''),
        };

        return { result, tokensUsed: response.usage?.totalTokens };
      },
      fallback: {
        title: input.currentTitle || input.storyTitle,
        subtitle: '',
        content: '<p>AI 初稿生成暫時不可用，請稍後重試。</p>',
      },
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI 初稿生成',
        }),
    });
  }

  private sanitizeDraftHTML(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(
        /<(?!\/?(?:p|h2|h3|ul|ol|li|blockquote|strong|em|br)\b)[^>]*>/gi,
        '',
      );
  }

  // ===== 事实核查 =====
  async factCheck(
    userId: string,
    articleId: string | undefined,
    input: FactCheckInput,
  ): Promise<FactCheckResult> {
    const language = input.language;

    const prompt = `请对以下新闻稿件进行事实核查分析。

稿件标题：${input.title}
${input.subtitle ? '副标题：' + input.subtitle : ''}
正文内容：
${input.content.replace(/<[^>]+>/g, '').slice(0, 3000)}

请从以下几个方面进行分析：
1. 事实性陈述标注：找出文中涉及的人名、地名、时间、数据等事实性陈述
2. 一致性检查：检查全文内部是否存在逻辑矛盾（如前面说"10人"后面说"12人"）
3. 来源建议：对每一处关键事实，建议最可靠的核实来源
4. 风险提示：标出可能存在法律风险、隐私风险或表述不当的地方
5. 争议标注：对有争议或多方不同说法的信息进行标注

请输出以下 JSON 格式：
{
  "score": 85,
  "summary": "总体评估摘要",
  "findings": [
    {
      "type": "fact",
      "text": "原文片段",
      "message": "AI 提示信息",
      "severity": "info"
    }
  ]
}

severity 取值说明：
- info：提示性信息，无需修改
- warning：需要注意，建议核实
- critical：必须修改的问题

type 取值说明：
- fact：事实性陈述
- inconsistency：内部不一致
- dispute：存在争议
- source_needed：需要补充来源
- risk：风险提示`;

    // Pre-check balance (estimate ~3000 tokens for fact check)
    await this.checkAIBalance(userId, (3000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'fact_check',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻事实核查专家，擅长识别稿件中的事实性问题和风险。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        });

        let parsed: z.infer<typeof factCheckResultSchema>;
        try {
          parsed = factCheckResultSchema.parse(JSON.parse(response.content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (factCheck): ${msg}; raw[:200]=${response.content.slice(0, 200)}`,
          );
          throw err;
        }
        const result: FactCheckResult = {
          score: Math.min(100, Math.max(0, parsed.score ?? 50)),
          summary: parsed.summary || '已完成事实核查分析',
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
        };

        return { result, tokensUsed: response.usage?.totalTokens };
      },
      fallback: {
        score: 0,
        summary: '事实核查服务暂时不可用，请稍后重试',
        findings: [],
      },
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI 事实核查',
        }),
    });
  }

  // ===== Wikipedia 资料增强 =====

  /**
   * Editorial-style Chinese titles (e.g. "消费级机器人大爆发，我在今年看到的产业新变化")
   * return zero relevant Wikipedia hits when used verbatim. Extract the core noun-phrase
   * so that the Wikipedia search API returns genuinely related articles.
   *
   * Strategy: strip known editorial filler phrases, then split on sentence-level
   * punctuation, exclude interrogative and numeric-heavy segments, and pick the
   * longest remaining candidate — the most likely encyclopaedia-worthy topic.
   */
  private extractWikipediaKeyword(title: string): string {
    // Phrases commonly found in Chinese editorial/feature-article titles —
    // they describe trends or viewpoints, not encyclopedia-worthy topics.
    const FILLER_PHRASES = [
      '大爆发', '冷思考', '深度解读', '全面解析', '深度分析',
      '一文读懂', '一文看懂', '全解读', '大揭秘', '全解析',
      '产业新变化', '新趋势', '大变局', '新格局', '新风口',
      '新机遇', '新挑战', '新方向', '新突破', '新赛道',
      '我在今年看到的', '今年的', '当下的', '当前的', '如今的',
      '为什么说', '如何看待', '怎么看待', '怎么看',
      '的背后', '背后', '值得关注', '值得关注的是',
      '未来将', '未来会', '未来可能',
    ];

    let text = title;
    for (const filler of FILLER_PHRASES) {
      text = text.replaceAll(filler, '');
    }

    // Split on sentence-level punctuation (but NOT ？? — keep them
    // attached so we can detect and exclude interrogative segments).
    const candidates = text
      .split(/[，,；;。：:！!\-—]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3 && !/^\d+$/.test(s))
      // Exclude interrogative segments ("离走进家庭还有多远？") —
      // they are editorial hooks, not encyclopedia-searchable topics.
      .filter((s) => !/[？?]/.test(s))
      // Deprioritise numeric-heavy editorial hooks like "从2万到3万例" —
      // they make poor Wikipedia queries.
      .sort((a, b) => {
        const numRatio = (s: string) =>
          ((s.match(/\d/g) || []).length) / s.length;
        return numRatio(a) - numRatio(b);
      });

    // Pick the longest low-numeric candidate (most likely to be the
    // encyclopaedia-worthy topic noun-phrase), or fall back to original title.
    if (candidates.length === 0) return title;
    return candidates.reduce((best, c) => (c.length > best.length ? c : best));
  }

  private async searchWikipedia(
    title: string,
  ): Promise<{ entries: WikipediaEntry[]; error?: string }> {
    const entries: WikipediaEntry[] = [];
    const errors: string[] = [];
    const seenTitles = new Set<string>();
    const zhKeyword = this.extractWikipediaKeyword(title);

    const searchAndFetch = async (
      lang: 'zh' | 'en',
      query: string,
    ): Promise<WikipediaEntry | null> => {
      try {
        // Step 1: Search for matching article titles
        const searchRes = await axios.get(
          `https://${lang}.wikipedia.org/w/api.php`,
          {
            params: {
              action: 'query',
              list: 'search',
              srsearch: query,
              srlimit: 5,
              format: 'json',
              origin: '*',
            },
            headers: {
              'User-Agent': 'CMS-NG/1.0 (research@example.com)',
            },
            timeout: 10000,
            ...(this.proxyAgent ? { httpsAgent: this.proxyAgent } : {}),
          },
        );

        const searchResults = searchRes.data?.query?.search || [];
        if (!searchResults.length) return null;

        // Try each result and return the first relevant one
        for (const result of searchResults) {
          const candidateTitle = result.title;
          if (seenTitles.has(candidateTitle)) continue;

          const encodedTitle = encodeURIComponent(candidateTitle);
          const summaryRes = await axios.get(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`,
            {
              headers: {
                'User-Agent': 'CMS-NG/1.0 (research@example.com)',
              },
              timeout: 10000,
              ...(this.proxyAgent ? { httpsAgent: this.proxyAgent } : {}),
            },
          );

          const data = summaryRes.data;
          if (data.type === 'standard' || data.type === 'disambiguation') {
            const extract = data.extract || '';
            const pageTitle = data.title || candidateTitle;
            const url =
              data.content_urls?.desktop?.page ||
              `https://${lang}.wikipedia.org/wiki/${encodedTitle}`;
            if (extract && this.isWikipediaRelevant(query, pageTitle, extract)) {
              seenTitles.add(pageTitle);
              return { title: pageTitle, extract, url, language: lang };
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // 404 from a Wikipedia API endpoint is normal (no article) — don't log.
        if (
          err &&
          typeof err === 'object' &&
          'response' in err &&
          (err as any).response?.status !== 404
        ) {
          // Only warn; the caller can check `error` for diagnostics.
        } else if (
          !(err && typeof err === 'object' && 'response' in err)
        ) {
          // Non-HTTP error (network timeout, DNS, etc.)
          this.logger.warn(
            `Wikipedia ${lang} search failed for "${query}": ${msg}`,
          );
        }
        // Collect every error except 404 so the caller can make a good
        // wikipediaStatus decision.
        if (
          !(err && typeof err === 'object' && 'response' in err && (err as any).response?.status === 404)
        ) {
          errors.push(`[${lang}] ${msg}`);
        }
      }
      return null;
    };

    // Use the extracted keyword (e.g. "消费级机器人") instead of the full
    // editorial title — Wikipedia search returns relevant articles for focused
    // noun-phrases, not for long opinion-style titles.
    // Run zh and en searches in parallel — they're independent and the API
    // calls are the dominant cost of this step. The en branch's keyword→title
    // fallback remains sequential within its own branch to preserve the
    // existing fallback semantics.
    const [zhEntry, enFirst] = await Promise.all([
      searchAndFetch('zh', zhKeyword),
      searchAndFetch('en', zhKeyword),
    ]);
    if (zhEntry) entries.push(zhEntry);

    let enEntry: WikipediaEntry | null = enFirst;
    if (!enEntry && zhKeyword !== title) {
      enEntry = await searchAndFetch('en', title);
    }
    if (enEntry && !seenTitles.has(enEntry.title)) entries.push(enEntry);

    return {
      entries,
      ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
    };
  }

  /**
   * Check if a Wikipedia result is relevant to the original query.
   * Uses a simple keyword overlap check to avoid returning unrelated articles.
   */
  private isWikipediaRelevant(
    query: string,
    title: string,
    extract: string,
  ): boolean {
    const combinedText = (title + ' ' + extract).toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact query or title match
    if (combinedText.includes(queryLower)) return true;
    if (queryLower.includes(title.toLowerCase())) return true;

    // For Chinese: check each 2-character segment from the query
    const segments: string[] = [];
    for (let i = 0; i < query.length - 1; i++) {
      segments.push(query.slice(i, i + 2).toLowerCase());
    }

    // Require at least one 2-char segment to appear in the result
    // (avoids single-character false matches)
    return segments.some((seg) => combinedText.includes(seg));
  }

  // ===== 联网搜索（provider-agnostic） =====
  /**
   * Search for latest news via the active provider's tool calling.
   * - Kimi provider + SEARCH_PROVIDER=kimi → uses built-in $web_search
   * - All other cases → uses Tavily via standard function calling
   */
  private async performSearch(
    query: string,
    language?: ContentLanguage,
  ): Promise<string> {
    const searchMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `你是一个新闻搜索助手。你的唯一任务是使用联网搜索工具查找最新新闻。请搜索用户提供的查询词，并返回搜索到的最新信息摘要。${this.getLanguageInstruction(language)}。`,
      },
      {
        role: 'user',
        content: `请搜索"${query}"的最新新闻和动态，返回最近6个月内的重要事件摘要。`,
      },
    ];

    // Kimi built-in search (only when provider is Kimi and SEARCH_PROVIDER=kimi)
    if (
      this.searchProvider === 'kimi' &&
      this.chatProvider instanceof KimiProvider
    ) {
      const response = await this.chatProvider.chatCompletionWithBuiltinSearch({
        messages: searchMessages,
        temperature: 0.3,
      });
      return response.content;
    }

    // Default: Tavily via standard function calling (works with any provider)
    const tavilyTool = this.aiTools.getToolDefinition('tavily_search');
    if (!tavilyTool) {
      this.logger.warn('Tavily search tool not available');
      return '';
    }

    const response = await this.chatProvider.chatCompletionWithTools(
      { messages: searchMessages, temperature: 0.3, tools: [tavilyTool] },
      (name, args) => this.aiTools.executeTool(name, args),
    );
    return response.content;
  }

  // ===== 智能资料搜集 =====
  async generateResearchKit(
    userId: string,
    input: ResearchKitInput,
  ): Promise<ResearchKitResult> {
    const language = input.language;

    // Pre-check balance BEFORE any expensive operations (estimate ~3000 tokens)
    await this.checkAIBalance(userId, (3000 / 1000) * 0.02);

    // Step 1 + Step 2 (parallel): Wikipedia + Tavily/Kimi web search.
    // Both are independent and were previously sequential. Running them in
    // parallel cuts the network-bound portion of the request roughly in half
    // (was ~30-50s for Wikipedia + ~30s for Tavily; now bounded by the slower
    // of the two). Both fail-soft independently — a Wikipedia outage no
    // longer blocks the web search and vice versa.
    const [wikiResult, searchSummary] = await Promise.all([
      this.searchWikipedia(input.storyTitle).catch(
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Wikipedia search failed for "${input.storyTitle}": ${msg}`,
          );
          return { entries: [] as WikipediaEntry[], error: msg };
        },
      ),
      this.performSearch(input.storyTitle, language).catch(() => ''),
    ]);
    const wikipediaEntries = wikiResult.entries;
    const wikipediaStatus: ResearchKitResult['wikipediaStatus'] = wikiResult.error
      ? 'api_error'
      : wikipediaEntries.length > 0
        ? 'ok'
        : 'no_results';

    const tagsStr = input.storyTags.join(', ') || '未指定';

    // 动态计算时效性要求的时间范围
    const now = new Date();
    const currentYear = now.getFullYear();
    const prevYear = currentYear - 1;
    const currentDateStr = now.toISOString().split('T')[0];

    const searchResults = searchSummary
      ? `【联网搜索最新資訊】\n${searchSummary}\n`
      : '';

    // Build Wikipedia context section
    let wikipediaSection = '';
    if (wikipediaEntries.length > 0) {
      const lines: string[] = ['【Wikipedia 參考資料】'];
      wikipediaEntries.forEach((entry) => {
        lines.push(
          `- ${entry.title}（${entry.language === 'zh' ? '中文' : '英文'}）：${entry.extract}`,
        );
        lines.push(`  來源：${entry.url}`);
      });
      lines.push('');
      wikipediaSection = lines.join('\n');
    }

    const prompt = `请为以下新闻选题搜集并整理背景资料，生成结构化资料包。

选题标题：${input.storyTitle}
${input.storyDescription ? '选题描述：' + input.storyDescription : ''}
${input.storyAngle ? '建议角度：' + input.storyAngle : ''}
相关标签：${tagsStr}

${searchResults}${wikipediaSection}请基于上述搜索結果和 Wikipedia 資料整理结构化资料包。

请从以下几个方面整理：
1. 事件时间线：按时间顺序列出关键事件节点
2. 关键人物：涉及的主要人物及其背景、立场
3. 核心数据：相关统计数据、调查结果
4. 各方观点：不同立场的观点和评论

请输出以下 JSON 格式：
{
  "timeline": [
    { "date": "YYYY-MM-DD", "event": "事件描述", "source": "来源" }
  ],
  "people": [
    { "name": "姓名", "role": "角色", "background": "背景简介" }
  ],
  "data": [
    { "label": "数据标签", "value": "数据值", "source": "数据来源" }
  ],
  "opinions": [
    { "source": "观点来源", "viewpoint": "观点内容", "stance": "立场" }
  ]
}

注意：
- ${this.getLanguageInstruction(language)}
- 优先使用搜索结果中的最新信息
- 每个信息标注来源
- 如果某类信息无法获取，返回空数组
- ${wikipediaSection ? '充分利用 Wikipedia 参考资料\n- ' : ''}不要编造`;

    return this.aiLog.run({
      userId,
      agentType: 'RESEARCH',
      action: 'generate_research_kit',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        // Step 3: 基于搜索结果整理资料包
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `今天是 ${currentDateStr}。你是一位资深新闻研究员，擅长整理背景资料。${this.getLanguageInstruction(language)}。\n\n【极其重要】你的回复必须且只能是一个有效的 JSON 对象，不要包含任何其他文字、解释、Markdown 代码块标记（如 \`\`\`json）。直接输出原始 JSON 字符串。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
        });

        let content = response.content;
        // 去除可能的 Markdown JSON 代码块包裹
        content = content
          .replace(/^```json\s*/, '')
          .replace(/\s*```$/, '')
          .trim();
        let parsed: z.infer<typeof researchKitResultSchema>;
        try {
          parsed = researchKitResultSchema.parse(JSON.parse(content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (generateResearchKit): ${msg}; raw[:200]=${content.slice(0, 200)}`,
          );
          throw err;
        }
        // After Zod validation, parsed entries have optional fields with passthrough
// unknowns. Cast back to the ResearchKitResult shape — the consumer code reads
// the same fields and the downstream pipeline gracefully handles missing
// optional properties.
        const result: ResearchKitResult = {
          timeline: Array.isArray(parsed.timeline) ? (parsed.timeline as ResearchKitTimelineEvent[]) : [],
          people: Array.isArray(parsed.people) ? (parsed.people as ResearchKitPerson[]) : [],
          data: Array.isArray(parsed.data) ? (parsed.data as ResearchKitDataPoint[]) : [],
          opinions: Array.isArray(parsed.opinions) ? (parsed.opinions as ResearchKitOpinion[]) : [],
          wikipedia: wikipediaEntries.length > 0 ? wikipediaEntries : undefined,
          wikipediaStatus,
        };

        return { result, tokensUsed: response.usage?.totalTokens };
      },
      fallback: {
        timeline: [],
        people: [],
        data: [],
        opinions: [],
        wikipedia: wikipediaEntries.length > 0 ? wikipediaEntries : undefined,
        wikipediaStatus,
      },
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          description: 'AI 资料搜集',
        }),
    });
  }

  // ===== AI 预审报告 =====
  async generateReviewReport(
    userId: string,
    articleId: string | undefined,
    input: ReviewReportInput,
  ): Promise<ReviewReportResult> {
    const language = input.language;

    const prompt = `请对以下新闻稿件进行综合性质量预审评估。

稿件标题：${input.title}
${input.subtitle ? '副标题：' + input.subtitle : ''}
正文内容：
${input.content.replace(/<[^>]+>/g, '').slice(0, 2000)}

请从以下五个维度进行评估，每个维度给出 0-100 的分数和简要评语：

1. **结构完整性**：文章结构是否清晰，段落衔接是否流畅，是否具备完整的新闻要素（导语、主体、结尾）
2. **语言表达**：用词是否准确，语句是否通顺，是否存在语法错误或歧义表述
3. **可读性**：段落长度是否适中，信息密度是否合理，读者阅读体验如何
4. **新闻价值**：选题角度是否新颖，信息是否有时效性，是否具有公共关注度
5. **专业性**：术语使用是否恰当，数据引用是否规范，行业背景是否准确

请输出以下 JSON 格式：
{
  "overallScore": 78,
  "summary": "总体评估摘要，100字以内",
  "dimensions": [
    {
      "name": "结构完整性",
      "score": 80,
      "maxScore": 100,
      "comment": "该维度评语"
    }
  ],
  "suggestions": [
    {
      "dimension": "结构完整性",
      "priority": "high",
      "suggestion": "具体改进建议"
    }
  ]
}

priority 取值说明：
- high：重要问题，建议优先修改
- medium：一般问题，建议考虑改进
- low：轻微问题，可酌情优化

注意：${this.getLanguageInstruction(language)}，给出建设性、具体可执行的改进建议。`;

    // Pre-check balance (estimate ~3000 tokens for review report)
    await this.checkAIBalance(userId, (3000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'review_report',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一名有经验的新闻总编，每天要看几十篇稿子、给记者反馈。你的评估报告要像真实的编辑批注——直击要害、不客套。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          response_format: { type: 'json_object' },
        });

        let parsed: z.infer<typeof reviewReportResultSchema>;
        try {
          parsed = reviewReportResultSchema.parse(JSON.parse(response.content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (generateReviewReport): ${msg}; raw[:200]=${response.content.slice(0, 200)}`,
          );
          throw err;
        }
        const result: ReviewReportResult = {
          overallScore: Math.min(100, Math.max(0, parsed.overallScore ?? 50)),
          summary: parsed.summary || '已完成稿件质量预审评估',
          dimensions: Array.isArray(parsed.dimensions)
            ? parsed.dimensions.map((d: any) => ({
                name: d.name || '未知维度',
                score: Math.min(100, Math.max(0, d.score ?? 50)),
                maxScore: d.maxScore || 100,
                comment: d.comment || '',
              }))
            : [],
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions.map((s: any) => ({
                dimension: s.dimension || '综合',
                priority: ['high', 'medium', 'low'].includes(s.priority)
                  ? s.priority
                  : 'medium',
                suggestion: s.suggestion || '',
              }))
            : [],
        };

        return { result, tokensUsed: response.usage?.totalTokens };
      },
      fallback: {
        overallScore: 0,
        summary: '预审报告生成失败，请稍后重试',
        dimensions: [],
        suggestions: [],
      },
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI 预审报告',
        }),
    });
  }

  async optimizeSEO(
    userId: string,
    articleId: string | undefined,
    input: OptimizeSEOInput,
  ): Promise<SEOResult> {
    const language = input.language;

    const seoContext = language === ContentLanguage.SIMPLIFIED_CHINESE
      ? '针对中国内地媒体场景，关键词需考虑简体中文搜索习惯'
      : language === ContentLanguage.ENGLISH
      ? '针对英语媒体场景，关键词需考虑英语搜索习惯'
      : '针对LC 传媒媒体场景，关键词需考虑繁简体中文搜索习惯';

    const prompt = `你是一位新闻媒体的 SEO 专家，每天琢磨标题怎么起才有流量。分析下面这篇稿子，给出优化建议。${seoContext}。\n\n稿件标题：${input.title}\n${input.subtitle ? '副标题：' + input.subtitle : ''}\n正文内容：\n${input.content.replace(/<[^>]+>/g, '').slice(0, 3000)}\n\n请输出以下 JSON 格式：\n{\n  "overallScore": 78,\n  "readabilityScore": 82,\n  "optimizedTitle": [\n    {\n      "title": "优化后的标题1",\n      "reasoning": "推荐理由"\n    }\n  ],\n  "metaDescription": "适合搜索引擎摘要的元描述，120字以内",\n  "keywords": [\n    {\n      "keyword": "核心关键词",\n      "searchVolume": "high"\n    }\n  ],\n  "suggestions": [\n    {\n      "category": "标题优化",\n      "priority": "high",\n      "suggestion": "具体优化建议"\n    }\n  ]\n}\n\n字段说明：\n- overallScore: 综合SEO评分（0-100）\n- readabilityScore: 可读性评分（0-100）\n- optimizedTitle: 优化后的标题选项，1-3个，每个包含标题和推荐理由\n- metaDescription: 建议的元描述，适合搜索引擎摘要，120字以内\n- keywords: 提取的核心关键词列表，每个包含关键词和搜索热度评估（high/medium/low）\n- suggestions: 具体优化建议列表，按优先级分类（high/medium/low）\n\npriority 取值说明：\n- high：重要问题，建议优先修改\n- medium：一般问题，建议考虑改进\n- low：轻微问题，可酌情优化\n\n注意：${this.getLanguageInstruction(language)}。optimizedTitle 中的标题应当多样化，使用不同角度或风格。keywords 应当包含目标读者常用的搜索词。`;

    // Pre-check balance (estimate ~3000 tokens for SEO optimization)
    await this.checkAIBalance(userId, (3000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action: 'optimize_seo',
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一位新闻媒体的 SEO 运营专家，深知标题和关键词如何影响搜索流量。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          response_format: { type: 'json_object' },
        });

        let parsed: z.infer<typeof seoResultSchema>;
        try {
          parsed = seoResultSchema.parse(JSON.parse(response.content));
        } catch (err) {
          const msg = err instanceof z.ZodError
            ? `zod issues: ${err.issues.slice(0, 3).map(i => i.path.join('.') + ': ' + i.message).join('; ')}`
            : (err as Error).message;
          this.logger.warn(
            `AI JSON schema validation failed (optimizeSEO): ${msg}; raw[:200]=${response.content.slice(0, 200)}`,
          );
          throw err;
        }

        const result: SEOResult = {
          overallScore: Math.min(100, Math.max(0, parsed.overallScore ?? 50)),
          readabilityScore: Math.min(
            100,
            Math.max(0, parsed.readabilityScore ?? 50),
          ),
          optimizedTitle: Array.isArray(parsed.optimizedTitle)
            ? parsed.optimizedTitle
                .map((t: any) => ({
                  title: t.title || '',
                  reasoning: t.reasoning || '',
                }))
                .filter((t: any) => t.title)
            : [],
          metaDescription: parsed.metaDescription || '',
          keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords
                .map((k: any) => ({
                  keyword: k.keyword || '',
                  searchVolume: ['high', 'medium', 'low'].includes(k.searchVolume)
                    ? k.searchVolume
                    : 'medium',
                }))
                .filter((k: any) => k.keyword)
            : [],
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions
                .map((s: any) => ({
                  category: s.category || '綜合',
                  priority: ['high', 'medium', 'low'].includes(s.priority)
                    ? s.priority
                    : 'medium',
                  suggestion: s.suggestion || '',
                }))
                .filter((s: any) => s.suggestion)
            : [],
        };

        return { result, tokensUsed: response.usage?.totalTokens };
      },
      fallback: {
        overallScore: 0,
        readabilityScore: 0,
        optimizedTitle: [],
        metaDescription: '',
        keywords: [],
        suggestions: [],
      },
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: 'AI SEO 优化',
        }),
    });
  }

  // ===== 通用文本 AI 调用 =====
  private async callTextAI(
    userId: string,
    articleId: string | undefined,
    action: string,
    prompt: string,
    originalText: string,
    language?: ContentLanguage,
  ): Promise<string> {
    // Pre-check balance (estimate ~2000 tokens for text operations)
    await this.checkAIBalance(userId, (2000 / 1000) * 0.02);

    return this.aiLog.run({
      userId,
      articleId,
      agentType: 'WRITING',
      action,
      prompt,
      model: this.chatProvider.model,
      fn: async () => {
        const response = await this.chatProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                `你是一位有十年新闻一线采写经验的记者。${this.getLanguageInstruction(language)}。\n\n【写作风格要求 - 必须遵守】\n- 像真人记者一样写作，不要有任何 AI 生成痕迹\n- 句子长短错落，避免每句话结构雷同或长度均匀\n- 使用新闻行业自然的表达方式，而非教科书式的标准句式\n- 允许使用口语化、接地气的表达，但保持新闻专业性\n- 避免以下 AI 典型特征：频繁使用「此外」「与此同时」「值得注意的是」「综上所述」等模板化过渡词；每段开头用同样的句式结构；堆砌形容词和修饰语；结尾用「让我们共同期待」等套话\n- 如果有数据或事实，自然地融入叙述中，不用「根据数据显示」这类生硬引出方式\n- 标题和导语要有记者个人判断和新闻敏感，而非中规中矩的概括\n\n直接输出处理后的文字，不要添加解释、说明或前缀标注。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        });

        return { result: response.content.trim(), tokensUsed: response.usage?.totalTokens };
      },
      fallback: originalText,
      onSuccess: (aiOpId, tokensUsed) =>
        this.deductLLMBilling({
          userId,
          aiOperationId: aiOpId,
          tokensUsed,
          articleId,
          description: `AI ${action}`,
        }),
    });
  }

  private getFallbackHeadlines(title: string): HeadlineOption[] {
    return [
      {
        title: `${title}：深入分析`,
        style: '严肃版',
        reasoning: '直接明了，适合深度报道',
      },
      {
        title: `${title}，背後原因令人震驚`,
        style: '悬念版',
        reasoning: '制造悬念，吸引点击',
      },
    ];
  }

  private buildSuggestionPrompt(
    userProfile: { name: string; expertise: string[]; department?: string },
    recentTopics: string[],
  ): string {
    const expertiseStr = userProfile.expertise.join(', ') || '未指定';
    const deptStr = userProfile.department || '未指定';
    const topicsStr =
      recentTopics.length > 0 ? recentTopics.join(', ') : '暂无最近热点';

    return `请为以下记者生成 3-5 个新闻选题建议：

记者：${userProfile.name}
专长领域：${expertiseStr}
部门：${deptStr}

近期热点参考：${topicsStr}

要求：
1. 选题应具有新闻价值和时效性
2. 结合记者专长领域
3. 每个建议包含：标题(title)、描述(description)、建议角度(suggestedAngle)、推荐理由(reason)

请输出 JSON 数组格式，例如：
[
  {
    "title": "选题标题",
    "description": "简要描述",
    "suggestedAngle": "建议角度",
    "reason": "推荐理由"
  }
]`;
  }

  private getFallbackSuggestions(userProfile: {
    name: string;
    expertise: string[];
    department?: string;
  }): StorySuggestion[] {
    return [
      {
        title: '香港社会热点追踪',
        description: '关注近期香港社会民生议题，挖掘深度报道角度',
        suggestedAngle: '从市民日常生活影响切入',
        reason: '社会线记者的通用选题方向',
      },
      {
        title: '政策解读系列',
        description: '解读最新政府政策对各行业的影响',
        suggestedAngle: '对比政策前后变化，采访受影响群体',
        reason: '政策类选题具有持续关注度',
      },
    ];
  }

  // ===== AI 配图生成（Seedream 5.0 Lite） =====
  async generateArticleImage(
    userId: string,
    articleId: string,
    articleTitle: string,
    articleContent: string,
    options?: {
      style?: 'news' | 'illustration' | 'photo' | 'social';
      aspectRatio?: string;
      size?: '2K' | '3K' | '4K';
      customPrompt?: string;
    },
  ): Promise<{ url: string; prompt: string }> {
    const startTime = Date.now();
    const style = options?.style || 'news';
    const size = options?.size || '2K';
    const aspectRatio = options?.aspectRatio;
    const customPrompt = options?.customPrompt || '';

    this.logger.log(
      `[generateArticleImage] START articleId=${articleId} style=${style} size=${size} aspectRatio=${aspectRatio || 'none'}`,
    );

    // Pre-check balance for image generation (fixed cost)
    await this.checkAIBalance(userId, 0.5);

    // Step 1: 用 ChatProvider 提炼高质量英文 prompt
    let imagePrompt: string;
    try {
      this.logger.log('[generateArticleImage] Step 1: buildImagePrompt ...');
      imagePrompt = await this.buildImagePrompt(
        articleTitle,
        articleContent,
        style,
        customPrompt,
      );
      this.logger.log(
        `[generateArticleImage] Step 1 done (${Date.now() - startTime}ms): prompt="${imagePrompt.slice(0, 120)}..."`,
      );
    } catch (error: any) {
      this.logger.error(
        `[generateArticleImage] Step 1 buildImagePrompt FAILED (${Date.now() - startTime}ms): ${error.message}`,
        error.stack,
      );
      throw error;
    }

    // Step 2: 调用 Seedream 生成图片
    let seedreamResponse: any;
    try {
      this.logger.log('[generateArticleImage] Step 2: callSeedream ...');
      seedreamResponse = await this.callSeedream(imagePrompt, size, aspectRatio);
      this.logger.log(
        `[generateArticleImage] Step 2 done (${Date.now() - startTime}ms): response keys=${JSON.stringify(Object.keys(seedreamResponse || {}))}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[generateArticleImage] Step 2 callSeedream FAILED (${Date.now() - startTime}ms): ${error.message}`,
        error.stack,
      );
      throw error;
    }

    const tempImageUrl = seedreamResponse.data?.[0]?.url || '';
    if (!tempImageUrl) {
      this.logger.error(
        `[generateArticleImage] Seedream returned no image URL. Response data: ${JSON.stringify(seedreamResponse)}`,
      );
      throw new InternalServerErrorException('Seedream 未返回图片 URL');
    }
    this.logger.log(
      `[generateArticleImage] Temp image URL: ${tempImageUrl.slice(0, 100)}...`,
    );

    // Step 3: 下载图片并上传到 COS
    let publicUrl: string;
    try {
      this.logger.log('[generateArticleImage] Step 3: uploadToStorage ...');
      publicUrl = await this.uploadToStorage(tempImageUrl, articleId);
      this.logger.log(
        `[generateArticleImage] Step 3 done (${Date.now() - startTime}ms): publicUrl=${publicUrl}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[generateArticleImage] Step 3 uploadToStorage FAILED (${Date.now() - startTime}ms): ${error.message}`,
        error.stack,
      );
      throw error;
    }

    // Step 4: 记录 AI 操作 (uses the shared logger so the row has the same
    // shape + duration bookkeeping as the other AI methods).
    await this.aiLog.run({
      userId,
      articleId,
      agentType: 'VISUAL',
      action: 'generate_article_image',
      prompt: `标题: ${articleTitle}\n风格: ${style}\n${customPrompt}`,
      model: this.seedreamModel,
      fn: async () => ({
        result: { imagePrompt, publicUrl },
        // image gen doesn't report token usage, so leave it undefined
      }),
      // If the audit row write itself fails, fall back to a plain object
      // describing the partial result so the pipeline can still continue.
      fallback: { imagePrompt: imagePrompt ?? '', publicUrl: publicUrl ?? '' },
      onSuccess: (aiOpId) =>
        this.deductImageBilling({
          userId,
          aiOperationId: aiOpId,
          articleId,
          description: 'AI 配图生成',
        }),
    });

    this.logger.log(
      `[generateArticleImage] COMPLETE (${Date.now() - startTime}ms) url=${publicUrl}`,
    );
    return { url: publicUrl, prompt: imagePrompt };
  }

  private async buildImagePrompt(
    title: string,
    content: string,
    style: string,
    customPrompt: string,
  ): Promise<string> {
    const styleMap: Record<string, string> = {
      news: 'professional news photography style, photojournalistic, realistic, high detail',
      illustration:
        'editorial illustration style, artistic, expressive, modern digital art',
      photo:
        'high-quality stock photo style, clean composition, professional lighting',
      social:
        'social media graphic style, bold typography space, vibrant colors, eye-catching',
    };

    const styleDesc = styleMap[style] || styleMap.news;

    const promptText = `文章标题：${title}

文章内容摘要：
${content.slice(0, 2000)}

${customPrompt ? `额外要求：${customPrompt}` : ''}

请基于以上内容，生成一个高质量的英文图片生成 prompt。该 prompt 将用于 Seedream 5.0 文生图模型。

要求：
1. 用英文描述，简洁但信息丰富（不超过 300 个英文单词）
2. 包含场景设定、主体描述、视觉风格、光影效果、构图建议
3. 风格方向：${styleDesc}
4. 适合作为新闻/媒体配图使用
5. 直接输出 prompt 文本，不要有任何解释或前缀`;

    const response = await this.chatProvider.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are an expert visual designer and news image prompt engineer. Generate concise, high-quality English image generation prompts.',
        },
        { role: 'user', content: promptText },
      ],
      temperature: 0.8,
    });

    return response.content.trim();
  }

  /**
   * Seedream API 不支持 aspect_ratio 参数，必须通过 size 像素值控制宽高比。
   * 映射表：aspectRatio × resolutionLevel → 具体像素 size
   */
  private static readonly SIZE_PIXEL_MAP: Record<string, Record<string, string>> = {
    '1:1':  { '2K': '2048x2048', '3K': '3072x3072', '4K': '4096x4096' },
    '4:3':  { '2K': '2304x1728', '3K': '3456x2592', '4K': '4704x3520' },
    '3:4':  { '2K': '1728x2304', '3K': '2592x3456', '4K': '3520x4704' },
    '16:9': { '2K': '2848x1600', '3K': '4096x2304', '4K': '5504x3040' },
    '9:16': { '2K': '1600x2848', '3K': '2304x4096', '4K': '3040x5504' },
    '3:2':  { '2K': '2496x1664', '3K': '3744x2496', '4K': '4992x3328' },
    '2:3':  { '2K': '1664x2496', '3K': '2496x3744', '4K': '3328x4992' },
    '21:9': { '2K': '3136x1344', '3K': '4704x2016', '4K': '6240x2656' },
  };

  private resolveSeedreamSize(
    resolution: string,
    aspectRatio?: string,
  ): string {
    if (aspectRatio && AIService.SIZE_PIXEL_MAP[aspectRatio]?.[resolution]) {
      return AIService.SIZE_PIXEL_MAP[aspectRatio][resolution];
    }
    // 无比例或比例不匹配时，回退到分辨率级别（模型自动决定比例）
    return resolution;
  }

  private async callSeedream(
    prompt: string,
    size: string,
    aspectRatio?: string,
  ): Promise<any> {
    const resolvedSize = this.resolveSeedreamSize(size, aspectRatio);
    this.logger.log(
      `[callSeedream] resolution=${size} aspectRatio=${aspectRatio || 'none'} → size=${resolvedSize}`,
    );

    const body: any = {
      model: this.seedreamModel,
      prompt,
      size: resolvedSize,
      output_format: 'jpeg',
      watermark: false,
    };

    const response = await axios.post(
      `${this.seedreamApiBase}/images/generations`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.seedreamApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
        ...(this.proxyAgent ? { httpsAgent: this.proxyAgent } : {}),
      },
    );

    return response.data;
  }

  /**
   * 下载临时图片并上传到对象存储,返回公网 URL
   */
  private async uploadToStorage(
    tempUrl: string,
    articleId: string,
  ): Promise<string> {
    this.logger.log(`[uploadToStorage] Downloading temp image: ${tempUrl.slice(0, 120)}...`);
    const imageResponse = await axios.get(tempUrl, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: MAX_IMAGE_BYTES,
      ...(this.proxyAgent ? { httpsAgent: this.proxyAgent } : {}),
    });
    const buffer = Buffer.from(imageResponse.data);
    const rawType = String(imageResponse.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    this.logger.log(
      `[uploadToStorage] Downloaded: ${buffer.length} bytes, content-type=${rawType}`,
    );
    if (!ALLOWED_IMAGE_TYPES.has(rawType)) {
      throw new InternalServerErrorException(
        `Unexpected image content type: ${rawType}`,
      );
    }
    const ext = rawType === 'image/png' ? 'png' : 'jpg';
    // crypto.randomBytes(4).toString('hex') → 8-char hex string
    // (e.g. "a3f2b109"), indistinguishable from a CMS-managed asset ID.
    const key = `cms-ng/articles/${articleId}/cover_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    try {
      const { url } = await this.storageService.put(key, buffer, rawType);
      this.logger.log(`[uploadToStorage] Uploaded to COS: ${url}`);
      return url;
    } catch (error: any) {
      this.logger.error(
        `Failed to upload image to storage: ${error.message}`,
        error.stack,
      );
      throw new ServiceUnavailableException(
        `图片上传到对象存储失败: ${error.message}`,
      );
    }
  }
}
