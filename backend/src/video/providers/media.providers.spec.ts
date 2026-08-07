import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createMock } from '../../common/test-helpers';
import { createImageGenProvider } from './image-gen/image-gen-provider.factory';
import { MinimaxImageProvider } from './image-gen/minimax-image.provider';
import { VolcengineSeedreamProvider } from './image-gen/volcengine-seedream.provider';
import { createTtsProvider } from './tts/tts-provider.factory';
import { MinimaxTtsProvider } from './tts/minimax-tts.provider';
import { VolcengineTtsProvider } from './tts/volcengine-tts.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function configOf(env: Record<string, string>): ConfigService {
  return createMock<ConfigService>({
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService);
}

describe('VolcengineSeedreamProvider(图片)', () => {
  it('按画幅映射像素尺寸并返回图片 URL', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { data: [{ url: 'https://tmp/img.jpg' }] },
    });
    const p = new VolcengineSeedreamProvider(
      configOf({ SEEDREAM_API_KEY: 'k', SEEDREAM_MODEL: 'm' }),
    );
    const r = await p.generate({ prompt: '日出', aspectRatio: '16:9' });
    expect(r.imageUrl).toBe('https://tmp/img.jpg');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/images/generations'),
      expect.objectContaining({ size: '2848x1600', model: 'm' }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer k' }),
      }),
    );
  });

  it('未返回 URL → 抛错;缺 key → isConfigured false', async () => {
    mockedAxios.post.mockResolvedValue({ data: { data: [] } });
    const p = new VolcengineSeedreamProvider(
      configOf({ SEEDREAM_API_KEY: 'k' }),
    );
    await expect(p.generate({ prompt: 'x' })).rejects.toThrow(/未返回图片 URL/);
    expect(new VolcengineSeedreamProvider(configOf({})).isConfigured()).toBe(
      false,
    );
  });
});

describe('MinimaxImageProvider(图片)', () => {
  it('base_resp 非零抛错;GroupId 注入 query', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { base_resp: { status_code: 1002, status_msg: '余额不足' } },
    });
    const p = new MinimaxImageProvider(
      configOf({ MINIMAX_API_KEY: 'k', MINIMAX_GROUP_ID: 'g1' }),
    );
    await expect(p.generate({ prompt: 'x' })).rejects.toThrow(/1002/);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ params: { GroupId: 'g1' } }),
    );
  });

  it('成功返回 image_urls[0]', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        base_resp: { status_code: 0 },
        data: { image_urls: ['https://tmp/a.png'] },
      },
    });
    const p = new MinimaxImageProvider(configOf({ MINIMAX_API_KEY: 'k' }));
    const r = await p.generate({ prompt: 'x', aspectRatio: '9:16' });
    expect(r.imageUrl).toBe('https://tmp/a.png');
  });
});

describe('VolcengineTtsProvider', () => {
  it('code=3000 → 解 base64 音频;凭证头齐全', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        code: 3000,
        data: Buffer.from('audio').toString('base64'),
        addition: { duration: '1200' },
      },
    });
    const p = new VolcengineTtsProvider(
      configOf({ VOLC_TTS_APP_ID: 'app', VOLC_TTS_ACCESS_TOKEN: 'tok' }),
    );
    const r = await p.synthesize({ text: '你好' });
    expect(r.audio.toString()).toBe('audio');
    expect(r.durationMs).toBe(1200);
    expect(r.wordTimestamps).toBeUndefined(); // HTTP 非流式无词级时间戳
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('openspeech.bytedance.com'),
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Api-App-Key': 'app',
          'X-Api-Access-Key': 'tok',
        }),
      }),
    );
  });

  it('合成失败 code 抛错;缺凭证 isConfigured false', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { code: 3001, message: '无效文本' },
    });
    const p = new VolcengineTtsProvider(
      configOf({ VOLC_TTS_APP_ID: 'app', VOLC_TTS_ACCESS_TOKEN: 'tok' }),
    );
    await expect(p.synthesize({ text: '' })).rejects.toThrow(/3001/);
    expect(new VolcengineTtsProvider(configOf({})).isConfigured()).toBe(false);
  });
});

describe('MinimaxTtsProvider', () => {
  it('hex 音频解码 + 字幕文件解析为词级时间戳', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        base_resp: { status_code: 0 },
        data: { audio: Buffer.from('mp3').toString('hex') },
        subtitle_file: 'https://tmp/sub.jsonl',
      },
    });
    mockedAxios.get.mockResolvedValue({
      data: '{"text":"你好","text_begin":0,"text_end":400}\n{"text":"世界","text_begin":400,"text_end":900}\n',
    });
    const p = new MinimaxTtsProvider(configOf({ MINIMAX_API_KEY: 'k' }));
    const r = await p.synthesize({ text: '你好世界' });
    expect(r.audio.toString()).toBe('mp3');
    expect(r.wordTimestamps).toEqual([
      { text: '你好', beginMs: 0, endMs: 400 },
      { text: '世界', beginMs: 400, endMs: 900 },
    ]);
    expect(r.durationMs).toBe(900);
    // 请求体开了字幕
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/t2a_v2'),
      expect.objectContaining({ subtitle_enable: true }),
      expect.anything(),
    );
  });

  it('字幕文件获取失败降级无时间戳,不阻塞配音', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        base_resp: { status_code: 0 },
        data: { audio: Buffer.from('mp3').toString('hex') },
        subtitle_file: 'https://tmp/sub.jsonl',
      },
    });
    mockedAxios.get.mockRejectedValue(new Error('404'));
    const p = new MinimaxTtsProvider(configOf({ MINIMAX_API_KEY: 'k' }));
    const r = await p.synthesize({ text: '你好' });
    expect(r.audio.toString()).toBe('mp3');
    expect(r.wordTimestamps).toBeUndefined();
  });
});

describe('provider 工厂降级', () => {
  it('image: 跟随 VIDEO_CLIP_PROVIDER;缺 key → null', () => {
    expect(
      createImageGenProvider(
        configOf({ VIDEO_CLIP_PROVIDER: 'volcengine', SEEDREAM_API_KEY: 'k' }),
      )?.name,
    ).toBe('volcengine');
    expect(
      createImageGenProvider(configOf({ VIDEO_CLIP_PROVIDER: 'volcengine' })),
    ).toBeNull();
    expect(createImageGenProvider(configOf({}))).toBeNull();
  });

  it('tts: 凭证不全 → null(调用方降级无配音)', () => {
    expect(
      createTtsProvider(
        configOf({
          VIDEO_CLIP_PROVIDER: 'volcengine',
          VOLC_TTS_APP_ID: 'a',
          VOLC_TTS_ACCESS_TOKEN: 't',
        }),
      )?.name,
    ).toBe('volcengine');
    // 只有 appId 没有 token → 降级
    expect(
      createTtsProvider(
        configOf({ VIDEO_CLIP_PROVIDER: 'volcengine', VOLC_TTS_APP_ID: 'a' }),
      ),
    ).toBeNull();
    expect(
      createTtsProvider(
        configOf({ VIDEO_CLIP_PROVIDER: 'minimax', MINIMAX_API_KEY: 'k' }),
      )?.name,
    ).toBe('minimax');
  });
});
