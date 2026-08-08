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

  it('submit 将生成参数以 -- 后缀内嵌 prompt(时长收敛到 5/10 档)并返回 taskId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-123' } });

    const handle = await provider.submit({
      prompt: '一只柴犬在樱花树下奔跑',
      durationSec: 6,
      resolution: '720P',
      aspectRatio: '9:16',
    });

    expect(handle).toEqual({ taskId: 'cgt-123' });
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    );
    expect((body as any).content[0].text).toBe(
      '一只柴犬在樱花树下奔跑 --ratio 9:16 --dur 5 --res 768p',
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
        resolution: '720P',
      }),
    ).toBe(4);
    expect(provider.estimateCost({ prompt: 'x' })).toBe(1.8);
  });
});

describe('VolcengineSeedanceProvider(2.x 系,如 2.0-mini)', () => {
  const config = configWith({
    ARK_API_KEY: 'ark-key',
    SEEDANCE_MODEL: 'doubao-seedance-2-0-mini-260615',
  });
  let provider: VolcengineSeedanceProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new VolcengineSeedanceProvider(config);
  });

  it('supportsNativeAudio=true;generateAudio → 顶层 generate_audio 参数', async () => {
    expect(provider.supportsNativeAudio).toBe(true);
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-9' } });

    await provider.submit({ prompt: '滨江步道', generateAudio: true });

    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).generate_audio).toBe(true);
  });

  it('未请求音频时不带 generate_audio;2.x 生成参数走顶层 body(720P→720p,时长 4~15 自由档)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-9' } });

    await provider.submit({
      prompt: 'x',
      durationSec: 6,
      resolution: '720P',
      aspectRatio: '9:16',
    });
    let [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).generate_audio).toBeUndefined();
    // 2.x:ratio/duration/resolution 顶层参数;prompt 不再内嵌 -- 后缀(--res 会被静默忽略)
    expect((body as any).content[0].text).toBe('x');
    expect((body as any).ratio).toBe('9:16');
    expect((body as any).duration).toBe(6);
    expect((body as any).resolution).toBe('720p');

    // 越界钳制:20s → 15;2s → 4
    await provider.submit({ prompt: 'x', durationSec: 20 });
    [, body] = mockedAxios.post.mock.calls[1];
    expect((body as any).duration).toBe(15);
    await provider.submit({ prompt: 'x', durationSec: 2 });
    [, body] = mockedAxios.post.mock.calls[2];
    expect((body as any).duration).toBe(4);
  });

  it('2.0-mini 分辨率档位:480P->480p;720P->720p', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-9' } });

    await provider.submit({ prompt: 'x', resolution: '480P' });
    let [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).resolution).toBe('480p');

    // 720P 映射 2.x 原生 720p 档
    await provider.submit({ prompt: 'x', resolution: '720P' });
    [, body] = mockedAxios.post.mock.calls[1];
    expect((body as any).resolution).toBe('720p');
  });

  it('2.0 完整版 720P->720p;1.0 系 480P 回退 768p(后缀内嵌)', async () => {
    const full = new VolcengineSeedanceProvider(
      configWith({
        ARK_API_KEY: 'ark-key',
        SEEDANCE_MODEL: 'doubao-seedance-2-0-260615',
      }),
    );
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-9' } });
    await full.submit({ prompt: 'x', resolution: '720P' });
    expect((mockedAxios.post.mock.calls[0][1] as any).resolution).toBe('720p');

    const legacy = new VolcengineSeedanceProvider(
      configWith({
        ARK_API_KEY: 'ark-key',
        SEEDANCE_MODEL: 'doubao-seedance-1-0-pro-250528',
      }),
    );
    await legacy.submit({ prompt: 'x', resolution: '480P' });
    expect(
      (mockedAxios.post.mock.calls[1][1] as any).content[0].text,
    ).toContain('--res 768p');
  });

  it('1.0 系不支持原生音频:忽略 generateAudio 请求', async () => {
    const legacy = new VolcengineSeedanceProvider(
      configWith({
        ARK_API_KEY: 'ark-key',
        SEEDANCE_MODEL: 'doubao-seedance-1-0-pro-250528',
      }),
    );
    expect(legacy.supportsNativeAudio).toBe(false);
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-9' } });

    await legacy.submit({ prompt: 'x', durationSec: 6, generateAudio: true });

    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).generate_audio).toBeUndefined();
    expect((body as any).content[0].text).toContain('--dur 5'); // 1.0 归一 5/10 档
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

  it('时长收敛到 Hailuo 仅支持的 6|10 档(≤8→6,>8→10)', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { task_id: 't', base_resp: { status_code: 0 } },
    });

    await provider.submit({ prompt: 'x', durationSec: 4 });
    expect((mockedAxios.post.mock.calls[0][1] as any).duration).toBe(6);

    await provider.submit({ prompt: 'x', durationSec: 8 });
    expect((mockedAxios.post.mock.calls[1][1] as any).duration).toBe(6);

    // L2 分镜 hint 上限 15:收敛到 10 而不是原样透传被 API 拒绝
    await provider.submit({ prompt: 'x', durationSec: 12 });
    expect((mockedAxios.post.mock.calls[2][1] as any).duration).toBe(10);
  });

  it('480P/720P 均映射 768P', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { task_id: 't', base_resp: { status_code: 0 } },
    });

    await provider.submit({ prompt: 'x', resolution: '480P' });
    expect((mockedAxios.post.mock.calls[0][1] as any).resolution).toBe('768P');

    await provider.submit({ prompt: 'x', resolution: '720P' });
    expect((mockedAxios.post.mock.calls[1][1] as any).resolution).toBe('768P');
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

