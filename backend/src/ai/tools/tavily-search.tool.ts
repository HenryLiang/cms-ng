import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ToolDefinition, ToolExecutor } from './tool.interface';

@Injectable()
export class TavilySearchTool implements ToolExecutor {
  private readonly logger = new Logger(TavilySearchTool.name);
  private readonly apiKey: string;
  private readonly apiBase = 'https://api.tavily.com';
  private readonly defaultSearchDepth: string;
  private readonly defaultMaxResults: number;
  private readonly maxResultsLimit: number;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('TAVILY_API_KEY') || '';
    this.defaultSearchDepth =
      this.config.get<string>('TAVILY_SEARCH_DEPTH') || 'advanced';
    this.defaultMaxResults = Number(
      this.config.get<string>('TAVILY_MAX_RESULTS') || '5',
    );
    this.maxResultsLimit = Number(
      this.config.get<string>('TAVILY_MAX_RESULTS_LIMIT') || '10',
    );
  }

  get name(): string {
    return 'tavily_search';
  }

  getDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'tavily_search',
        description:
          '通过 Tavily API 进行联网搜索，获取最新、准确的信息。' +
          '适用于需要查找最新新闻、事实核查、背景资料等场景。' +
          '支持基本和深度两种搜索模式。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询词，支持自然语言问题',
            },
            search_depth: {
              type: 'string',
              enum: ['basic', 'advanced'],
              description:
                '搜索深度。basic 速度更快，advanced 搜索结果更深入（消耗更多 API 额度）',
              default: 'advanced',
            },
            max_results: {
              type: 'integer',
              description: '最大返回结果数（1-10）',
              default: 5,
            },
            include_answer: {
              type: 'boolean',
              description: '是否返回 AI 生成的摘要答案',
              default: true,
            },
            time_range: {
              type: 'string',
              enum: ['day', 'week', 'month', 'year'],
              description: '时间范围过滤，仅返回指定时间段内的结果',
            },
            topic: {
              type: 'string',
              enum: ['general', 'news', 'finance'],
              description: '搜索主题类型，news 适合新闻搜索',
              default: 'general',
            },
          },
          required: ['query'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<unknown> {
    if (!this.apiKey) {
      this.logger.warn('TAVILY_API_KEY not configured');
      return { error: 'Tavily API key not configured' };
    }

    const query = typeof args.query === 'string' ? args.query : '';
    if (!query) {
      return { error: 'Query is required' };
    }

    const searchDepth =
      typeof args.search_depth === 'string'
        ? args.search_depth
        : this.defaultSearchDepth;
    const maxResults = Math.min(
      Math.max(Number(args.max_results ?? this.defaultMaxResults), 1),
      this.maxResultsLimit,
    );
    const includeAnswer = args.include_answer !== false;
    const timeRange =
      typeof args.time_range === 'string' ? args.time_range : undefined;
    const topic = typeof args.topic === 'string' ? args.topic : 'general';

    try {
      const response = await axios.post(
        `${this.apiBase}/search`,
        {
          api_key: this.apiKey,
          query,
          search_depth: searchDepth,
          max_results: maxResults,
          include_answer: includeAnswer,
          ...(timeRange && { time_range: timeRange }),
          topic,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
        },
      );

      return this.formatResponse(
        response.data as Parameters<TavilySearchTool['formatResponse']>[0],
      );
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: unknown } };
      this.logger.error(
        `Tavily search failed: ${err.message}`,
        err.response?.data,
      );
      return {
        error: 'Search failed',
        message: err.message || 'Unknown error',
      };
    }
  }

  private formatResponse(data: {
    answer?: string;
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      published_date?: string;
    }>;
    response_time?: number;
  }): unknown {
    return {
      answer: data.answer || '',
      results: (data.results || []).map((r) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
        published_date: r.published_date || null,
      })),
      response_time: data.response_time || 0,
    };
  }
}
