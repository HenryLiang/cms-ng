import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { KimiProvider } from './kimi.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function createProvider(env: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
  return new KimiProvider(config);
}

describe('KimiProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports providerName kimi', () => {
    const provider = createProvider({ KIMI_API_KEY: 'k' });
    expect(provider.providerName).toBe('kimi');
  });

  it('clamps temperature to 1 — the only value the Kimi coding endpoint accepts', async () => {
    const provider = createProvider({ KIMI_API_KEY: 'k' });
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      },
    });

    await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.2,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({ temperature: 1 }),
      expect.anything(),
    );
  });

  it('keeps temperature 1 when the request already asks for it', async () => {
    const provider = createProvider({ KIMI_API_KEY: 'k' });
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      },
    });

    await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 1,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({ temperature: 1 }),
      expect.anything(),
    );
  });

  it('uses the configured model and API base', async () => {
    const provider = createProvider({
      KIMI_API_KEY: 'k',
      KIMI_API_BASE: 'https://api.example.com/v1',
      KIMI_MODEL: 'kimi-k2.7',
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      },
    });

    await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ model: 'kimi-k2.7' }),
      expect.anything(),
    );
  });
});