describe('VolcengineSeedanceProvider 多模态参考物(PRD §18)', () => {
  const v2 = () =>
    new VolcengineSeedanceProvider(
      configWith({
        ARK_API_KEY: 'ark-key',
        SEEDANCE_MODEL: 'doubao-seedance-2-0-mini-260615',
      }),
    );
  const v1 = () =>
    new VolcengineSeedanceProvider(
      configWith({
        ARK_API_KEY: 'ark-key',
        SEEDANCE_MODEL: 'doubao-seedance-1-5-pro-251215',
      }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { id: 'cgt-ref' } });
  });

  it('2.x paramCapabilities:全 5 角色 + seed/尾帧 + 帧参考互斥;mini 全模式禁 draft(实测);1.x 仅 first_frame', () => {
    // v2() 用 2.0-mini:draft 在 t2v/i2v/flf2v/r2v 全部被 Ark 400(2026-08-08 实测)
    expect(v2().paramCapabilities).toEqual({
      referenceRoles: [
        'first_frame',
        'last_frame',
        'reference_image',
        'reference_video',
        'reference_audio',
      ],
      seed: true,
      draft: false,
      returnLastFrame: true,
      frameReferenceExclusive: true,
    });
    // 非 mini 2.x:draft 按官方文档置 true(本账号无 pro 模型,未实测)
    expect(
      new VolcengineSeedanceProvider(
        configWith({
          ARK_API_KEY: 'ark-key',
          SEEDANCE_MODEL: 'doubao-seedance-2-0-pro-260615',
        }),
      ).paramCapabilities,
    ).toMatchObject({
      draft: true,
      frameReferenceExclusive: true,
    });
    expect(v1().paramCapabilities).toEqual({
      referenceRoles: ['first_frame'],
      seed: false,
      draft: false,
      returnLastFrame: false,
    });
  });

  it('durationCapabilities:2.x free 4~15;1.x fixed [5,10]', () => {
    expect(v2().durationCapabilities).toEqual({
      mode: 'free',
      min: 4,
      max: 15,
    });
    expect(v1().durationCapabilities).toEqual({
      mode: 'fixed',
      min: 5,
      max: 10,
      allowed: [5, 10],
    });
  });

  it('submit/poll 被 Ark 400 拒绝时透出 error.message(而非只有状态码)', async () => {
    const arkReject = {
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          error: {
            code: 'InvalidParameter',
            message:
              'first/last frame content cannot be mixed with reference media content',
          },
        },
      },
    };
    mockedAxios.post.mockRejectedValueOnce(arkReject);
    await expect(v2().submit({ prompt: 'x' })).rejects.toThrow(
      /cannot be mixed with reference media/,
    );
    mockedAxios.get.mockRejectedValueOnce(arkReject);
    await expect(v2().poll('t')).rejects.toThrow(/cannot be mixed/);
    // 非 Ark 形态错误(无 response.data.error)原样抛出
    const boom = new Error('socket hangup');
    mockedAxios.post.mockRejectedValueOnce(boom);
    await expect(v2().submit({ prompt: 'x' })).rejects.toBe(boom);
  });

  it('2.x:五种参考角色 → content 数组带 role 的类型化素材项', async () => {
    await v2().submit({
      prompt: '果茶广告',
      references: [
        { role: 'first_frame', url: 'https://cos/first.jpg' },
        { role: 'last_frame', url: 'https://cos/last.jpg' },
        { role: 'reference_image', url: 'https://cos/product.jpg' },
        { role: 'reference_video', url: 'https://cos/motion.mp4' },
        { role: 'reference_audio', url: 'https://cos/bgm.mp3' },
      ],
    });

    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).content).toEqual([
      { type: 'text', text: '果茶广告' },
      {
        type: 'image_url',
        image_url: { url: 'https://cos/first.jpg' },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://cos/last.jpg' },
        role: 'last_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://cos/product.jpg' },
        role: 'reference_image',
      },
      {
        type: 'video_url',
        video_url: { url: 'https://cos/motion.mp4' },
        role: 'reference_video',
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://cos/bgm.mp3' },
        role: 'reference_audio',
      },
    ]);
  });

  it('2.x:firstFrameUrl 与 references.first_frame 等价,references 优先', async () => {
    await v2().submit({
      prompt: 'x',
      firstFrameUrl: 'https://cos/legacy.jpg',
      references: [{ role: 'first_frame', url: 'https://cos/new.jpg' }],
    });
    let items = (mockedAxios.post.mock.calls[0][1] as any).content.filter(
      (c: any) => c.role === 'first_frame',
    );
    expect(items).toHaveLength(1);
    expect(items[0].image_url.url).toBe('https://cos/new.jpg');

    // 仅 firstFrameUrl(存量调用方)同样落 first_frame 角色
    await v2().submit({ prompt: 'x', firstFrameUrl: 'https://cos/legacy.jpg' });
    items = (mockedAxios.post.mock.calls[1][1] as any).content.filter(
      (c: any) => c.role === 'first_frame',
    );
    expect(items).toHaveLength(1);
    expect(items[0].image_url.url).toBe('https://cos/legacy.jpg');
  });

  it('2.x:seed/draft/returnLastFrame → 顶层 seed/draft/return_last_frame', async () => {
    await v2().submit({
      prompt: 'x',
      seed: 42,
      draft: true,
      returnLastFrame: true,
    });
    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).seed).toBe(42);
    expect((body as any).draft).toBe(true);
    expect((body as any).return_last_frame).toBe(true);
  });

  it('2.x:poll succeeded 携带 last_frame_url 时透出 lastFrameUrl', async () => {
    const p = v2();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        status: 'succeeded',
        content: {
          video_url: 'https://v/x.mp4',
          last_frame_url: 'https://v/x-last.jpg',
        },
      },
    });
    const ok = await p.poll('t');
    expect(ok.videoUrl).toBe('https://v/x.mp4');
    expect(ok.lastFrameUrl).toBe('https://v/x-last.jpg');
  });

  it('1.x:首帧为裸 image_url(无 role),其余角色跳过,seed/draft 不落参', async () => {
    await v1().submit({
      prompt: 'x',
      durationSec: 6,
      seed: 42,
      draft: true,
      returnLastFrame: true,
      references: [
        { role: 'first_frame', url: 'https://cos/first.jpg' },
        { role: 'reference_video', url: 'https://cos/motion.mp4' },
        { role: 'reference_audio', url: 'https://cos/bgm.mp3' },
      ],
    });
    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).content).toEqual([
      { type: 'text', text: 'x --dur 5' },
      { type: 'image_url', image_url: { url: 'https://cos/first.jpg' } },
    ]);
    expect((body as any).seed).toBeUndefined();
    expect((body as any).draft).toBeUndefined();
    expect((body as any).return_last_frame).toBeUndefined();
  });
});

