import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { TavilySearchTool } from './tavily-search.tool';

jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TavilySearchTool', () => {
  let tool: TavilySearchTool;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          TAVILY_API_KEY: 'test-tavily-key',
          TAVILY_SEARCH_DEPTH: 'advanced',
          TAVILY_MAX_RESULTS: '5',
          TAVILY_MAX_RESULTS_LIMIT: '10',
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TavilySearchTool,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    tool = module.get<TavilySearchTool>(TavilySearchTool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('name', () => {
    it('should return tavily_search', () => {
      expect(tool.name).toBe('tavily_search');
    });
  });

  describe('getDefinition', () => {
    it('should return valid tool definition', () => {
      const def = tool.getDefinition();

      expect(def.type).toBe('function');
      expect(def.function.name).toBe('tavily_search');
      expect(def.function.description).toContain('Tavily');
      expect(def.function.parameters.type).toBe('object');
      expect(def.function.parameters.required).toContain('query');
      expect(def.function.parameters.properties.query).toBeDefined();
      expect(def.function.parameters.properties.search_depth).toBeDefined();
      expect(def.function.parameters.properties.max_results).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should call Tavily API with correct parameters', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          query: 'test query',
          answer: 'Test answer',
          results: [
            {
              title: 'Result 1',
              url: 'https://example.com/1',
              content: 'Content 1',
              score: 0.9,
              published_date: '2024-01-15',
            },
            {
              title: 'Result 2',
              url: 'https://example.com/2',
              content: 'Content 2',
              score: 0.8,
            },
          ],
          response_time: 1.23,
        },
      });

      const result = (await tool.execute({ query: 'test query' })) as any;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.tavily.com/search');
      expect(callArgs[1]).toMatchObject({
        api_key: 'test-tavily-key',
        query: 'test query',
        search_depth: 'advanced',
        max_results: 5,
        include_answer: true,
        topic: 'general',
      });

      expect(result.answer).toBe('Test answer');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe('Result 1');
      expect(result.results[0].published_date).toBe('2024-01-15');
      expect(result.results[1].published_date).toBeNull();
    });

    it('should use custom parameters when provided', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { query: 'test', answer: '', results: [], response_time: 0.5 },
      });

      await tool.execute({
        query: 'custom query',
        search_depth: 'advanced',
        max_results: 10,
        include_answer: false,
        time_range: 'month',
        topic: 'news',
      });

      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[1]).toMatchObject({
        query: 'custom query',
        search_depth: 'advanced',
        max_results: 10,
        include_answer: false,
        time_range: 'month',
        topic: 'news',
      });
    });

    it('should clamp max_results to 1-10 range', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { query: 'test', answer: '', results: [], response_time: 0.5 },
      });

      await tool.execute({ query: 'test', max_results: 50 });
      expect(mockedAxios.post.mock.calls[0][1].max_results).toBe(10);

      jest.clearAllMocks();
      mockedAxios.post.mockResolvedValue({
        data: { query: 'test', answer: '', results: [], response_time: 0.5 },
      });

      await tool.execute({ query: 'test', max_results: 0 });
      expect(mockedAxios.post.mock.calls[0][1].max_results).toBe(1);
    });

    it('should not include time_range when not provided', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { query: 'test', answer: '', results: [], response_time: 0.5 },
      });

      await tool.execute({ query: 'test' });

      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[1].time_range).toBeUndefined();
    });

    it('should return error when API key is not configured', async () => {
      config.get.mockReturnValue(undefined);

      const unconfiguredTool = new TavilySearchTool(
        config as unknown as ConfigService,
      );
      const result = await unconfiguredTool.execute({ query: 'test' });

      expect(result).toEqual({ error: 'Tavily API key not configured' });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return error when query is empty', async () => {
      const result = await tool.execute({ query: '' });

      expect(result).toEqual({ error: 'Query is required' });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle API failure gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = (await tool.execute({ query: 'test' })) as any;

      expect(result.error).toBe('Search failed');
      expect(result.message).toBe('Network error');
    });

    it('should handle API failure with response data', async () => {
      const error = new Error('Bad request') as any;
      error.response = { data: { detail: 'Invalid API key' } };
      mockedAxios.post.mockRejectedValue(error);

      const result = (await tool.execute({ query: 'test' })) as any;

      expect(result.error).toBe('Search failed');
      expect(result.message).toBe('Bad request');
    });

    it('should format response correctly with minimal data', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          query: 'test',
          results: [],
        },
      });

      const result = (await tool.execute({ query: 'test' })) as any;

      expect(result.answer).toBe('');
      expect(result.results).toEqual([]);
      expect(result.response_time).toBe(0);
    });
  });
});
