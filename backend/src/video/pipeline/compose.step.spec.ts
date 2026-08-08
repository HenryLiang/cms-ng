import type { VideoGenerationJob } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createMock } from '../../common/test-helpers';
import { ComposeStep } from './compose.step';
import { VideoPipelineDeps } from './pipeline-deps';
import { Storyboard, StoryboardScene } from './storyboard.types';
import {
  composeVideo,
  hasAudioStream,
  probeDurationSec,
} from '../render/ffmpeg-compose';

// 合成层外部依赖全 mock:本 spec 只钉 prepareScene 的决策逻辑
// (原生音轨复用/时长取值/分支优先级),ffmpeg 本身由 ffmpeg-compose.spec 集成测试覆盖
jest.mock('fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mp4-bytes')),
}));

jest.mock('../render/ffmpeg-compose', () => ({
  buildAss: jest.fn(() => 'ass-content'),
  composeVideo: jest.fn(),
  downloadToFile: jest.fn().mockResolvedValue(undefined),
  hasAudioStream: jest.fn(),
  probeDurationSec: jest.fn(),
}));

const mockedComposeVideo = composeVideo as jest.Mock;
const mockedHasAudioStream = hasAudioStream as jest.Mock;
const mockedProbeDuration = probeDurationSec as jest.Mock;

function scene(partial: {
  index: number;
  type?: 'video_clip' | 'image' | 'media_asset';
  assetUrl: string;
  durationHintSec?: number;
}): StoryboardScene {
  return {
    index: partial.index,
    narration: `第 ${partial.index + 1} 镜口播文本。`,
    visual: {
      type: partial.type ?? 'video_clip',
      prompt: 'p',
      durationHintSec: partial.durationHintSec ?? 5,
    },
    fallback: 'image',
    asset: { status: 'done', url: partial.assetUrl },
  };
}

function storyboardOf(scenes: StoryboardScene[]): Storyboard {
  return { title: 't', aspectRatio: '9:16', scenes };
}

describe('ComposeStep.prepareScene(经 run 触达)', () => {
  const job = { id: 'job-1' } as VideoGenerationJob;

  function build(opts: { nativeAudio: boolean }): ComposeStep {
    const config = createMock<ConfigService>({
      get: jest.fn((key: string) =>
        key === 'VIDEO_RENDER_ENABLED' ? 'true' : undefined,
      ),
    } as unknown as ConfigService);
    const deps: VideoPipelineDeps = {
      prisma: createMock(),
      config,
      chat: createMock(),
      // 原生音频模式 = 片段 provider 支持原生音频(Seedance 1.5+/2.x)
      videoGen: { supportsNativeAudio: opts.nativeAudio } as never,
      imageGen: null,
      storage: createMock(),
    };
    return new ComposeStep(deps);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockedComposeVideo.mockResolvedValue({
      outputPath: '/tmp/x.mp4',
      durationSec: 10,
      subtitleMode: 'none',
    });
    mockedProbeDuration.mockResolvedValue(7.5);
    mockedHasAudioStream.mockResolvedValue(true);
  });

  /** run() 后取 composeVideo 收到的单镜输入 */
  async function composedScene(
    step: ComposeStep,
    s: StoryboardScene,
  ): Promise<{
    assetPath: string;
    assetKind: string;
    audioPath?: string;
    durationSec: number;
  }> {
    await step.run(job, storyboardOf([s]));
    expect(mockedComposeVideo).toHaveBeenCalledTimes(1);
    return mockedComposeVideo.mock.calls[0][0].scenes[0];
  }

  it('原生音频模式 + 有声视频素材 → 复用原生音轨(audioPath=assetPath),时长取探测值', async () => {
    const input = await composedScene(
      build({ nativeAudio: true }),
      scene({ index: 0, assetUrl: 'https://cos/scene-0.mp4' }),
    );
    expect(input.assetKind).toBe('video');
    expect(input.audioPath).toBe(input.assetPath);
    expect(input.durationSec).toBe(7.5); // 探测值优先于 hint=5
  });

  it('原生音频模式 + 无声视频素材 → 不复用音轨,时长仍取探测值', async () => {
    mockedHasAudioStream.mockResolvedValue(false);
    const input = await composedScene(
      build({ nativeAudio: true }),
      scene({ index: 0, assetUrl: 'https://cos/scene-0.mp4' }),
    );
    expect(input.audioPath).toBeUndefined();
    expect(input.durationSec).toBe(7.5);
  });

  it('非原生模式(provider 无原生音频能力)+ 有声视频素材 → 不混入原声,时长按 hint(既有行为)', async () => {
    const input = await composedScene(
      build({ nativeAudio: false }),
      scene({
        index: 0,
        assetUrl: 'https://cos/scene-0.mp4',
        durationHintSec: 5,
      }),
    );
    expect(input.audioPath).toBeUndefined();
    expect(input.durationSec).toBe(5);
    // 非原生模式不探测素材(时长由 hint 决定)
    expect(mockedProbeDuration).not.toHaveBeenCalled();
    expect(mockedHasAudioStream).not.toHaveBeenCalled();
  });

  it('图片镜:assetKind=image、不探测、时长按 hint', async () => {
    const input = await composedScene(
      build({ nativeAudio: true }),
      scene({
        index: 0,
        type: 'image',
        assetUrl: 'https://cos/scene-0.jpg',
        durationHintSec: 6,
      }),
    );
    expect(input.assetKind).toBe('image');
    expect(input.audioPath).toBeUndefined();
    expect(input.durationSec).toBe(6);
    expect(mockedProbeDuration).not.toHaveBeenCalled();
  });

  it('素材未就绪(无 asset.url)→ 抛错指出镜号', async () => {
    const s = scene({ index: 2, assetUrl: '' });
    s.asset = { status: 'failed' };
    await expect(
      build({ nativeAudio: true }).run(job, storyboardOf([s])),
    ).rejects.toThrow(/第 2 镜素材未就绪/);
  });
});
