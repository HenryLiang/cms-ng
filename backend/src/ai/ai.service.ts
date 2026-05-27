import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { StorySuggestion } from './dto/story-suggestion.dto';
import { ContentLanguage } from '@cms-ng/shared';
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
  ReviewReportInput,
  ReviewReportResult,
  OptimizeSEOInput,
  SEOResult,
  WikipediaEntry,
} from './dto/writing-operations.dto';
import { AIToolsService } from './tools/ai-tools.service';
import { ToolDefinition } from './tools/tool.interface';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly model: string;
  private readonly defaultTemperature: number;
  private readonly seedreamApiKey: string;
  private readonly seedreamApiBase: string;
  private readonly seedreamModel: string;
  private readonly uploadDir: string;
  private readonly searchProvider: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private aiTools: AIToolsService,
  ) {
    this.apiKey = this.config.get<string>('KIMI_API_KEY') || '';
    this.apiBase =
      this.config.get<string>('KIMI_API_BASE') ||
      'https://api.kimi.com/coding/v1';
    this.model = this.config.get<string>('KIMI_MODEL') || 'kimi-for-coding';
    this.defaultTemperature =
      this.model === 'kimi-k2.6' ? 1 : (undefined as any);
    this.seedreamApiKey = this.config.get<string>('SEEDREAM_API_KEY') || '';
    this.seedreamApiBase =
      this.config.get<string>('SEEDREAM_API_BASE') ||
      'https://ark.cn-beijing.volces.com/api/v3';
    this.seedreamModel =
      this.config.get<string>('SEEDREAM_MODEL') || 'doubao-seedream-5-0-260128';
    this.uploadDir = this.config.get<string>('UPLOAD_DIR') || './uploads';
    this.searchProvider = this.config.get<string>('SEARCH_PROVIDER') || 'kimi';
  }

  private getTemperature(preferred: number): number {
    return this.defaultTemperature ?? preferred;
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
    const startTime = Date.now();

    const prompt = this.buildSuggestionPrompt(userProfile, recentTopics);

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻编辑，擅长为记者发掘有价值的选题。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 对象格式，包含 suggestions 字段，不要包含任何其他文字。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.7),
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const content = response.data.choices[0]?.message?.content || '';
      const parsed = JSON.parse(content);
      const suggestions: StorySuggestion[] = Array.isArray(parsed)
        ? parsed
        : parsed.suggestions || [];

      // Record AI operation
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'STORY',
          action: 'generate_story_suggestions',
          prompt,
          result: JSON.stringify(suggestions),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          createdBy: userId,
        },
      });

      return suggestions.slice(0, 5);
    } catch (error: any) {
      this.logger.error('AI suggestion failed:', error.message);

      // Record failed operation
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'STORY',
          action: 'generate_story_suggestions',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          createdBy: userId,
        },
      });

      // Return fallback suggestions if API fails
      return this.getFallbackSuggestions(userProfile);
    }
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

    const prompt = `请改写以下文字。
要求：${styleDesc}${input.instruction ? '；额外要求：' + input.instruction : ''}

原文：
${input.text}

请直接输出改写后的文字，不要添加任何解释或标注。`;

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
    const prompt = `请基于以下内容进行扩写，补充细节、数据支撑或背景信息，使其内容更丰富充实。
${input.instruction ? '额外要求：' + input.instruction : ''}

原文：
${input.text}

请直接输出扩写后的文字，不要添加任何解释或标注。`;

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
    const prompt = `请将以下文字精简。${lengthHint}

原文：
${input.text}

请直接输出精简后的文字，不要添加任何解释或标注。`;

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
    const prompt = `请润色以下文字，提升流畅度、专业度和可读性，保持原意不变。

原文：
${input.text}

请直接输出润色后的文字，不要添加任何解释或标注。`;

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
    const startTime = Date.now();
    const language = input.language;

    const prompt = `请根据以下文章内容生成 ${input.count ?? 5} 个标题选项。

文章标题：${input.title}
${input.subtitle ? '副标题：' + input.subtitle : ''}
正文前500字：
${input.content.slice(0, 500)}

要求：
1. 标题要吸引读者，同时准确反映文章内容
2. 提供不同风格的标题（如：严肃版、悬念版、数字版、提问版等）
3. 每个标题附带简短的理由说明

请输出 JSON 数组格式：
[
  { "title": "标题", "style": "风格标签", "reasoning": "推荐理由" }
]`;

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻编辑，擅长撰写吸引人的新闻标题。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.8),
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const content = response.data.choices[0]?.message?.content || '';
      const parsed = JSON.parse(content);
      const headlines: HeadlineOption[] = Array.isArray(parsed)
        ? parsed
        : parsed.headlines || parsed.titles || [];

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'generate_headlines',
          prompt,
          result: JSON.stringify(headlines),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return headlines.slice(0, input.count ?? 5);
    } catch (error: any) {
      this.logger.error('Headline generation failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'generate_headlines',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return this.getFallbackHeadlines(input.title);
    }
  }

  // ===== 摘要生成 =====
  async generateExcerpt(
    userId: string,
    articleId: string | undefined,
    input: GenerateExcerptInput,
  ): Promise<string> {
    const startTime = Date.now();
    const language = input.language;

    const maxLen = input.maxLength ?? 200;
    const prompt = `请为以下文章生成摘要，控制在 ${maxLen} 字以内。

文章标题：${input.title}
正文：
${input.content.slice(0, 2000)}

请直接输出摘要文字，不要添加任何解释或标注。`;

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻编辑，擅长提炼文章核心要点。${this.getLanguageInstruction(language)}。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.5),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const result = response.data.choices[0]?.message?.content?.trim() || '';

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'generate_excerpt',
          prompt,
          result,
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('Excerpt generation failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'generate_excerpt',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return input.content.slice(0, maxLen);
    }
  }

  // ===== 对话助手 =====
  async chatWithAI(
    userId: string,
    articleId: string | undefined,
    input: ChatInput,
  ): Promise<string> {
    const startTime = Date.now();
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

    const messages = [
      {
        role: 'system',
        content:
          `你是一位资深新闻编辑和写作顾问，帮助记者改进稿件。${this.getLanguageInstruction(language)}。回答要简洁、实用、有建设性。`,
      },
      ...contextMessages,
      ...input.messages,
    ];

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages,
          temperature: this.getTemperature(0.7),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const result = response.data.choices[0]?.message?.content?.trim() || '';

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'chat_assistant',
          prompt: JSON.stringify(messages),
          result,
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('Chat assistant failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'chat_assistant',
          prompt: JSON.stringify(messages),
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return 'AI 助手暂时无法回答，请稍后重试。';
    }
  }

  // ===== 初稿生成 =====
  async generateDraft(
    userId: string,
    articleId: string | undefined,
    input: GenerateDraftInput,
  ): Promise<DraftResult> {
    const startTime = Date.now();
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

    const prompt = `请根据以下选题信息，生成一篇完整的新闻稿件初稿。

选题标题：${input.storyTitle}
${input.storyDescription ? '选题描述：' + input.storyDescription : ''}
${input.storyAngle ? '建议角度：' + input.storyAngle : ''}
相关标签：${tagsStr}
${input.currentTitle ? '当前稿件标题（可参考）：' + input.currentTitle : ''}
${input.currentSubtitle ? '当前副标题（可参考）：' + input.currentSubtitle : ''}
${input.instruction ? '额外要求：' + input.instruction : ''}
${researchKitSection ? '\n【已搜集背景資料】\n\n' + researchKitSection : ''}

要求：
1. 生成一个吸引读者的标题
2. 生成一个概括性的副标题
3. 正文内容结构清晰，包含导语、主体段落、结尾
4. ${this.getLanguageInstruction(language)}
5. 正文使用 HTML 格式，仅使用以下标签：p, h2, h3, ul, ol, li, blockquote, strong, em
6. 不要输出任何解释文字，只输出 JSON 格式
${researchKitSection ? '7. 请充分利用上述背景资料撰写初稿，确保引用准确、观点平衡\n' : ''}
请输出以下 JSON 格式：
{
  "title": "稿件标题",
  "subtitle": "副标题",
  "content": "<p>导语段落...</p><h2>小标题</h2><p>正文...</p>"
}`;

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻记者，擅长根据选题快速生成高质量的稿件初稿。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.7),
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const content = response.data.choices[0]?.message?.content || '';
      const parsed = JSON.parse(content);
      const result: DraftResult = {
        title: parsed.title || input.currentTitle || input.storyTitle,
        subtitle: parsed.subtitle,
        content: this.sanitizeDraftHTML(parsed.content || ''),
      };

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'generate_draft',
          prompt,
          result: JSON.stringify(result),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('Draft generation failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'generate_draft',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return {
        title: input.currentTitle || input.storyTitle,
        subtitle: '',
        content: '<p>AI 初稿生成暫時不可用，請稍後重試。</p>',
      };
    }
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
    const startTime = Date.now();
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

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻事实核查专家，擅长识别稿件中的事实性问题和风险。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.3),
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const content = response.data.choices[0]?.message?.content || '';
      const parsed = JSON.parse(content);
      const result: FactCheckResult = {
        score: Math.min(100, Math.max(0, parsed.score ?? 50)),
        summary: parsed.summary || '已完成事实核查分析',
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      };

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'fact_check',
          prompt,
          result: JSON.stringify(result),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('Fact check failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'fact_check',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return {
        score: 0,
        summary: '事实核查服务暂时不可用，请稍后重试',
        findings: [],
      };
    }
  }

  // ===== Wikipedia 资料增强 =====
  private async searchWikipedia(title: string): Promise<WikipediaEntry[]> {
    const entries: WikipediaEntry[] = [];
    const seenTitles = new Set<string>();

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
      } catch (err: any) {
        if (err.response?.status !== 404) {
          this.logger.warn(
            `Wikipedia ${lang} search failed for "${query}": ${err.message}`,
          );
        }
      }
      return null;
    };

    // 优先中文，再英文补充
    const zhEntry = await searchAndFetch('zh', title);
    if (zhEntry) entries.push(zhEntry);

    const enEntry = await searchAndFetch('en', title);
    if (enEntry && !seenTitles.has(enEntry.title)) entries.push(enEntry);

    return entries;
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

  // ===== Kimi 联网搜索调用 =====
  /**
   * 使用 Kimi 内置联网搜索能力生成回复。
   * 流程：第1轮请求触发 tool_calls → 第2轮回传 tool 结果 → 获取最终答案。
   * 注意：response_format 与 tool calling 结合时会导致第二轮输出异常，
   * 因此第二轮不传 response_format，依赖 Prompt 要求 JSON 并在代码中提取。
   * 参考：https://platform.kimi.ai/docs/guide/use-web-search
   */
  private async callKimiWithWebSearch(
    messages: any[],
    temperature: number,
    maxRounds = 3,
  ): Promise<any> {
    const tools = [
      {
        type: 'builtin_function',
        function: { name: '$web_search' },
      },
    ];

    const commonHeaders = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const buildBody = (msgs: any[]): any => ({
      model: this.model,
      messages: msgs,
      tools,
      temperature: this.getTemperature(temperature),
    });

    let currentMessages = [...messages];

    for (let round = 0; round < maxRounds; round++) {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        buildBody(currentMessages),
        { headers: commonHeaders, timeout: 300000 },
      );

      const choice = response.data.choices?.[0];

      // 未触发 tool_calls，直接返回
      if (!choice || choice.finish_reason !== 'tool_calls') {
        return response;
      }

      // 构建下一轮消息
      const assistantMessage = {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
        reasoning_content: choice.message.reasoning_content || '',
      };

      const toolMessages = choice.message.tool_calls.map((tc: any) => ({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: tc.function.arguments,
      }));

      currentMessages = [...currentMessages, assistantMessage, ...toolMessages];
    }

    // 达到最大轮数，返回最后一轮响应
    return axios.post(
      `${this.apiBase}/chat/completions`,
      buildBody(currentMessages),
      { headers: commonHeaders, timeout: 300000 },
    );
  }

  // ===== 通用自定义工具调用 =====
  /**
   * 使用自定义工具（如 Tavily search）进行 function calling。
   * 流程与 callKimiWithWebSearch 相同：第1轮触发 tool_calls → 执行工具 → 第2轮回传结果。
   * 注意：第2轮不传 response_format，避免与 tool calling 冲突。
   */
  private async callKimiWithCustomTools(
    messages: any[],
    temperature: number,
    tools: ToolDefinition[],
    maxRounds = 3,
  ): Promise<any> {
    const commonHeaders = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const buildBody = (msgs: any[]): any => ({
      model: this.model,
      messages: msgs,
      tools,
      temperature: this.getTemperature(temperature),
    });

    let currentMessages = [...messages];

    for (let round = 0; round < maxRounds; round++) {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        buildBody(currentMessages),
        { headers: commonHeaders, timeout: 300000 },
      );

      const choice = response.data.choices?.[0];

      // 未触发 tool_calls，直接返回
      if (!choice || choice.finish_reason !== 'tool_calls') {
        return response;
      }

      // 执行工具调用
      const toolResults: any[] = [];
      for (const tc of choice.message.tool_calls || []) {
        const toolName = tc.function?.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          // 忽略解析错误，使用空参数
        }

        let result: unknown;
        try {
          result = await this.aiTools.executeTool(toolName, toolArgs);
        } catch (error: any) {
          result = { error: error.message };
        }

        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolName,
          content: JSON.stringify(result),
        });
      }

      // 构建下一轮消息
      const assistantMessage = {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
        reasoning_content: choice.message.reasoning_content || '',
      };

      currentMessages = [...currentMessages, assistantMessage, ...toolResults];
    }

    // 达到最大轮数，返回最后一轮响应
    return axios.post(
      `${this.apiBase}/chat/completions`,
      buildBody(currentMessages),
      { headers: commonHeaders, timeout: 300000 },
    );
  }

  // ===== 专门搜索最新资讯 =====
  /**
   * 专门用于触发 $web_search 获取选题最新资讯。
   * 与 generateResearchKit 分离，确保搜索独立执行，不受整理资料格式要求干扰。
   */
  private async searchLatestNews(
    query: string,
    language?: ContentLanguage,
  ): Promise<string> {
    const searchMessages = [
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

    const response = await this.callKimiWithWebSearch(searchMessages, 0.3);
    return response.data.choices[0]?.message?.content || '';
  }

  /**
   * 使用 Tavily 工具进行联网搜索获取最新资讯。
   * 与 searchLatestNews 并行，供 SEARCH_PROVIDER=tavily 时使用。
   */
  private async searchLatestNewsWithTavily(
    query: string,
    language?: ContentLanguage,
  ): Promise<string> {
    const searchMessages = [
      {
        role: 'system',
        content:
          `你是一个新闻搜索助手。你的唯一任务是通过联网搜索工具查找最新新闻。请搜索用户提供的查询词，并返回搜索到的最新信息摘要。${this.getLanguageInstruction(language)}。`,
      },
      {
        role: 'user',
        content: `请搜索"${query}"的最新新闻和动态，返回最近6个月内的重要事件摘要。`,
      },
    ];

    const tavilyTool = this.aiTools.getToolDefinition('tavily_search');
    if (!tavilyTool) {
      this.logger.warn('Tavily search tool not available');
      return '';
    }

    const response = await this.callKimiWithCustomTools(searchMessages, 0.3, [
      tavilyTool,
    ]);
    return response.data.choices[0]?.message?.content || '';
  }

  // ===== 智能资料搜集 =====
  async generateResearchKit(
    userId: string,
    input: ResearchKitInput,
  ): Promise<ResearchKitResult> {
    const startTime = Date.now();
    const language = input.language;

    // Step 1: Wikipedia 资料增强（静默降级）
    let wikipediaEntries: WikipediaEntry[] = [];
    try {
      wikipediaEntries = await this.searchWikipedia(input.storyTitle);
    } catch {
      // 静默降级：Wikipedia 搜索失败不影响主流程
    }

    const tagsStr = input.storyTags.join(', ') || '未指定';

    // 动态计算时效性要求的时间范围
    const now = new Date();
    const currentYear = now.getFullYear();
    const prevYear = currentYear - 1;
    const currentDateStr = now.toISOString().split('T')[0];

    // Step 2: 联网搜索最新资讯（根据 SEARCH_PROVIDER 切换搜索源）
    let searchResults = '';
    try {
      const searchSummary =
        this.searchProvider === 'tavily'
          ? await this.searchLatestNewsWithTavily(input.storyTitle, language)
          : await this.searchLatestNews(input.storyTitle, language);
      if (searchSummary) {
        searchResults = `【联网搜索最新資訊】\n${searchSummary}\n`;
      }
    } catch {
      // 静默降级：搜索失败不影响主流程
    }

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

    try {
      // Step 3: 基于搜索结果整理资料包（普通调用，不触发 tool calling）
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `今天是 ${currentDateStr}。你是一位资深新闻研究员，擅长整理背景资料。${this.getLanguageInstruction(language)}。\n\n【极其重要】你的回复必须且只能是一个有效的 JSON 对象，不要包含任何其他文字、解释、Markdown 代码块标记（如 \`\`\`json）。直接输出原始 JSON 字符串。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.4),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      let content = response.data.choices[0]?.message?.content || '';
      // 去除可能的 Markdown JSON 代码块包裹
      content = content
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      const parsed = JSON.parse(content);
      const result: ResearchKitResult = {
        timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
        people: Array.isArray(parsed.people) ? parsed.people : [],
        data: Array.isArray(parsed.data) ? parsed.data : [],
        opinions: Array.isArray(parsed.opinions) ? parsed.opinions : [],
        wikipedia: wikipediaEntries.length > 0 ? wikipediaEntries : undefined,
      };

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'RESEARCH',
          action: 'generate_research_kit',
          prompt,
          result: JSON.stringify(result),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      const errResponse = error.response?.data;
      this.logger.error(
        'Research kit generation failed:',
        error.message,
        errResponse ? JSON.stringify(errResponse) : '',
      );
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'RESEARCH',
          action: 'generate_research_kit',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          createdBy: userId,
        },
      });
      // 静默降级：API 失败时返回空资料包，不影响使用体验
      return {
        timeline: [],
        people: [],
        data: [],
        opinions: [],
        wikipedia: wikipediaEntries.length > 0 ? wikipediaEntries : undefined,
      };
    }
  }

  // ===== AI 预审报告 =====
  async generateReviewReport(
    userId: string,
    articleId: string | undefined,
    input: ReviewReportInput,
  ): Promise<ReviewReportResult> {
    const startTime = Date.now();
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

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻总编辑，擅长稿件质量评估和编辑指导。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.4),
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const content = response.data.choices[0]?.message?.content || '';
      const parsed = JSON.parse(content);
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

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'review_report',
          prompt,
          result: JSON.stringify(result),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('Review report generation failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'review_report',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return {
        overallScore: 0,
        summary: '预审报告生成失败，请稍后重试',
        dimensions: [],
        suggestions: [],
      };
    }
  }

  async optimizeSEO(
    userId: string,
    articleId: string | undefined,
    input: OptimizeSEOInput,
  ): Promise<SEOResult> {
    const startTime = Date.now();
    const language = input.language;

    const seoContext = language === ContentLanguage.SIMPLIFIED_CHINESE
      ? '针对中国内地媒体场景，关键词需考虑简体中文搜索习惯'
      : language === ContentLanguage.ENGLISH
      ? '针对英语媒体场景，关键词需考虑英语搜索习惯'
      : '针对香港01媒体场景，关键词需考虑繁简体中文搜索习惯';

    const prompt = `你是一位资深新闻SEO专家，精通Google搜索算法和中文内容优化。\n\n请对以下新闻稿件进行全面的SEO分析，并给出优化建议。${seoContext}。\n\n稿件标题：${input.title}\n${input.subtitle ? '副标题：' + input.subtitle : ''}\n正文内容：\n${input.content.replace(/<[^>]+>/g, '').slice(0, 3000)}\n\n请输出以下 JSON 格式：\n{\n  "overallScore": 78,\n  "readabilityScore": 82,\n  "optimizedTitle": [\n    {\n      "title": "优化后的标题1",\n      "reasoning": "推荐理由"\n    }\n  ],\n  "metaDescription": "适合搜索引擎摘要的元描述，120字以内",\n  "keywords": [\n    {\n      "keyword": "核心关键词",\n      "searchVolume": "high"\n    }\n  ],\n  "suggestions": [\n    {\n      "category": "标题优化",\n      "priority": "high",\n      "suggestion": "具体优化建议"\n    }\n  ]\n}\n\n字段说明：\n- overallScore: 综合SEO评分（0-100）\n- readabilityScore: 可读性评分（0-100）\n- optimizedTitle: AI建议的优化标题，1-3个选项，每个包含标题和推荐理由\n- metaDescription: 建议的元描述，适合搜索引擎摘要，120字以内\n- keywords: 提取的核心关键词列表，每个包含关键词和搜索热度评估（high/medium/low）\n- suggestions: 具体优化建议列表，按优先级分类（high/medium/low）\n\npriority 取值说明：\n- high：重要问题，建议优先修改\n- medium：一般问题，建议考虑改进\n- low：轻微问题，可酌情优化\n\n注意：${this.getLanguageInstruction(language)}。optimizedTitle 中的标题应当多样化，使用不同角度或风格。keywords 应当包含目标读者常用的搜索词。`;

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻SEO专家，精通Google搜索算法和中文内容优化。${this.getLanguageInstruction(language)}。输出必须是有效的 JSON 格式。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.4),
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const content = response.data.choices[0]?.message?.content || '';
      const parsed = JSON.parse(content);

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

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'optimize_seo',
          prompt,
          result: JSON.stringify(result),
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error('SEO optimization failed:', error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action: 'optimize_seo',
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return {
        overallScore: 0,
        readabilityScore: 0,
        optimizedTitle: [],
        metaDescription: '',
        keywords: [],
        suggestions: [],
      };
    }
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
    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                `你是一位资深新闻编辑，擅长新闻写作和文字处理。${this.getLanguageInstruction(language)}。直接输出处理后的文字，不要添加解释。`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: this.getTemperature(0.6),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
        },
      );

      const result = response.data.choices[0]?.message?.content?.trim() || '';

      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action,
          prompt,
          result,
          model: this.model,
          tokensUsed: response.data.usage?.total_tokens,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });

      return result;
    } catch (error: any) {
      this.logger.error(`${action} failed:`, error.message);
      await this.prisma.aIOperation.create({
        data: {
          agentType: 'WRITING',
          action,
          prompt,
          result: JSON.stringify({ error: error.message }),
          model: this.model,
          durationMs: Date.now() - startTime,
          articleId,
          createdBy: userId,
        },
      });
      return originalText;
    }
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
      size?: '2K' | '3K';
      customPrompt?: string;
    },
  ): Promise<{ url: string; prompt: string }> {
    const startTime = Date.now();
    const style = options?.style || 'news';
    const size = options?.size || '2K';
    const aspectRatio = options?.aspectRatio;
    const customPrompt = options?.customPrompt || '';

    // Step 1: 用 Kimi 提炼高质量英文 prompt
    const imagePrompt = await this.buildImagePrompt(
      articleTitle,
      articleContent,
      style,
      customPrompt,
    );

    // Step 2: 调用 Seedream 生成图片
    const seedreamResponse = await this.callSeedream(
      imagePrompt,
      size,
      aspectRatio,
    );
    const tempImageUrl = seedreamResponse.data?.[0]?.url || '';
    if (!tempImageUrl) {
      throw new InternalServerErrorException('Seedream 未返回图片 URL');
    }

    // Step 3: 下载图片到本地
    const localUrl = await this.downloadImage(tempImageUrl, articleId);

    // Step 4: 记录 AI 操作
    await this.prisma.aIOperation.create({
      data: {
        agentType: 'VISUAL',
        action: 'generate_article_image',
        prompt: `标题: ${articleTitle}\n风格: ${style}\n${customPrompt}`,
        result: JSON.stringify({ imagePrompt, localUrl }),
        model: this.seedreamModel,
        durationMs: Date.now() - startTime,
        articleId,
        createdBy: userId,
      },
    });

    return { url: localUrl, prompt: imagePrompt };
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

    const response = await axios.post(
      `${this.apiBase}/chat/completions`,
      {
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert visual designer and news image prompt engineer. Generate concise, high-quality English image generation prompts.',
          },
          { role: 'user', content: promptText },
        ],
        temperature: this.getTemperature(0.8),
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000,
      },
    );

    return response.data.choices[0]?.message?.content?.trim() || '';
  }

  private async callSeedream(
    prompt: string,
    size: string,
    aspectRatio?: string,
  ): Promise<any> {
    const body: any = {
      model: this.seedreamModel,
      prompt,
      size,
      output_format: 'png',
      watermark: false,
    };

    if (aspectRatio) {
      body.aspect_ratio = aspectRatio;
    }

    const response = await axios.post(
      `${this.seedreamApiBase}/images/generations`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.seedreamApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000,
      },
    );

    return response.data;
  }

  private async downloadImage(
    tempUrl: string,
    articleId: string,
  ): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');

    const dir = path.join(this.uploadDir, 'articles', articleId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `generated_${Date.now()}.png`;
    const filePath = path.join(dir, filename);

    const imageResponse = await axios.get(tempUrl, {
      responseType: 'stream',
      timeout: 300000,
    });

    const writer = fs.createWriteStream(filePath);
    imageResponse.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return `/uploads/articles/${articleId}/${filename}`;
  }
}
