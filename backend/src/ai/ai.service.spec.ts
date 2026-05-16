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
  });

});
