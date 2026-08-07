import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  buildAss,
  composeVideo,
  hasAudioStream,
  probeDurationSec,
  supportsAssBurn,
} from './ffmpeg-compose';

const execFileAsync = promisify(execFile);

/**
 * 合成层真实 ffmpeg 集成测试(不 mock):用 lavfi 生成微小原料,
 * 合成后用 ffprobe 断言时长/流结构。环境无 ffmpeg 时整体跳过(CI 保障见 PRD §11)。
 */
const HAS_FFMPEG = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeFfmpeg = HAS_FFMPEG ? describe : describe.skip;

describe('buildAss', () => {
  it('生成合法 ASS 结构,画幅驱动字号', () => {
    const ass = buildAss(
      [{ text: '第一句{字幕}\n换行', beginMs: 0, endMs: 1500 }],
      '9:16',
    );
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.50');
    // 花括号/换行已转义
    expect(ass).toContain('第一句字幕 换行');
    expect(ass).not.toContain('{字幕}');
  });
});

describeFfmpeg('composeVideo(真实 ffmpeg)', () => {
  jest.setTimeout(120_000);
  let jobDir: string;

  beforeAll(async () => {
    jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-ng-compose-test-'));
    // 原料:1.5s 测试视频 + 一张测试图 + 1s 音频
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1.5:size=320x240:rate=15',
      '-pix_fmt',
      'yuv420p',
      path.join(jobDir, 'clip.mp4'),
    ]);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:size=320x240',
      '-frames:v',
      '1',
      path.join(jobDir, 'img.jpg'),
    ]);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      path.join(jobDir, 'voice.mp3'),
    ]);
  });

  afterAll(async () => {
    await fs.rm(jobDir, { recursive: true, force: true });
  });

  it('视频截断 + 图片 Ken Burns + 配音/静音混合 → ffprobe 断言', async () => {
    const outputPath = path.join(jobDir, 'out.mp4');
    const result = await composeVideo({
      jobDir,
      aspectRatio: '9:16',
      outputPath,
      scenes: [
        {
          assetPath: path.join(jobDir, 'clip.mp4'),
          assetKind: 'video',
          audioPath: path.join(jobDir, 'voice.mp3'),
          durationSec: 1,
        },
        {
          assetPath: path.join(jobDir, 'img.jpg'),
          assetKind: 'image',
          durationSec: 2,
        },
      ],
    });

    expect(result.subtitleMode).toBe('none');
    // 时长 ≈ 1 + 2 = 3s(ffprobe 实际值,允许 ±0.3s 容器误差)
    expect(result.durationSec).toBeGreaterThan(2.7);
    expect(result.durationSec).toBeLessThan(3.3);

    // 流结构:1 视频(1080x1920 H.264)+ 1 音频(AAC)
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height',
      '-of',
      'json',
      outputPath,
    ]);
    const streams = JSON.parse(stdout).streams as Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
    }>;
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');
    expect(video?.codec_name).toBe('h264');
    expect([video?.width, video?.height]).toEqual([1080, 1920]);
    expect(audio?.codec_name).toBe('aac');
  });

  it('带 ASS 字幕:环境有 libass 则烧录,无则软字幕轨降级', async () => {
    const outputPath = path.join(jobDir, 'out-sub.mp4');
    const canBurn = await supportsAssBurn();
    const result = await composeVideo({
      jobDir,
      aspectRatio: '16:9',
      outputPath,
      assContent: buildAss(
        [{ text: '测试字幕', beginMs: 0, endMs: 900 }],
        '16:9',
      ),
      scenes: [
        {
          assetPath: path.join(jobDir, 'clip.mp4'),
          assetKind: 'video',
          durationSec: 1,
        },
      ],
    });

    expect(result.subtitleMode).toBe(canBurn ? 'burned' : 'soft');
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'json',
      outputPath,
    ]);
    const types = (
      JSON.parse(stdout).streams as Array<{ codec_type: string }>
    ).map((s) => s.codec_type);
    if (canBurn) {
      expect(types).not.toContain('subtitle');
    } else {
      expect(types).toContain('subtitle');
    }
  });

  it('probeDurationSec:非法文件返回 null 而不抛错', async () => {
    const bogus = path.join(jobDir, 'bogus.bin');
    await fs.writeFile(bogus, 'not a media file');
    await expect(probeDurationSec(bogus)).resolves.toBeNull();
  });

  it('hasAudioStream:区分有/无音频流的素材(原生音频复用判定)', async () => {
    await expect(hasAudioStream(path.join(jobDir, 'voice.mp3'))).resolves.toBe(
      true,
    );
    await expect(hasAudioStream(path.join(jobDir, 'clip.mp4'))).resolves.toBe(
      false,
    );
  });

  it('视频镜复用原生音轨(audioPath=assetPath)→ 输出音频非静音', async () => {
    // 造一个自带音轨的视频素材(模拟 Seedance 有声生成产物)
    const clipWithAudio = path.join(jobDir, 'clip-audio.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=320x240:rate=15',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      clipWithAudio,
    ]);
    const outputPath = path.join(jobDir, 'out-native.mp4');
    await composeVideo({
      jobDir,
      aspectRatio: '9:16',
      outputPath,
      scenes: [
        {
          assetPath: clipWithAudio,
          assetKind: 'video',
          audioPath: clipWithAudio, // 原生音轨复用(ComposeStep 的产出形态)
          durationSec: 1,
        },
      ],
    });
    // volumedetect:原生音轨被带入 → 输出非静音(静音轨 mean_volume ≈ -91dB)
    const { stderr } = await execFileAsync('ffmpeg', [
      '-i',
      outputPath,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
    const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr ?? '');
    expect(mean).not.toBeNull();
    expect(Number(mean?.[1])).toBeGreaterThan(-60);
  });
});
