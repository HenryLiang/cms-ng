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

  it('透传多模态消息(image_url content part)到 HTTP body', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'GEMINI_API_KEY' ? 'k' : undefined,
      ),
    } as unknown as ConfigService;
    const provider = new GeminiProvider(config);

    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      },
    });

    const multimodalContent = [
      { type: 'text' as const, text: 'describe' },
      { type: 'image_url' as const, image_url: { url: 'https://bkt/img.png' } },
    ];
    await provider.chatCompletion({
      messages: [{ role: 'user', content: multimodalContent }],
    });

    const body = mockedAxios.post.mock.calls[0][1];
    expect(body.messages[0].content).toEqual(multimodalContent);
  });

  it('日志脱敏:base64 data URI 不进 request body 日志', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'GEMINI_API_KEY' ? 'k' : undefined,
      ),
    } as unknown as ConfigService;
    const provider = new GeminiProvider(config);
    const logSpy = jest.spyOn(provider['logger'], 'log');

    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      },
    });

    const b64 = 'data:image/png;base64,' + 'A'.repeat(10000);
    await provider.chatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 't' },
            { type: 'image_url', image_url: { url: b64 } },
          ],
        },
      ],
    });

    const reqLog = logSpy.mock.calls.find((c) =>
      String(c[0]).includes('request body'),
    )?.[0] as string;
    expect(reqLog).toContain('[base64 data');
    expect(reqLog).not.toContain('AAAA'); // base64 载荷不泄漏
  });
});
