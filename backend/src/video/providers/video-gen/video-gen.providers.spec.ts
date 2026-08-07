import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createMock } from '../../../common/test-helpers';
import { MinimaxHailuoProvider } from './minimax-hailuo.provider';
import { createVideoGenProvider } from './video-gen-provider.factory';
import { VolcengineSeedanceProvider } from './volcengine-seedance.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function configWith(values: Record<string, string>): ConfigService {
  return createMock<ConfigService>({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

describe('VolcengineSeedanceProvider', () => {
  const config = configWith({
    ARK_API_KEY: 'ark-key',
    SEEDANCE_MODEL: 'doubao-seedance-1-5-pro-251215',
  });
  let provider: VolcengineSeedanceProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new VolcengineSeedanceProvider(config);
  });

  it('submit 将生成参数以 -- 后缀内嵌 prompt 并返回 taskId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-123' } });

    const handle = await provider.submit({
      prompt: '一只柴犬在樱花树下奔跑',
      durationSec: 6,
      resolution: '1080P',
      aspectRatio: '9:16',
    });

    expect(handle).toEqual({ taskId: 'cgt-123' });
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    );
    expect((body as any).content[0].text).toBe(
      '一只柴犬在樱花树下奔跑 --ratio 9:16 --dur 6 --res 1080p',
    );
  });

  it('submit 未返回 id 时抛错', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    await expect(provider.submit({ prompt: 'x' })).rejects.toThrow(
      /未返回任务 id/,
    );
  });

  it('poll 映射 queued/running/succeeded/failed 状态', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: 'queued' } });
    expect((await provider.poll('t')).state).toBe('pending');

    mockedAxios.get.mockResolvedValueOnce({ data: { status: 'running' } });
    expect((await provider.poll('t')).state).toBe('processing');

    mockedAxios.get.mockResolvedValueOnce({
      data: { status: 'succeeded', content: { video_url: 'https://v/x.mp4' } },
    });
    const ok = await provider.poll('t');
    expect(ok).toEqual({
      state: 'succeeded',
      videoUrl: 'https://v/x.mp4',
      durationSec: undefined,
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: { status: 'failed', error: { message: 'content rejected' } },
    });
    expect(await provider.poll('t')).toEqual({
      state: 'failed',
      error: 'content rejected',
    });
  });

  it('estimateCost 按时长与分辨率估算', () => {
    expect(
      provider.estimateCost({
        prompt: 'x',
        durationSec: 10,
        resolution: '1080P',
      }),
    ).toBe(6);
    expect(provider.estimateCost({ prompt: 'x' })).toBe(2.4);
  });
});

describe('MinimaxHailuoProvider', () => {
  const config = configWith({
    MINIMAX_API_KEY: 'mm-key',
    MINIMAX_VIDEO_MODEL: 'MiniMax-Hailuo-2.3',
  });
  let provider: MinimaxHailuoProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new MinimaxHailuoProvider(config);
  });

  it('submit 关闭 prompt_optimizer 并返回 taskId', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { task_id: '176843862716480', base_resp: { status_code: 0 } },
    });

    const handle = await provider.submit({
      prompt: '城市夜景航拍',
      durationSec: 6,
    });

    expect(handle).toEqual({ taskId: '176843862716480' });
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://api.minimax.io/v1/video_generation');
    expect((body as any).prompt_optimizer).toBe(false);
  });

  it('base_resp.status_code 非 0 时抛错', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { base_resp: { status_code: 1004, status_msg: 'invalid api key' } },
    });
    await expect(provider.submit({ prompt: 'x' })).rejects.toThrow(
      /status_code=1004/,
    );
  });

  it('poll Success 时经 files/retrieve 换取下载 URL', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          status: 'Success',
          file_id: '176844028768320',
          video_width: 1080,
          video_height: 1920,
          base_resp: { status_code: 0 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          file: { download_url: 'https://cdn/x.mp4' },
          base_resp: { status_code: 0 },
        },
      });

    const result = await provider.poll('176843862716480');

    expect(result).toEqual({
      state: 'succeeded',
      videoUrl: 'https://cdn/x.mp4',
      width: 1080,
      height: 1920,
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get.mock.calls[1][0]).toBe(
      'https://api.minimax.io/v1/files/retrieve',
    );
  });

  it('poll 映射 Preparing/Queueing/Processing/Fail 状态', async () => {
    for (const [api, expected] of [
      ['Preparing', 'pending'],
      ['Queueing', 'pending'],
      ['Processing', 'processing'],
      ['Fail', 'failed'],
    ] as const) {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: api, base_resp: { status_code: 0 } },
      });
      expect((await provider.poll('t')).state).toBe(expected);
    }
  });

  it('配置 MINIMAX_GROUP_ID 时作为 query 参数附加(国内站)', async () => {
    const domestic = new MinimaxHailuoProvider(
      configWith({ MINIMAX_API_KEY: 'k', MINIMAX_GROUP_ID: 'g-1' }),
    );
    mockedAxios.get.mockResolvedValue({
      data: { status: 'Processing', base_resp: { status_code: 0 } },
    });
    await domestic.poll('t');
    expect(mockedAxios.get.mock.calls[0][1]?.params).toEqual({
      task_id: 't',
      GroupId: 'g-1',
    });
  });
});

describe('createVideoGenProvider 工厂', () => {
  it('未配置 VIDEO_CLIP_PROVIDER 时返回 null(降级关闭)', () => {
    expect(createVideoGenProvider(configWith({}))).toBeNull();
  });

  it('非法 provider 名返回 null', () => {
    expect(
      createVideoGenProvider(configWith({ VIDEO_CLIP_PROVIDER: 'sora' })),
    ).toBeNull();
  });

  it('provider 缺对应 API key 时返回 null', () => {
    expect(
      createVideoGenProvider(configWith({ VIDEO_CLIP_PROVIDER: 'volcengine' })),
    ).toBeNull();
    expect(
      createVideoGenProvider(configWith({ VIDEO_CLIP_PROVIDER: 'minimax' })),
    ).toBeNull();
  });

  it('配置齐全时返回对应 provider 实例', () => {
    expect(
      createVideoGenProvider(
        configWith({ VIDEO_CLIP_PROVIDER: 'volcengine', ARK_API_KEY: 'k' }),
      ),
    ).toBeInstanceOf(VolcengineSeedanceProvider);
    expect(
      createVideoGenProvider(
        configWith({ VIDEO_CLIP_PROVIDER: 'minimax', MINIMAX_API_KEY: 'k' }),
      ),
    ).toBeInstanceOf(MinimaxHailuoProvider);
  });
});
