import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { StorySuggestion } from './dto/story-suggestion.dto';
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
} from './dto/writing-operations.dto';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly model: string;
  private readonly defaultTemperature: number;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.config.get<string>('KIMI_API_KEY') || '';
    this.apiBase = this.config.get<string>('KIMI_API_BASE') || 'https://api.kimi.com/coding/v1';
    this.model = this.config.get<string>('KIMI_MODEL') || 'kimi-for-coding';
    this.defaultTemperature = this.model === 'kimi-k2.6' ? 1 : undefined as any;
  }

  private getTemperature(preferred: number): number {
    return this.defaultTemperature ?? preferred;
  }

  async generateStorySuggestions(
    userId: string,
    userProfile: { name: string; expertise: string[]; department?: string },
    recentTopics: string[] = [],
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
                '你是一位资深新闻编辑，擅长为记者发掘有价值的选题。请用繁体中文回答。输出必须是有效的 JSON 数组格式，不要包含任何其他文字。',
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
          timeout: 30000,
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
  ): Promise<string> {
    const styleMap: Record<string, string> = {
      serious: '严肃新闻风格，客观冷静',
      casual: '轻快报道风格，通俗易懂',
      academic: '学术分析风格，严谨深入',
      concise: '简洁凝练风格，去除冗余',
    };
    const styleDesc = input.style ? styleMap[input.style] || input.style : '保持原意但改善表达';

    const prompt = `请改写以下文字。
要求：${styleDesc}${input.instruction ? '；额外要求：' + input.instruction : ''}

原文：
${input.text}

请直接输出改写后的文字，不要添加任何解释或标注。`;

    return this.callTextAI(userId, articleId, 'rewrite_text', prompt, input.text);
  }

  // ===== 文本扩写 =====
  async expandText(
    userId: string,
    articleId: string | undefined,
    input: ExpandTextInput,
  ): Promise<string> {
    const prompt = `请基于以下内容进行扩写，补充细节、数据支撑或背景信息，使其内容更丰富充实。
${input.instruction ? '额外要求：' + input.instruction : ''}

原文：
${input.text}

请直接输出扩写后的文字，不要添加任何解释或标注。`;

    return this.callTextAI(userId, articleId, 'expand_text', prompt, input.text);
  }

  // ===== 文本精简 =====
  async condenseText(
    userId: string,
    articleId: string | undefined,
    input: CondenseTextInput,
  ): Promise<string> {
    const lengthHint = input.maxLength ? `控制在 ${input.maxLength} 字以内。` : '去除冗余，保留核心信息。';
    const prompt = `请将以下文字精简。${lengthHint}

原文：
${input.text}

请直接输出精简后的文字，不要添加任何解释或标注。`;

    return this.callTextAI(userId, articleId, 'condense_text', prompt, input.text);
  }

  // ===== 文本润色 =====
  async polishText(
    userId: string,
    articleId: string | undefined,
    input: PolishTextInput,
  ): Promise<string> {
    const prompt = `请润色以下文字，提升流畅度、专业度和可读性，保持原意不变。

原文：
${input.text}

请直接输出润色后的文字，不要添加任何解释或标注。`;

    return this.callTextAI(userId, articleId, 'polish_text', prompt, input.text);
  }

  // ===== 标题生成 =====
  async generateHeadlines(
    userId: string,
    articleId: string | undefined,
    input: GenerateHeadlinesInput,
  ): Promise<HeadlineOption[]> {
    const startTime = Date.now();

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
              content: '你是一位资深新闻编辑，擅长撰写吸引人的新闻标题。请用繁体中文回答。输出必须是有效的 JSON 格式。',
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
          timeout: 30000,
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
              content: '你是一位资深新闻编辑，擅长提炼文章核心要点。请用繁体中文回答。',
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
          timeout: 30000,
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
        content: '你是一位资深新闻编辑和写作顾问，帮助记者改进稿件。请用繁体中文回答。回答要简洁、实用、有建设性。',
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
          timeout: 30000,
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

    const tagsStr = input.storyTags.join(', ') || '未指定';
    const prompt = `请根据以下选题信息，生成一篇完整的新闻稿件初稿。

选题标题：${input.storyTitle}
${input.storyDescription ? '选题描述：' + input.storyDescription : ''}
${input.storyAngle ? '建议角度：' + input.storyAngle : ''}
相关标签：${tagsStr}
${input.currentTitle ? '当前稿件标题（可参考）：' + input.currentTitle : ''}
${input.currentSubtitle ? '当前副标题（可参考）：' + input.currentSubtitle : ''}
${input.instruction ? '额外要求：' + input.instruction : ''}

要求：
1. 生成一个吸引读者的标题
2. 生成一个概括性的副标题
3. 正文内容结构清晰，包含导语、主体段落、结尾
4. 使用繁体中文
5. 正文使用 HTML 格式，仅使用以下标签：p, h2, h3, ul, ol, li, blockquote, strong, em
6. 不要输出任何解释文字，只输出 JSON 格式

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
              content: '你是一位资深新闻记者，擅长根据选题快速生成高质量的稿件初稿。请用繁体中文回答。输出必须是有效的 JSON 格式。',
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
          timeout: 180000,
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
      .replace(/<(?!\/?(?:p|h2|h3|ul|ol|li|blockquote|strong|em|br)\b)[^>]*>/gi, '');
  }

  // ===== 事实核查 =====
  async factCheck(
    userId: string,
    articleId: string | undefined,
    input: FactCheckInput,
  ): Promise<FactCheckResult> {
    const startTime = Date.now();

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
              content: '你是一位资深新闻事实核查专家，擅长识别稿件中的事实性问题和风险。请用繁体中文回答。输出必须是有效的 JSON 格式。',
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
          timeout: 45000,
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

  // ===== 通用文本 AI 调用 =====
  private async callTextAI(
    userId: string,
    articleId: string | undefined,
    action: string,
    prompt: string,
    originalText: string,
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
              content: '你是一位资深新闻编辑，擅长新闻写作和文字处理。请用繁体中文回答。直接输出处理后的文字，不要添加解释。',
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
          timeout: 30000,
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
      { title: `${title}：深入分析`, style: '严肃版', reasoning: '直接明了，适合深度报道' },
      { title: `${title}，背後原因令人震驚`, style: '悬念版', reasoning: '制造悬念，吸引点击' },
    ];
  }

  private buildSuggestionPrompt(
    userProfile: { name: string; expertise: string[]; department?: string },
    recentTopics: string[],
  ): string {
    const expertiseStr = userProfile.expertise.join(', ') || '未指定';
    const deptStr = userProfile.department || '未指定';
    const topicsStr = recentTopics.length > 0 ? recentTopics.join(', ') : '暂无最近热点';

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
}