describe('MinimaxHailuoProvider 多模态参考物', () => {
  const provider = () =>
    new MinimaxHailuoProvider(configWith({ MINIMAX_API_KEY: 'mm-key' }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: { task_id: 'mm-1' } });
  });

  it('paramCapabilities:仅 first_frame,无可选参数', () => {
    expect(provider().paramCapabilities).toEqual({
      referenceRoles: ['first_frame'],
      seed: false,
      draft: false,
      returnLastFrame: false,
    });
  });

  it('durationCapabilities:fixed [6,10]', () => {
    expect(provider().durationCapabilities).toEqual({
      mode: 'fixed',
      min: 6,
      max: 10,
      allowed: [6, 10],
    });
  });

  it('references.first_frame → first_frame_image;references 优先于 firstFrameUrl', async () => {
    await provider().submit({
      prompt: 'x',
      firstFrameUrl: 'https://cos/legacy.jpg',
      references: [{ role: 'first_frame', url: 'https://cos/new.jpg' }],
    });
    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).first_frame_image).toBe('https://cos/new.jpg');
  });

  it('非首帧参考角色 → 明确抛错(兜底防御,正常由 service 层拦截)', async () => {
    await expect(
      provider().submit({
        prompt: 'x',
        references: [{ role: 'reference_video', url: 'https://cos/m.mp4' }],
      }),
    ).rejects.toThrow(/仅支持首帧参考/);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
