import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AIService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { AIToolsService } from './tools/ai-tools.service';
import { TavilySearchTool } from './tools/tavily-search.tool';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AIService', () => {
  let service: AIService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: { get: jest.Mock };
  let aiTools: AIToolsService;
  let tavilySearch: TavilySearchTool;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    prisma = createMockPrismaService();
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          KIMI_API_KEY: 'test-key',
          KIMI_API_BASE: 'https://api.test.com',
          KIMI_MODEL: 'test-model',
          SEEDREAM_API_KEY: 'test-seedream-key',
          SEEDREAM_API_BASE: 'https://api.test.com/seedream',
          SEEDREAM_MODEL: 'test-seedream-model',
          UPLOAD_DIR: './uploads',
          SEARCH_PROVIDER: 'kimi',
          TAVILY_API_KEY: 'test-tavily-key',
        };
        return map[key];
      }),
    };

    tavilySearch = new TavilySearchTool(config as unknown as ConfigService);
    aiTools = new AIToolsService(tavilySearch);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AIToolsService, useValue: aiTools },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockAIResponse = (content: string, usage?: any) => ({
    data: {
      choices: [{ message: { content } }],
      usage: usage || { total_tokens: 100 },
    },
  });

  describe('generateStorySuggestions', () => {
    it('should return suggestions on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('[{"title":"T1","description":"D1","suggestedAngle":"A1","reason":"R1"}]'));

      const result = await service.generateStorySuggestions('user-id', {
        name: 'Test',
        expertise: ['tech'],
        department: 'News',
      });

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('T1');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse('Rewritten text'));

      const result = await service.rewriteText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Rewritten text');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return original text on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.rewriteText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Original');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });
  });

  describe('expandText', () => {
    it('should return expanded text on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('Expanded text'));

      const result = await service.expandText('user-id', 'article-id', { text: 'Short' });

      expect(result).toBe('Expanded text');
    });

    it('should return original text on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.expandText('user-id', 'article-id', { text: 'Short' });

      expect(result).toBe('Short');
    });
  });

  describe('condenseText', () => {
    it('should return condensed text on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('Short'));

      const result = await service.condenseText('user-id', 'article-id', { text: 'Long text here' });

      expect(result).toBe('Short');
    });

    it('should return original text on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.condenseText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Original');
    });
  });

  describe('polishText', () => {
    it('should return polished text on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('Polished'));

      const result = await service.polishText('user-id', 'article-id', { text: 'Rough' });

      expect(result).toBe('Polished');
    });

    it('should return original text on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.polishText('user-id', 'article-id', { text: 'Original' });

      expect(result).toBe('Original');
    });
  });

  describe('generateHeadlines', () => {
    it('should return headlines on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('[{"title":"H1","style":"s","reasoning":"r"}]'));

      const result = await service.generateHeadlines('user-id', 'article-id', { title: 'Article', content: 'Body' });

      expect(result).toHaveLength(1);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.generateHeadlines('user-id', 'article-id', { title: 'Article', content: 'Body' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toContain('Article');
    });
  });

  describe('generateExcerpt', () => {
    it('should return excerpt on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('Summary'));

      const result = await service.generateExcerpt('user-id', 'article-id', { title: 'T', content: 'Body text' });

      expect(result).toBe('Summary');
    });

    it('should return content slice on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.generateExcerpt('user-id', 'article-id', { title: 'T', content: 'Body text' });

      expect(result).toBe('Body text');
    });
  });

  describe('chatWithAI', () => {
    it('should return reply on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse('AI reply'));

      const result = await service.chatWithAI('user-id', 'article-id', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toBe('AI reply');
    });

    it('should return error message on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.chatWithAI('user-id', 'article-id', {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toContain('暂时无法回答');
    });
  });

  describe('generateDraft', () => {
    it('should return parsed draft on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        title: 'Draft Title',
        subtitle: 'Draft Subtitle',
        content: '<p>Draft content</p>',
      })));

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
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

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
      mockedAxios.post.mockRejectedValue(new Error('Fail'));

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
      });

      expect(result.title).toBe('Story Title');
    });

    it('should inject formatted research kit into prompt', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        title: 'Draft Title',
        content: '<p>Content</p>',
      })));

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

      const callArgs = mockedAxios.post.mock.calls[0];
      const prompt = callArgs[1].messages[1].content;
      expect(prompt).toContain('【事件時間線】');
      expect(prompt).toContain('2024-01-01：Event 1（來源：Source 1）');
      expect(prompt).toContain('【關鍵人物】');
      expect(prompt).toContain('Person A（Role A）：Background A');
      expect(prompt).toContain('【核心數據】');
      expect(prompt).toContain('Label 1：Value 1（來源：Source 1）');
      expect(prompt).toContain('【各方觀點】');
      expect(prompt).toContain('Source A（Stance A）：Viewpoint A');
      expect(prompt).toContain('请充分利用上述背景资料撰写初稿');
    });

    it('should skip empty research kit sections in prompt', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        title: 'Draft Title',
        content: '<p>Content</p>',
      })));

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

      const callArgs = mockedAxios.post.mock.calls[0];
      const prompt = callArgs[1].messages[1].content;
      expect(prompt).not.toContain('【事件時間線】');
      expect(prompt).not.toContain('【核心數據】');
      expect(prompt).not.toContain('【各方觀點】');
      expect(prompt).toContain('【關鍵人物】');
    });

    it('should use instruction in prompt when provided', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        title: 'Draft Title',
        content: '<p>Content</p>',
      })));

      await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
        instruction: '侧重民生角度',
      });

      const callArgs = mockedAxios.post.mock.calls[0];
      const prompt = callArgs[1].messages[1].content;
      expect(prompt).toContain('额外要求：侧重民生角度');
    });

    it('should sanitize HTML in draft content', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        title: 'Draft Title',
        content: '<p>Safe</p><script>alert("xss")</script><style>body{color:red}</style><iframe src="evil"></iframe>',
      })));

      const result = await service.generateDraft('user-id', 'article-id', {
        storyTitle: 'Story Title',
        storyTags: [],
      });

      expect(result.content).toBe('<p>Safe</p>');
    });

    it('should fallback to currentTitle when AI returns no title', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        subtitle: 'Sub',
        content: '<p>C</p>',
      })));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        score: 85,
        summary: 'Overall assessment summary',
        findings: [
          { type: 'fact', text: 'Fact A', message: 'Check this', severity: 'info' },
          { type: 'risk', text: 'Risk B', message: 'Be careful', severity: 'warning' },
        ],
      })));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        score: 150,
        summary: 'Test',
        findings: [],
      })));

      const resultHigh = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultHigh.score).toBe(100);

      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        score: -20,
        summary: 'Test',
        findings: [],
      })));

      const resultLow = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultLow.score).toBe(0);
    });

    it('should default score to 50 when missing', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        summary: 'No score provided',
        findings: [],
      })));

      const result = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.score).toBe(50);
    });

    it('should handle findings that are not an array', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        score: 70,
        summary: 'Test',
        findings: null,
      })));

      const result = await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.findings).toEqual([]);
    });

    it('should return fallback on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        score: 80,
        summary: 'Good',
        findings: [],
      })));

      await service.factCheck('user-id', 'article-id', {
        title: 'Test',
        content: '<p>Paragraph 1</p><p>Paragraph 2</p>',
      });

      const callArgs = mockedAxios.post.mock.calls[0];
      const requestBody = callArgs[1];
      const prompt = requestBody.messages[1].content;
      expect(prompt).not.toContain('<p>');
      expect(prompt).toContain('Paragraph 1');
    });
  });

  describe('generateReviewReport', () => {
    it('should return parsed review report on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
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
      })));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        overallScore: 150,
        summary: 'Test high',
        dimensions: [],
        suggestions: [],
      })));

      const resultHigh = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultHigh.overallScore).toBe(100);

      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        overallScore: -10,
        summary: 'Test low',
        dimensions: [],
        suggestions: [],
      })));

      const resultLow = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(resultLow.overallScore).toBe(0);
    });

    it('should clamp each dimension score to 0-100', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        overallScore: 50,
        summary: 'Test',
        dimensions: [
          { name: 'Over', score: 200, maxScore: 100, comment: '' },
          { name: 'Under', score: -50, maxScore: 100, comment: '' },
        ],
        suggestions: [],
      })));

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.dimensions[0].score).toBe(100);
      expect(result.dimensions[1].score).toBe(0);
    });

    it('should validate suggestion priority to high/medium/low', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        overallScore: 50,
        summary: 'Test',
        dimensions: [],
        suggestions: [
          { dimension: 'A', priority: 'invalid', suggestion: 'S1' },
          { dimension: 'B', priority: 'high', suggestion: 'S2' },
          { dimension: 'C', priority: null, suggestion: 'S3' },
        ],
      })));

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.suggestions[0].priority).toBe('medium');
      expect(result.suggestions[1].priority).toBe('high');
      expect(result.suggestions[2].priority).toBe('medium');
    });

    it('should return fallback on API failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        overallScore: 60,
        summary: 'Test',
        dimensions: null,
        suggestions: 'invalid',
      })));

      const result = await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: 'Content',
      });

      expect(result.dimensions).toEqual([]);
      expect(result.suggestions).toEqual([]);
    });

    it('should strip HTML tags from content before sending to AI', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        overallScore: 80,
        summary: 'Good',
        dimensions: [],
        suggestions: [],
      })));

      await service.generateReviewReport('user-id', 'article-id', {
        title: 'Test',
        content: '<p>Paragraph 1</p><p>Paragraph 2</p>',
      });

      const callArgs = mockedAxios.post.mock.calls[0];
      const requestBody = callArgs[1];
      const prompt = requestBody.messages[1].content;
      expect(prompt).not.toContain('<p>');
      expect(prompt).toContain('Paragraph 1');
    });
  });

  describe('callKimiWithWebSearch', () => {
    it('should return round1 response directly when tool_calls not triggered', async () => {
      const round1Response = {
        data: {
          choices: [{
            message: { content: '{"result":"direct"}' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 50 },
        },
      };
      mockedAxios.post.mockResolvedValue(round1Response);

      const result = await (service as any).callKimiWithWebSearch(
        [{ role: 'user', content: 'Hello' }],
        0.4,
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(round1Response);
      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[1].tools).toEqual([{
        type: 'builtin_function',
        function: { name: '$web_search' },
      }]);
      expect(callArgs[1].temperature).toBe(0.4);
      expect(callArgs[1].response_format).toBeUndefined();
      expect(callArgs[1].messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should perform two-round call when tool_calls is triggered', async () => {
      const round1Response = {
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_abc123',
                function: { name: '$web_search', arguments: '{"query":"test"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      };
      const round2Response = {
        data: {
          choices: [{
            message: { content: '{"result":"searched"}' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 200 },
        },
      };
      mockedAxios.post
        .mockResolvedValueOnce(round1Response)
        .mockResolvedValueOnce(round2Response);

      const result = await (service as any).callKimiWithWebSearch(
        [{ role: 'user', content: 'Hello' }],
        0.7,
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      const round2CallArgs = mockedAxios.post.mock.calls[1];
      const round2Body = round2CallArgs[1];
      expect(round2Body.messages).toHaveLength(3);
      expect(round2Body.messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(round2Body.messages[1].role).toBe('assistant');
      expect(round2Body.messages[1].content).toBe('');
      expect(round2Body.messages[1].tool_calls).toEqual([{
        id: 'call_abc123',
        function: { name: '$web_search', arguments: '{"query":"test"}' },
      }]);
      expect(round2Body.messages[2].role).toBe('tool');
      expect(round2Body.messages[2].tool_call_id).toBe('call_abc123');
      expect(round2Body.messages[2].name).toBe('$web_search');
      expect(round2Body.messages[2].content).toBe('{"query":"test"}');
      expect(round2Body.response_format).toBeUndefined();
    });

    it('should handle multiple tool_calls in round2', async () => {
      const round1Response = {
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [
                { id: 'call_1', function: { name: '$web_search', arguments: '{"q":"a"}' } },
                { id: 'call_2', function: { name: '$web_search', arguments: '{"q":"b"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      };
      const round2Response = {
        data: {
          choices: [{
            message: { content: 'Final' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 150 },
        },
      };
      mockedAxios.post
        .mockResolvedValueOnce(round1Response)
        .mockResolvedValueOnce(round2Response);

      const result = await (service as any).callKimiWithWebSearch(
        [{ role: 'system', content: 'Sys' }],
        0.5,
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const round2Body = mockedAxios.post.mock.calls[1][1];
      expect(round2Body.messages).toHaveLength(4);
      expect(round2Body.messages[2].role).toBe('tool');
      expect(round2Body.messages[2].tool_call_id).toBe('call_1');
      expect(round2Body.messages[3].role).toBe('tool');
      expect(round2Body.messages[3].tool_call_id).toBe('call_2');
      expect(result.data.choices[0].message.content).toBe('Final');
    });

    it('should handle missing choice in round1', async () => {
      const round1Response = {
        data: { choices: [] },
      };
      mockedAxios.post.mockResolvedValue(round1Response);

      const result = await (service as any).callKimiWithWebSearch(
        [{ role: 'user', content: 'Hello' }],
        0.4,
      );

      expect(result).toEqual(round1Response);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should use 300s timeout', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [{
            message: { content: 'OK', finish_reason: 'stop' },
          }],
          usage: {},
        },
      });

      await (service as any).callKimiWithWebSearch([{ role: 'user', content: 'Test' }], 0.5);

      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[2].timeout).toBe(300000);
    });
  });

  describe('callKimiWithCustomTools', () => {
    it('should return round1 response when tool_calls not triggered', async () => {
      const round1Response = {
        data: {
          choices: [{
            message: { content: 'Direct answer' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 50 },
        },
      };
      mockedAxios.post.mockResolvedValue(round1Response);

      const result = await (service as any).callKimiWithCustomTools(
        [{ role: 'user', content: 'Hello' }],
        0.4,
        [{ type: 'function', function: { name: 'test_tool', description: 'Test', parameters: { type: 'object', properties: {} } } }],
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(round1Response);
      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[1].tools).toHaveLength(1);
      expect(callArgs[1].tools[0].function.name).toBe('test_tool');
    });

    it('should perform two-round call with tool execution', async () => {
      const toolDef = {
        type: 'function',
        function: {
          name: 'tavily_search',
          description: 'Search web',
          parameters: { type: 'object', properties: {} },
        },
      };

      const round1Response = {
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_tav_1',
                function: { name: 'tavily_search', arguments: '{"query":"test news"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      };
      const round2Response = {
        data: {
          choices: [{
            message: { content: 'Search result summary' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 200 },
        },
      };
      mockedAxios.post
        .mockResolvedValueOnce(round1Response)
        .mockResolvedValueOnce(round2Response);

      jest.spyOn(aiTools, 'executeTool').mockResolvedValue({ answer: 'Found it', results: [] });

      const result = await (service as any).callKimiWithCustomTools(
        [{ role: 'user', content: 'Hello' }],
        0.7,
        [toolDef],
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(aiTools.executeTool).toHaveBeenCalledWith('tavily_search', { query: 'test news' });

      const round2Body = mockedAxios.post.mock.calls[1][1];
      expect(round2Body.messages).toHaveLength(3);
      expect(round2Body.messages[1].role).toBe('assistant');
      expect(round2Body.messages[2].role).toBe('tool');
      expect(round2Body.messages[2].tool_call_id).toBe('call_tav_1');
      expect(round2Body.messages[2].content).toContain('Found it');
    });

    it('should handle tool execution error gracefully', async () => {
      const toolDef = {
        type: 'function',
        function: {
          name: 'tavily_search',
          description: 'Search web',
          parameters: { type: 'object', properties: {} },
        },
      };

      const round1Response = {
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_err',
                function: { name: 'tavily_search', arguments: '{}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      };
      const round2Response = {
        data: {
          choices: [{
            message: { content: 'Handled error' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 150 },
        },
      };
      mockedAxios.post
        .mockResolvedValueOnce(round1Response)
        .mockResolvedValueOnce(round2Response);

      jest.spyOn(aiTools, 'executeTool').mockRejectedValue(new Error('Tool failed'));

      const result = await (service as any).callKimiWithCustomTools(
        [{ role: 'user', content: 'Hello' }],
        0.5,
        [toolDef],
      );

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const round2Body = mockedAxios.post.mock.calls[1][1];
      expect(round2Body.messages[2].content).toContain('error');
      expect(result.data.choices[0].message.content).toBe('Handled error');
    });
  });

  describe('searchLatestNewsWithTavily', () => {
    it('should return search results via Tavily tool', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_tav',
                function: { name: 'tavily_search', arguments: '{"query":"AI news"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: { content: 'Latest AI news summary' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 200 },
        },
      });

      jest.spyOn(aiTools, 'executeTool').mockResolvedValue({
        answer: 'AI is advancing rapidly',
        results: [{ title: 'AI News', url: 'https://example.com', content: '...' }],
      });

      const result = await (service as any).searchLatestNewsWithTavily('AI news');
      expect(result).toBe('Latest AI news summary');
      expect(aiTools.executeTool).toHaveBeenCalledWith('tavily_search', { query: 'AI news' });
    });

    it('should return empty string when tavily tool is not available', async () => {
      jest.spyOn(aiTools, 'getToolDefinition').mockReturnValue(undefined);

      const result = await (service as any).searchLatestNewsWithTavily('test');
      expect(result).toBe('');
    });
  });

  describe('generateResearchKit', () => {
    it('should return research kit with all four dimensions on success', async () => {
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
        people: [{ name: 'Person A', role: 'Role A', background: 'Background A' }],
        data: [{ label: 'Label 1', value: 'Value 1', source: 'Source 1' }],
        opinions: [{ source: 'Source A', viewpoint: 'Viewpoint A', stance: 'Stance A' }],
      })));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        timeline: [],
        people: [],
        data: [],
        opinions: [],
      })));

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
      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        timeline: null,
        people: 'invalid',
        data: undefined,
        opinions: [{ source: 'S', viewpoint: 'V' }],
      })));

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
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

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

    it('should perform two-round web search when tool_calls triggered', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{ id: 'tc1', function: { name: '$web_search', arguments: '{}' } }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: { content: 'Latest news summary from search' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 200 },
        },
      });
      mockedAxios.post.mockResolvedValueOnce(mockAIResponse(JSON.stringify({
        timeline: [{ date: '2025-06-01', event: 'Event', source: 'Source' }],
        people: [],
        data: [],
        opinions: [],
      })));

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].date).toBe('2025-06-01');
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should strip markdown json code block from response', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [{
            message: { content: '```json\n{"timeline":[{"date":"2024-01-01","event":"E1","source":"S1"}],"people":[],"data":[],"opinions":[]}\n```' },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 100 },
        },
      });

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].event).toBe('E1');
    });

    it('should include Wikipedia entries in prompt and result when search succeeds', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          query: {
            search: [{ title: '香港房屋政策' }],
          },
        },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          type: 'standard',
          title: '香港房屋政策',
          extract: '香港房屋政策是指香港特區政府...',
          content_urls: {
            desktop: { page: 'https://zh.wikipedia.org/wiki/香港房屋政策' },
          },
        },
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [{
            message: { content: JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }) },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 100 },
        },
      });

      const result = await service.generateResearchKit('user-id', {
        storyTitle: '香港房屋政策最新變化',
        storyTags: ['housing'],
      });

      // searchLatestNews 也会调用 axios.post，Step 3 的调用在最后
      const step3Call = mockedAxios.post.mock.calls.find(
        (call) => call[1]?.messages?.[1]?.content?.includes('【Wikipedia 參考資料】'),
      );
      expect(step3Call).toBeDefined();
      const prompt = step3Call![1].messages[1].content;
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

      mockedAxios.post.mockResolvedValue({
        data: {
          choices: [{
            message: { content: JSON.stringify({ timeline: [], people: [], data: [], opinions: [] }) },
            finish_reason: 'stop',
          }],
          usage: { total_tokens: 100 },
        },
      });

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test Topic',
        storyTags: ['tag1'],
      });

      expect(result.timeline).toEqual([]);
      expect(result.wikipedia).toBeUndefined();
      expect(mockedAxios.post).toHaveBeenCalled();
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });

    it('should return fallback when round2 fails in web search flow', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: '',
              tool_calls: [{ id: 'tc1', function: { name: '$web_search', arguments: '{}' } }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { total_tokens: 50 },
        },
      });
      mockedAxios.post.mockRejectedValueOnce(new Error('Round2 timeout'));

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

    it('should use Tavily search when SEARCH_PROVIDER is tavily', async () => {
      (service as any).searchProvider = 'tavily';

      const tavilySpy = jest.spyOn(service as any, 'searchLatestNewsWithTavily').mockResolvedValue('Tavily search results');
      const kimiSpy = jest.spyOn(service as any, 'searchLatestNews');

      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        timeline: [{ date: '2024-06-01', event: 'E1', source: 'S1' }],
        people: [],
        data: [],
        opinions: [],
      })));

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test Topic',
        storyTags: ['tag1'],
      });

      expect(tavilySpy).toHaveBeenCalledWith('Test Topic');
      expect(kimiSpy).not.toHaveBeenCalled();
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].date).toBe('2024-06-01');
    });

    it('should gracefully degrade when Tavily search fails', async () => {
      (service as any).searchProvider = 'tavily';

      jest.spyOn(service as any, 'searchLatestNewsWithTavily').mockRejectedValue(new Error('Tavily error'));

      mockedAxios.post.mockResolvedValue(mockAIResponse(JSON.stringify({
        timeline: [],
        people: [],
        data: [],
        opinions: [],
      })));

      const result = await service.generateResearchKit('user-id', {
        storyTitle: 'Test',
        storyTags: [],
      });

      expect(result.timeline).toEqual([]);
      expect(prisma.aIOperation.create).toHaveBeenCalled();
    });
  });

});
