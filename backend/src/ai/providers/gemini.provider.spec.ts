import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GeminiProvider } from './gemini.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GeminiProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends chat completions through the official OpenAI-compatible endpoint', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const env: Record<string, string> = {
          GEMINI_API_KEY: 'gemini-test-key',
        };
        return env[key];
      }),
    } as unknown as ConfigService;
    const provider = new GeminiProvider(config);

    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: { content: 'Gemini response' },
            finish_reason: 'stop',
          },
        ],
      },
    });

    const result = await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.content).toBe('Gemini response');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({
        model: 'gemini-3.6-flash',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer gemini-test-key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('normalizes a custom API base with a trailing slash', async () => {
    const config = {
      get: jest.fn((key: string) => {
        const env: Record<string, string> = {
          GEMINI_API_KEY: 'gemini-test-key',
          GEMINI_API_BASE: 'https://gemini.example.test/openai/',
        };
        return env[key];
      }),
    } as unknown as ConfigService;
    const provider = new GeminiProvider(config);

    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: { content: 'Gemini response' },
            finish_reason: 'stop',
          },
        ],
      },
    });

    await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://gemini.example.test/openai/chat/completions',
      expect.any(Object),
      expect.any(Object),
    );
  });
});
