import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AIService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AIService', () => {
  let service: AIService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: { get: jest.Mock };

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
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
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
  });

});
