jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AIService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { AIToolsService } from './tools/ai-tools.service';
import { TavilySearchTool } from './tools/tavily-search.tool';
import {
  CHAT_PROVIDER,
  type ChatCompletionProvider,
  type ChatCompletionResponse,
  KimiProvider,
} from './providers';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { BillingService } from '../billing/billing.service';

// axios is still used by searchWikipedia (GET requests)
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AIService', () => {
  let service: AIService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: { get: jest.Mock };
  let aiTools: AIToolsService;
  let tavilySearch: TavilySearchTool;
  let mockChatProvider: {
    providerName: string;
    model: string;
    chatCompletion: jest.Mock;
    chatCompletionWithTools: jest.Mock;
  };
  let storageMock: { put: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    prisma = createMockPrismaService();
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          SEEDREAM_API_KEY: 'test-seedream-key',
          SEEDREAM_API_BASE: 'https://api.test.com/seedream',
          SEEDREAM_MODEL: 'test-seedream-model',
          SEARCH_PROVIDER: 'tavily',
          TAVILY_API_KEY: 'test-tavily-key',
        };
        return map[key];
      }),
    };

    tavilySearch = new TavilySearchTool(config as unknown as ConfigService);
    aiTools = new AIToolsService(tavilySearch);

    mockChatProvider = {
      providerName: 'test-provider',
      model: 'test-model',
      chatCompletion: jest.fn(),
      chatCompletionWithTools: jest.fn(),
    };

    storageMock = {
      put: jest.fn(),
      delete: jest.fn(),
    };

    const billingMock = {
      isEnabled: jest.fn().mockReturnValue(false),
      checkBalance: jest.fn().mockResolvedValue(true),
      deduct: jest.fn().mockResolvedValue(null),
      getConfig: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AIToolsService, useValue: aiTools },
        { provide: CHAT_PROVIDER, useValue: mockChatProvider },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: BillingService, useValue: billingMock },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockChatResponse = (
    content: string,
    finishReason = 'stop',
    usage?: any,
  ): ChatCompletionResponse => ({
    content,
    finishReason,
    usage: usage || { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
  });

  describe('generateStorySuggestions', () => {
    it('should return suggestions on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('[{"title":"T1","description":"D1","suggestedAngle":"A1","reason":"R1"}]'),
      );

      const result = await service.generateStorySuggestions('user-id', {
        name: 'Test',
        expertise: ['tech'],
        department: 'News',
      });

      expect(mockChatProvider.chatCompletion).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('T1');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Network error'));

      const result = await service.generateStorySuggestions('user-id', {
        name: 'Test',
        expertise: ['tech'],
      });

      expect(result).toHaveLength(2);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });
  });

  describe('rewriteText', () => {
    it('should return rewritten text on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(mockChatResponse('Rewritten text'));

      const result = await service.rewriteText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Rewritten text');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return original text on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.rewriteText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Original');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });
  });

  describe('expandText', () => {
    it('should return expanded text on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(mockChatResponse('Expanded text'));

      const result = await service.expandText('user-id', 'article-id', { text: 'Short' });

      expect(result).toBe('Expanded text');
    });

    it('should return original text on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.expandText('user-id', 'article-id', { text: 'Short' });

      expect(result).toBe('Short');
    });
  });

  describe('condenseText', () => {
    it('should return condensed text on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(mockChatResponse('Short'));

      const result = await service.condenseText('user-id', 'article-id', { text: 'Long text here' });

      expect(result).toBe('Short');
    });

    it('should return original text on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.condenseText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Original');
    });
  });

  describe('polishText', () => {
    it('should return polished text on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(mockChatResponse('Polished'));

      const result = await service.polishText('user-id', 'article-id', { text: 'Rough' });

      expect(result).toBe('Polished');
    });

    it('should return original text on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.polishText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Original');
    });
  });

  describe('generateHeadlines', () => {
    it('should return headlines on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('[{"title":"H1","style":"s","reasoning":"r"}]'),
      );

      const result = await service.generateHeadlines('user-id', 'article-id', { title: 'Article', content: 'Body' });

      expect(result).toHaveLength(1);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.generateHeadlines('user-id', 'article-id', { title: 'Article', content: 'Body' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toContain('Article');
    });
  });

  describe('generateExcerpt', () => {
    it('should return excerpt on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(mockChatResponse('Summary'));

      const result = await service.generateExcerpt('user-id', 'article-id', { title: 'T', content: 'Body text' });

      expect(result).toBe('Summary');
    });

    it('should return content slice on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.generateExcerpt('user-id', 'article-id', { title: 'T', content: 'Body text' });

      expect(result).toBe('Body text');
    });
  });

  describe('chatWithAI', () => {
    it('should return reply on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(mockChatResponse('AI reply'));

      const result = await service.chatWithAI('user-id', 'article-id', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toBe('AI reply');
    });

    it('should return error message on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.chatWithAI('user-id', 'article-id', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toContain('暂时无法回答');
    });
  });

  describe('generateDraft', () => {
    it('should return parsed draft on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          title: 'Draft Title',
          subtitle: 'Draft Subtitle',
          content: '<p>Draft content</p>',
        })),
      );

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: ['tag1'],
        currentTitle: 'Current Title',
      });

      expect(result.title).toBe('Draft Title');
      expect(result.subtitle).toBe('Draft Subtitle');
      expect(result.content).toBe('<p>Draft content</p>');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
        currentTitle: 'Current Title',
      });

      expect(result.title).toBe('Current Title');
      expect(result.content).toContain('暫時不可用');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should use storyTitle as fallback title when currentTitle missing', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Fail'));

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
      });

      expect(result.title).toBe('Story Title');
    });

    it('should inject formatted research kit into prompt', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          title: 'Draft Title',
          content: '<p>Content</p>',
        })),
      );

      const researchKit = {
        timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
        people: [{ name: 'Person A', role: 'Role A', background: 'Background A' }],
        data: [{ label: 'Label 1', value: 'Value 1', source: 'Source 1' }],
        opinions: [{ source: 'Source A', viewpoint: 'Viewpoint A', stance: 'Stance A' }],
      };

      await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: ['tag1'],
        researchKit,
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).toContain('【事件時間線】');
      expect(prompt).toContain('2024-01-01：Event 1（來源：Source 1）');
      expect(prompt).toContain('【關鍵人物】');
      expect(prompt).toContain('Person A（Role A）：Background A');
      expect(prompt).toContain('【核心數據】');
      expect(prompt).toContain('Label 1：Value 1（來源：Source 1）');
      expect(prompt).toContain('【各方觀點】');
      expect(prompt).toContain('Source A（Stance A）：Viewpoint A');
      expect(prompt).toContain('注意：背景资料中已包含多方信息，请在行文中自然引用，不要整段搬运。');
    });

    it('should skip empty research kit sections in prompt', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          title: 'Draft Title',
          content: '<p>Content</p>',
        })),
      );

      await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
        researchKit: {
          timeline: [],
          people: [{ name: 'P1', role: 'R1' }],
          data: [],
          opinions: [],
        },
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).not.toContain('【事件時間線】');
      expect(prompt).not.toContain('【核心數據】');
      expect(prompt).not.toContain('【各方觀點】');
      expect(prompt).toContain('【關鍵人物】');
    });

    it('should use instruction in prompt when provided', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          title: 'Draft Title',
          content: '<p>Content</p>',
        })),
      );

      await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
        instruction: '侧重民生角度',
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).toContain('额外要求：侧重民生角度');
    });

    it('should sanitize HTML in draft content', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          title: 'Draft Title',
          content: '<p>Safe</p><script>alert("xss")</script><style>body{color:red}</style><iframe src="evil"></iframe>',
        })),
      );

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
      });

      expect(result.content).toBe('<p>Safe</p>');
    });

    it('should fallback to currentTitle when AI returns no title', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          subtitle: 'Sub',
          content: '<p>C</p>',
        })),
      );

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
        currentTitle: 'Current Title',
      });

      expect(result.title).toBe('Current Title');
    });
  });

  describe('sanitizeDraftHTML', () => {
    it('should keep allowed tags', () => {
      const html = '<p>Text</p><h2>Heading</h3><ul><li>Item</li></ul><ol><li>Num</li></ol><blockquote>Quote</blockquote><strong>Bold</strong><em>Italic</em><br>';
      const result = (service as any).sanitizeDraftHTML(html);
      expect(result).toBe(html);
    });

    it('should remove script tags and content', () => {
      const result = (service as any).sanitizeDraftHTML('<p>Safe</p><script>alert("xss")</script>');
      expect(result).toBe('<p>Safe</p>');
    });

    it('should remove style tags and content', () => {
      const result = (service as any).sanitizeDraftHTML('<p>Safe</p><style>body{color:red}</style>');
      expect(result).toBe('<p>Safe</p>');
    });

    it('should remove disallowed tags but keep their text content', () => {
      const result = (service as any).sanitizeDraftHTML('<p>Safe</p><div>Bad</div><span>Bad</span><iframe src="evil"></iframe>');
      expect(result).toBe('<p>Safe</p>BadBad');
    });

    it('should preserve attributes on allowed tags', () => {
      const result = (service as any).sanitizeDraftHTML('<p onclick="evil()" class="foo">Text</p>');
      expect(result).toBe('<p onclick="evil()" class="foo">Text</p>');
    });

    it('should handle empty string', () => {
      const result = (service as any).sanitizeDraftHTML('');
      expect(result).toBe('');
    });
  });

  describe('factCheck', () => {
    it('should return fact-check result with score and findings on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          score: 85,
          summary: 'Overall assessment summary',
          findings: [
            { type: 'fact', text: 'Fact A', message: 'Check this', severity: 'info' },
            { type: 'risk', text: 'Risk B', message: 'Be careful', severity: 'warning' },
          ],
        })),
      );

      const result = await service.factCheck('user-id', 'article-id', {
        title: 'Test Article',
        content: '<p>Article content</p>',
      });

      expect(result.score).toBe(85);
      expect(result.summary).toBe('Overall assessment summary');
      expect(result.findings).toHaveLength(2);
      expect(result.findings[0].type).toBe('fact');
      expect(result.findings[1].severity).toBe('warning');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should clamp score to 0-100 range', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          score: 150,
          summary: 'Test',
          findings: [],
        })),
      );

      const resultHigh = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultHigh.score).toBe(100);

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          score: -20,
          summary: 'Test',
          findings: [],
        })),
      );

      const resultLow = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultLow.score).toBe(0);
    });

    it('should default score to 50 when missing', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          summary: 'No score provided',
          findings: [],
        })),
      );

      const result = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.score).toBe(50);
    });

    it('should handle findings that are not an array', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          score: 70,
          summary: 'Test',
          findings: null,
        })),
      );

      const result = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.findings).toEqual([]);
    });

    it('should return fallback on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Network error'));

      const result = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.score).toBe(0);
      expect(result.summary).toContain('暂时不可用');
      expect(result.findings).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should strip HTML tags from content before sending to AI', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          score: 80,
          summary: 'Good',
          findings: [],
        })),
      );

      await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: '<p>Paragraph 1</p><p>Paragraph 2</p>',
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).not.toContain('<p>');
      expect(prompt).toContain('Paragraph 1');
    });
  });

  describe('generateReviewReport', () => {
    it('should return parsed review report on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 78,
          summary: 'Structure is clear, language is fluent',
          dimensions: [
            { name: 'Structure', score: 80, maxScore: 100, comment: 'Good structure' },
            { name: 'Language', score: 75, maxScore: 100, comment: 'Fluent' },
          ],
          suggestions: [
            { dimension: 'Structure', priority: 'high', suggestion: 'Add more background' },
            { dimension: 'Language', priority: 'medium', suggestion: 'Simplify sentences' },
          ],
        })),
      );

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test Article',
        content: 'Article content',
      });

      expect(result.overallScore).toBe(78);
      expect(result.summary).toBe('Structure is clear, language is fluent');
      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[0].name).toBe('Structure');
      expect(result.dimensions[0].score).toBe(80);
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].priority).toBe('high');
      expect(result.suggestions[0].suggestion).toBe('Add more background');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should clamp overallScore to 0-100', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 150,
          summary: 'Test high',
          dimensions: [],
          suggestions: [],
        })),
      );

      const resultHigh = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultHigh.overallScore).toBe(100);

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: -10,
          summary: 'Test low',
          dimensions: [],
          suggestions: [],
        })),
      );

      const resultLow = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultLow.overallScore).toBe(0);
    });

    it('should clamp each dimension score to 0-100', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 50,
          summary: 'Test',
          dimensions: [
            { name: 'Over', score: 200, maxScore: 100, comment: '' },
            { name: 'Under', score: -50, maxScore: 100, comment: '' },
          ],
          suggestions: [],
        })),
      );

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.dimensions[0].score).toBe(100);
      expect(result.dimensions[1].score).toBe(0);
    });

    it('should validate suggestion priority to high/medium/low', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 50,
          summary: 'Test',
          dimensions: [],
          suggestions: [
            { dimension: 'A', priority: 'invalid', suggestion: 'S1' },
            { dimension: 'B', priority: 'high', suggestion: 'S2' },
            { dimension: 'C', priority: null, suggestion: 'S3' },
          ],
        })),
      );

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.suggestions[0].priority).toBe('medium');
      expect(result.suggestions[1].priority).toBe('high');
      expect(result.suggestions[2].priority).toBe('medium');
    });

    it('should return fallback on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Network error'));

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.overallScore).toBe(0);
      expect(result.summary).toContain('失败');
      expect(result.dimensions).toEqual([]);
      expect(result.suggestions).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should handle non-array dimensions and suggestions', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 60,
          summary: 'Test',
          dimensions: null,
          suggestions: 'invalid',
        })),
      );

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.dimensions).toEqual([]);
      expect(result.suggestions).toEqual([]);
    });

    it('should strip HTML tags from content before sending to AI', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 80,
          summary: 'Good',
          dimensions: [],
          suggestions: [],
        })),
      );

      await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: '<p>Paragraph 1</p><p>Paragraph 2</p>',
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).not.toContain('<p>');
      expect(prompt).toContain('Paragraph 1');
    });
  });

  describe('optimizeSEO', () => {
    it('should return full SEO result on success', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 78,
          readabilityScore: 82,
          optimizedTitle: [
            { title: '优化标题1', reasoning: '理由1' },
            { title: '优化标题2', reasoning: '理由2' },
          ],
          metaDescription: '这是元描述',
          keywords: [
            { keyword: '关键词A', searchVolume: 'high' },
            { keyword: '关键词B', searchVolume: 'medium' },
          ],
          suggestions: [
            { category: '标题优化', priority: 'high', suggestion: '改进标题' },
            { category: '内容优化', priority: 'low', suggestion: '补充数据' },
          ],
        })),
      );

      const result = await service.optimizeSEO('user-id', 'article-id', {
        title: '测试文章',
        content: '<p>文章正文内容</p>',
      });

      expect(result.overallScore).toBe(78);
      expect(result.readabilityScore).toBe(82);
      expect(result.optimizedTitle).toHaveLength(2);
      expect(result.optimizedTitle[0].title).toBe('优化标题1');
      expect(result.keywords).toHaveLength(2);
      expect(result.keywords[0].searchVolume).toBe('high');
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].priority).toBe('high');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should clamp overallScore and readabilityScore to 0-100', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 150,
          readabilityScore: -10,
          optimizedTitle: [],
          metaDescription: '',
          keywords: [],
          suggestions: [],
        })),
      );

      const resultHigh = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultHigh.overallScore).toBe(100);
      expect(resultHigh.readabilityScore).toBe(0);

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: -20,
          readabilityScore: 200,
          optimizedTitle: [],
          metaDescription: '',
          keywords: [],
          suggestions: [],
        })),
      );

      const resultLow = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultLow.overallScore).toBe(0);
      expect(resultLow.readabilityScore).toBe(100);
    });

    it('should default scores to 50 when missing', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          optimizedTitle: [],
          keywords: [],
          suggestions: [],
        })),
      );

      const result = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.overallScore).toBe(50);
      expect(result.readabilityScore).toBe(50);
    });

    it('should handle non-array fields gracefully', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 60,
          readabilityScore: 70,
          optimizedTitle: null,
          metaDescription: '描述',
          keywords: 'invalid',
          suggestions: undefined,
        })),
      );

      const result = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.optimizedTitle).toEqual([]);
      expect(result.keywords).toEqual([]);
      expect(result.suggestions).toEqual([]);
    });

    it('should filter out entries with empty title/keyword/suggestion', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 70,
          readabilityScore: 75,
          optimizedTitle: [
            { title: '', reasoning: '空标题应被过滤' },
            { title: '有效标题', reasoning: '保留' },
          ],
          metaDescription: '描述',
          keywords: [
            { keyword: '', searchVolume: 'high' },
            { keyword: '有效关键词', searchVolume: 'low' },
          ],
          suggestions: [
            { category: 'A', priority: 'high', suggestion: '' },
            { category: 'B', priority: 'medium', suggestion: '有效建议' },
          ],
        })),
      );

      const result = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.optimizedTitle).toHaveLength(1);
      expect(result.optimizedTitle[0].title).toBe('有效标题');
      expect(result.keywords).toHaveLength(1);
      expect(result.keywords[0].keyword).toBe('有效关键词');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].suggestion).toBe('有效建议');
    });

    it('should default invalid searchVolume and priority to medium', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 60,
          readabilityScore: 65,
          optimizedTitle: [],
          keywords: [
            { keyword: 'K1', searchVolume: 'invalid_value' },
            { keyword: 'K2', searchVolume: null },
            { keyword: 'K3', searchVolume: 'high' },
          ],
          suggestions: [
            { category: 'C1', priority: 'invalid', suggestion: 'S1' },
            { category: 'C2', priority: 'low', suggestion: 'S2' },
          ],
        })),
      );

      const result = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.keywords[0].searchVolume).toBe('medium');
      expect(result.keywords[1].searchVolume).toBe('medium');
      expect(result.keywords[2].searchVolume).toBe('high');
      expect(result.suggestions[0].priority).toBe('medium');
      expect(result.suggestions[1].priority).toBe('low');
    });

    it('should return zero-value fallback on API failure', async () => {
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Network error'));

      const result = await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.overallScore).toBe(0);
      expect(result.readabilityScore).toBe(0);
      expect(result.optimizedTitle).toEqual([]);
      expect(result.metaDescription).toBe('');
      expect(result.keywords).toEqual([]);
      expect(result.suggestions).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should strip HTML tags from content before sending to AI', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 70,
          readabilityScore: 70,
          optimizedTitle: [],
          keywords: [],
          suggestions: [],
        })),
      );

      await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: '<p>Paragraph 1</p><h2>Heading</h2><p>Paragraph 2</p>',
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).not.toContain('<p>');
      expect(prompt).not.toContain('<h2>');
      expect(prompt).toContain('Paragraph 1');
      expect(prompt).toContain('Heading');
    });

    it('should include language-specific SEO context in prompt', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 70,
          readabilityScore: 70,
          optimizedTitle: [],
          keywords: [],
          suggestions: [],
        })),
      );

      // Simplified Chinese
      await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
        language: 'SIMPLIFIED_CHINESE' as any,
      });
      let prompt = mockChatProvider.chatCompletion.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('中国内地媒体');

      mockChatProvider.chatCompletion.mockClear();
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          overallScore: 70, readabilityScore: 70,
          optimizedTitle: [], keywords: [], suggestions: [],
        })),
      );

      // English
      await service.optimizeSEO('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
        language: 'ENGLISH' as any,
      });
      prompt = mockChatProvider.chatCompletion.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('英语媒体');
    });
  });

  describe('generateArticleImage', () => {
    it('should complete full image generation flow', async () => {
      // Step 1: buildImagePrompt — chatProvider.chatCompletion
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('A professional news photograph of a city skyline at dusk'),
      );

      // Step 2: callSeedream — axios.post
      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [{ url: 'https://seedream.example.com/temp/image.png' }] },
      });

      // Step 3: mock storageService.put to avoid real network/COS calls
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/generated_123.png',
        key: 'cms-ng/articles/article-123/generated_123.png',
      });

      const result = await service.generateArticleImage(
        'user-id',
        'article-123',
        '测试文章标题',
        '<p>文章内容</p>',
        { style: 'news' },
      );

      expect(result.url).toBe('https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/generated_123.png');
      expect(result.prompt).toBe('A professional news photograph of a city skyline at dusk');
      expect(storageMock.put).toHaveBeenCalledWith(
        expect.stringMatching(/^cms-ng\/articles\/article-123\/generated_\d+\.png$/),
        expect.any(Buffer),
        'image/png',
      );
      expect(mockChatProvider.chatCompletion).toHaveBeenCalled();
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should throw when Seedream returns no URL', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('A beautiful landscape'),
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [{}] }, // no url field
      });

      await expect(
        service.generateArticleImage('user-id', 'article-123', 'Title', 'Content'),
      ).rejects.toThrow('Seedream 未返回图片 URL');
    });

    it('should throw when Seedream returns empty data array', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('A beautiful landscape'),
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [] },
      });

      await expect(
        service.generateArticleImage('user-id', 'article-123', 'Title', 'Content'),
      ).rejects.toThrow('Seedream 未返回图片 URL');
    });

    it('should pass style-specific prompt direction to buildImagePrompt', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('Illustration prompt text'),
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [{ url: 'https://example.com/img.png' }] },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/img.png',
        key: 'cms-ng/articles/article-123/img.png',
      });

      await service.generateArticleImage(
        'user-id', 'article-123', 'Title', 'Content',
        { style: 'illustration' },
      );

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const promptText = callArgs[0].messages[1].content;
      expect(promptText).toContain('editorial illustration style');
    });

    it('should include customPrompt in image generation request', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('Custom image prompt'),
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [{ url: 'https://example.com/img.png' }] },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/img.png',
        key: 'cms-ng/articles/article-123/img.png',
      });

      await service.generateArticleImage(
        'user-id', 'article-123', 'Title', 'Content',
        { customPrompt: '突出科技感' },
      );

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const promptText = callArgs[0].messages[1].content;
      expect(promptText).toContain('额外要求：突出科技感');
    });

    it('should pass aspectRatio as pixel-based size to Seedream API', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('Wide format image prompt'),
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [{ url: 'https://example.com/img.png' }] },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/img.png',
        key: 'cms-ng/articles/article-123/img.png',
      });

      await service.generateArticleImage(
        'user-id', 'article-123', 'Title', 'Content',
        { aspectRatio: '16:9', size: '2K' },
      );

      // Verify Seedream was called with pixel-based size (not aspect_ratio)
      const seedreamCall = mockedAxios.post.mock.calls[0];
      expect(seedreamCall[1]).toMatchObject({ size: '2848x1600', output_format: 'jpeg' });
      expect(seedreamCall[1].aspect_ratio).toBeUndefined();
    });

    it('should record AI operation with seedream model', async () => {
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('Image prompt'),
      );

      mockedAxios.post.mockResolvedValueOnce({
        data: { data: [{ url: 'https://example.com/img.png' }] },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/img.png',
        key: 'cms-ng/articles/article-123/img.png',
      });

      await service.generateArticleImage(
        'user-id', 'article-123', 'Title', 'Content',
      );

      const createCall = (prisma.aIOperation.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.agentType).toBe('VISUAL');
      expect(createCall.data.action).toBe('generate_article_image');
      expect(createCall.data.model).toBe('test-seedream-model');
    });
  });

  describe('uploadToStorage', () => {
    it('rejects non-image content types (text/html)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('not an image'),
        headers: { 'content-type': 'text/html' },
      });

      await expect(
        (service as any).uploadToStorage(
          'https://seedream.example.com/temp/x',
          'article-x',
        ),
      ).rejects.toThrow(/Unexpected image content type/);

      // storageService.put must NOT be called when validation fails
      expect(storageMock.put).not.toHaveBeenCalled();
    });

    it('rejects non-image content types with charset suffix (image/png; charset=utf-8 still allowed, but text/html; charset=... rejected)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('not an image'),
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

      await expect(
        (service as any).uploadToStorage(
          'https://seedream.example.com/temp/x',
          'article-x',
        ),
      ).rejects.toThrow(/Unexpected image content type/);
    });

    it('accepts image/png and uploads with .png extension', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt.example.com/cms-ng/articles/article-1/generated_1.png',
        key: 'cms-ng/articles/article-1/generated_1.png',
      });

      const url = await (service as any).uploadToStorage(
        'https://seedream.example.com/temp/x',
        'article-1',
      );

      expect(url).toBe('https://bkt.example.com/cms-ng/articles/article-1/generated_1.png');
      expect(storageMock.put).toHaveBeenCalledWith(
        expect.stringMatching(/^cms-ng\/articles\/article-1\/generated_\d+\.png$/),
        expect.any(Buffer),
        'image/png',
      );
    });

    it('accepts image/jpeg and uploads with .jpg extension', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-jpeg-bytes'),
        headers: { 'content-type': 'image/jpeg' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt.example.com/cms-ng/articles/article-1/generated_1.jpg',
        key: 'cms-ng/articles/article-1/generated_1.jpg',
      });

      const url = await (service as any).uploadToStorage(
        'https://seedream.example.com/temp/x',
        'article-1',
      );

      expect(url).toBe('https://bkt.example.com/cms-ng/articles/article-1/generated_1.jpg');
      expect(storageMock.put).toHaveBeenCalledWith(
        expect.stringMatching(/^cms-ng\/articles\/article-1\/generated_\d+\.jpg$/),
        expect.any(Buffer),
        'image/jpeg',
      );
    });

    it('passes maxContentLength to axios.get to cap download size', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('fake-png-bytes'),
        headers: { 'content-type': 'image/png' },
      });
      storageMock.put.mockResolvedValue({
        url: 'https://bkt.example.com/cms-ng/articles/article-1/generated_1.png',
        key: 'cms-ng/articles/article-1/generated_1.png',
      });

      await (service as any).uploadToStorage(
        'https://seedream.example.com/temp/x',
        'article-1',
      );

      const callArgs = mockedAxios.get.mock.calls[0];
      const opts = callArgs[1];
      expect(opts.maxContentLength).toBe(20 * 1024 * 1024);
      expect(opts.responseType).toBe('arraybuffer');
      expect(opts.timeout).toBe(60_000);
    });
  });

  describe('generateResearchKit', () => {
    it('should return research kit with all four dimensions on success', async () => {
      // Mock search (performSearch → chatCompletionWithTools)
      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse('Latest news summary'),
      );
      // Mock final kit generation
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
          people: [{ name: 'Person A', role: 'Role A', background: 'Background A' }],
          data: [{ label: 'Label 1', value: 'Value 1', source: 'Source 1' }],
          opinions: [{ source: 'Source A', viewpoint: 'Viewpoint A', stance: 'Stance A' }],
        })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Story Title',
        storyDescription: 'Story Description',
        storyAngle: 'Story Angle',
        storyTags: ['tag1', 'tag2'],
      });

      expect(result.timeline).toHaveLength(1);
      expect(result.people).toHaveLength(1);
      expect(result.data).toHaveLength(1);
      expect(result.opinions).toHaveLength(1);
      expect(result.timeline[0].date).toBe('2024-01-01');
      expect(result.people[0].name).toBe('Person A');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should handle missing optional fields in input', async () => {
      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse(''),
      );
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          timeline: [],
          people: [],
          data: [],
          opinions: [],
        })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Story Title',
        storyTags: [],
      });

      expect(result.timeline).toEqual([]);
      expect(result.people).toEqual([]);
      expect(result.data).toEqual([]);
      expect(result.opinions).toEqual([]);
    });

    it('should return empty arrays for non-array response fields', async () => {
      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse('search results'),
      );
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          timeline: null,
          people: 'invalid',
          data: undefined,
          opinions: [{ source: 'S', viewpoint: 'V' }],
        })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Story Title',
        storyTags: ['tag1'],
      });

      expect(result.timeline).toEqual([]);
      expect(result.people).toEqual([]);
      expect(result.data).toEqual([]);
      expect(result.opinions).toHaveLength(1);
    });

    it('should return fallback on API failure', async () => {
      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse(''),
      );
      mockChatProvider.chatCompletion.mockRejectedValue(new Error('Network error'));

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Story Title',
        storyTags: ['tag1'],
      });

      expect(result.timeline).toEqual([]);
      expect(result.people).toEqual([]);
      expect(result.data).toEqual([]);
      expect(result.opinions).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should perform web search via provider tools before generating kit', async () => {
      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse('Latest news summary from search'),
      );
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({
          timeline: [{ date: '2025-06-01', event: 'Event', source: 'Source' }],
          people: [],
          data: [],
          opinions: [],
        })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(mockChatProvider.chatCompletionWithTools).toHaveBeenCalled();
      expect(mockChatProvider.chatCompletion).toHaveBeenCalled();
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].date).toBe('2025-06-01');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should strip markdown json code block from response', async () => {
      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse(''),
      );
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse('```json\n{"timeline":[{"date":"2024-01-01","event":"E1","source":"S1"}],"people":[],"data":[],"opinions":[]}\n```'),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].event).toBe('E1');
    });

    it('should include Wikipedia entries in prompt and result when search succeeds', async () => {
      // Use order-independent mocks: respond based on URL.
      // zh.wikipedia returns a hit; en.wikipedia returns nothing.
      mockedAxios.get.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('zh.wikipedia.org') && urlStr.includes('w/api.php')) {
          return {
            data: { query: { search: [{ title: '香港房屋政策' }] } },
          };
        }
        if (urlStr.includes('zh.wikipedia.org') && urlStr.includes('summary')) {
          return {
            data: {
              type: 'standard',
              title: '香港房屋政策',
              extract: '香港房屋政策是指香港特區政府...',
              content_urls: {
                desktop: { page: 'https://zh.wikipedia.org/wiki/香港房屋政策' },
              },
            },
          };
        }
        // en.wikipedia: empty results (no entries)
        return { data: { query: { search: [] } } };
      });

      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse('search results'),
      );
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({ timeline: [], people: [], data: [], opinions: [] })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: '香港房屋政策最新變化',
        storyTags: ['housing'],
      });

      const callArgs = mockChatProvider.chatCompletion.mock.calls[0];
      const prompt = callArgs[0].messages[1].content;
      expect(prompt).toContain('【Wikipedia 參考資料】');
      expect(prompt).toContain('香港房屋政策');
      expect(prompt).toContain('https://zh.wikipedia.org/wiki/香港房屋政策');
      expect(prompt).toContain('充分利用 Wikipedia 参考资料');
      expect(result.wikipedia).toBeDefined();
      expect(result.wikipedia).toHaveLength(1);
      expect(result.wikipedia![0].title).toBe('香港房屋政策');
    });

    it('should gracefully degrade when Wikipedia search fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network timeout'));

      mockChatProvider.chatCompletionWithTools.mockResolvedValue(
        mockChatResponse(''),
      );
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({ timeline: [], people: [], data: [], opinions: [] })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test Topic',
        storyTags: ['tag1'],
      });

      expect(result.timeline).toEqual([]);
      expect(result.wikipedia).toBeUndefined();
      expect(mockChatProvider.chatCompletion).toHaveBeenCalled();
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback when search fails', async () => {
      mockChatProvider.chatCompletionWithTools.mockRejectedValue(new Error('Search error'));
      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(JSON.stringify({ timeline: [], people: [], data: [], opinions: [] })),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(result.timeline).toEqual([]);
      expect(result.people).toEqual([]);
      expect(result.data).toEqual([]);
      expect(result.opinions).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });
  });

  describe('generateResearchKit — parallel execution (#52)', () => {
    it('should run Wikipedia and Tavily search in parallel (total time ≈ max, not sum)', async () => {
      const wikiSpy = jest
        .spyOn(service as any, 'searchWikipedia')
        .mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 200));
          return [];
        });
      const searchSpy = jest
        .spyOn(service as any, 'performSearch')
        .mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 'tavily summary';
        });

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(
          JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        ),
      );

      const start = Date.now();
      await service.generateResearchKit('user-id', {
        storyTitle: 'Test Topic',
        storyTags: [],
      });
      const elapsed = Date.now() - start;

      expect(wikiSpy).toHaveBeenCalled();
      expect(searchSpy).toHaveBeenCalled();

      // Parallel: total elapsed ≈ max(200, 200) + LLM, not sum (400) + LLM
      expect(elapsed).toBeLessThan(350);
    });

    it('should still call LLM synthesis after both data sources complete', async () => {
      const wikiSpy = jest.spyOn(service as any, 'searchWikipedia').mockResolvedValue([]);
      const searchSpy = jest.spyOn(service as any, 'performSearch').mockResolvedValue('tavily');

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(
          JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        ),
      );

      await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      const wikiOrder = wikiSpy.mock.invocationCallOrder[0];
      const searchOrder = searchSpy.mock.invocationCallOrder[0];
      const llmOrder = mockChatProvider.chatCompletion.mock.invocationCallOrder[0];

      expect(wikiOrder).toBeLessThan(llmOrder);
      expect(searchOrder).toBeLessThan(llmOrder);
    });

    it('should fail-soft if Wikipedia throws but Tavily succeeds', async () => {
      jest
        .spyOn(service as any, 'searchWikipedia')
        .mockRejectedValue(new Error('Wikipedia down'));
      jest.spyOn(service as any, 'performSearch').mockResolvedValue('tavily summary');

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(
          JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        ),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(result).toBeDefined();
      expect(result.timeline).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should fail-soft if Tavily throws but Wikipedia succeeds', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { query: { search: [] } },
      });
      jest
        .spyOn(service as any, 'performSearch')
        .mockRejectedValue(new Error('Tavily down'));

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(
          JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        ),
      );

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(result).toBeDefined();
      expect(result.timeline).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('P95 across 5 sequential runs is < 1.2s with 200ms parallel stubs (#52 perf SLA)', async () => {
      // 5 runs of generateResearchKit, each with both external sources delayed
      // 200ms. If parallelization regresses to sequential, P95 of total time
      // would approach 2*200ms + LLM = ~500ms+; with parallel, the dominant
      // cost per run is just the slower source (~200ms) + LLM. We assert
      // P95 < 1200ms to give margin for CI noise while still catching a
      // doubling of wall time.
      jest
        .spyOn(service as any, 'searchWikipedia')
        .mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 200));
          return [];
        });
      jest
        .spyOn(service as any, 'performSearch')
        .mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 'tavily summary';
        });

      mockChatProvider.chatCompletion.mockResolvedValue(
        mockChatResponse(
          JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        ),
      );

      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await service.generateResearchKit('user-id', {
          storyTitle: `P95 run ${i}`,
          storyTags: [],
        });
        samples.push(Date.now() - start);
      }
      samples.sort((a, b) => a - b);
      // 95th percentile index for 5 samples = index 4 (the max)
      const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
      expect(p95).toBeLessThan(1200);
    });
  });

});

