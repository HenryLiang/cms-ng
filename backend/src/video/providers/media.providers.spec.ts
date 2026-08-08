import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createMock } from '../../common/test-helpers';
import { createImageGenProvider } from './image-gen/image-gen-provider.factory';
import { MinimaxImageProvider } from './image-gen/minimax-image.provider';
import { VolcengineSeedreamProvider } from './image-gen/volcengine-seedream.provider';

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
});