describe('AIService — performSearch branch logic', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let aiTools: AIToolsService;
  let tavilySearch: TavilySearchTool;
  let storageMock: { put: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    prisma = createMockPrismaService();
    storageMock = { put: jest.fn(), delete: jest.fn() };
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          SEEDREAM_API_KEY: 'test-key',
          SEEDREAM_API_BASE: 'https://api.test.com',
          SEEDREAM_MODEL: 'test-model',
          TAVILY_API_KEY: 'test-tavily-key',
        };
        return map[key];
      }),
    };
    tavilySearch = new TavilySearchTool(config as unknown as ConfigService);
    aiTools = new AIToolsService(tavilySearch);
  });

  it('should use Kimi built-in search when SEARCH_PROVIDER=kimi and provider is KimiProvider', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          SEARCH_PROVIDER: 'kimi',
          SEEDREAM_API_KEY: 'test-key',
          SEEDREAM_API_BASE: 'https://api.test.com',
          SEEDREAM_MODEL: 'test-model',
          TAVILY_API_KEY: 'test-tavily-key',
        };
        return map[key];
      }),
    };

    // Use a real KimiProvider instance with mocked axios
    const kimiProvider = new KimiProvider(config as unknown as ConfigService);

    // Mock chatCompletionWithBuiltinSearch on the real instance
    jest.spyOn(kimiProvider, 'chatCompletionWithBuiltinSearch').mockResolvedValue({
      content: 'Kimi built-in search results',
      finishReason: 'stop',
    });
    jest.spyOn(kimiProvider, 'chatCompletion').mockResolvedValue({
      content: JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
      finishReason: 'stop',
    });

    const billingMock = {
      isEnabled: jest.fn().mockReturnValue(false),
      checkBalance: jest.fn().mockResolvedValue(true),
      deduct: jest.fn().mockResolvedValue(null),
      getConfig: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AIToolsService, useValue: aiTools },
        { provide: CHAT_PROVIDER, useValue: kimiProvider },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: BillingService, useValue: billingMock },
      ],
    }).compile();

    const svc = module.get<AIService>(AIService);
    mockedAxios.get.mockRejectedValue(new Error('no wikipedia'));

    await svc.generateResearchKit('user-id', {
      storyTitle: 'Test Topic',
      storyTags: [],
    });

    expect(kimiProvider.chatCompletionWithBuiltinSearch).toHaveBeenCalled();
  });

  it('should fall back to Tavily when SEARCH_PROVIDER=kimi but provider is NOT KimiProvider', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          SEARCH_PROVIDER: 'kimi',
          SEEDREAM_API_KEY: 'test-key',
          SEEDREAM_API_BASE: 'https://api.test.com',
          SEEDREAM_MODEL: 'test-model',
          TAVILY_API_KEY: 'test-tavily-key',
        };
        return map[key];
      }),
    };

    // Use a plain mock provider (NOT a KimiProvider instance)
    const mockProvider = {
      providerName: 'deepseek',
      model: 'test-model',
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        finishReason: 'stop',
      }),
      chatCompletionWithTools: jest.fn().mockResolvedValue({
        content: 'Tavily search results via fallback',
        finishReason: 'stop',
      }),
    };

    const billingMock = {
      isEnabled: jest.fn().mockReturnValue(false),
      checkBalance: jest.fn().mockResolvedValue(true),
      deduct: jest.fn().mockResolvedValue(null),
      getConfig: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AIToolsService, useValue: aiTools },
        { provide: CHAT_PROVIDER, useValue: mockProvider },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: BillingService, useValue: billingMock },
      ],
    }).compile();

    const svc = module.get<AIService>(AIService);
    mockedAxios.get.mockRejectedValue(new Error('no wikipedia'));

    await svc.generateResearchKit('user-id', {
      storyTitle: 'Test Topic',
      storyTags: [],
    });

    // Should NOT call chatCompletionWithBuiltinSearch (provider is not KimiProvider)
    // Instead, should use chatCompletionWithTools (Tavily fallback)
    expect(mockProvider.chatCompletionWithTools).toHaveBeenCalled();
  });

  it('should use Tavily search when SEARCH_PROVIDER=tavily regardless of provider type', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          SEARCH_PROVIDER: 'tavily',
          SEEDREAM_API_KEY: 'test-key',
          SEEDREAM_API_BASE: 'https://api.test.com',
          SEEDREAM_MODEL: 'test-model',
          TAVILY_API_KEY: 'test-tavily-key',
        };
        return map[key];
      }),
    };

    const mockProvider = {
      providerName: 'test',
      model: 'test-model',
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }),
        finishReason: 'stop',
      }),
      chatCompletionWithTools: jest.fn().mockResolvedValue({
        content: 'Tavily search results',
        finishReason: 'stop',
      }),
    };

    const billingMock = {
      isEnabled: jest.fn().mockReturnValue(false),
      checkBalance: jest.fn().mockResolvedValue(true),
      deduct: jest.fn().mockResolvedValue(null),
      getConfig: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AIToolsService, useValue: aiTools },
        { provide: CHAT_PROVIDER, useValue: mockProvider },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: BillingService, useValue: billingMock },
      ],
    }).compile();

    const svc = module.get<AIService>(AIService);
    mockedAxios.get.mockRejectedValue(new Error('no wikipedia'));

    await svc.generateResearchKit('user-id', {
      storyTitle: 'Test Topic',
      storyTags: [],
    });

    expect(mockProvider.chatCompletionWithTools).toHaveBeenCalled();
  });
});
