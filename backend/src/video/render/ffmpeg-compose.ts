import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

const execFileAsync = promisify(execFile);

/** 单镜合成输入(素材已下载到本地) */
export interface ComposeSceneInput {
  /** 素材文件路径(mp4 或 jpg) */
  assetPath: string;
  /** 素材类型:video=片段(超出截断/不足冻结尾帧);image=静帧 + Ken Burns 缩放 */
  assetKind: 'video' | 'image';
  /** 配音音频路径;缺省该镜静音 */
  audioPath?: string;
  /** 该镜时长(秒) */
  durationSec: number;
}

export interface ComposeOptions {
  jobDir: string;
  scenes: ComposeSceneInput[];
  /** ASS 字幕内容;为空则不挂字幕 */
  assContent?: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  outputPath: string;
  ffmpegBin?: string;
  ffprobeBin?: string;
}

export interface ComposeResult {
  outputPath: string;
  durationSec: number;
  /** burned=烧录硬字幕;soft=软字幕轨(环境无 libass 降级);none=无字幕 */
  subtitleMode: 'burned' | 'soft' | 'none';
}

const RESOLUTION_BY_RATIO: Record<ComposeOptions['aspectRatio'], string> = {
  '16:9': '1920:1080',
  '9:16': '1080:1920',
  '1:1': '1080:1080',
};

/** 下载到本地(jobDir 原料),返回文件路径 */
export async function downloadToFile(
  url: string,
  filePath: string,
  maxBytes = 300 * 1024 * 1024,
): Promise<void> {
  const resp = await axios.get<NodeJS.ReadableStream>(url, {
    responseType: 'stream',
    timeout: 180_000,
    maxContentLength: maxBytes,
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const { createWriteStream } = await import('fs');
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(filePath);
    resp.data.pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
  });
}

/** ffprobe 取媒体时长(秒);失败返回 null(调用方用声明值兜底) */
export async function probeDurationSec(
  filePath: string,
  ffprobeBin = 'ffprobe',
): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const v = Number(stdout.trim());
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** 探测文件是否含音频流(原生音频视频镜据此复用其音轨);探测失败按无音频处理 */
export async function hasAudioStream(
  filePath: string,
  ffprobeBin = 'ffprobe',
): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** 环境能力探测:是否支持 ass 烧录(无 libass 的 ffmpeg 构建降级软字幕轨) */
export async function supportsAssBurn(ffmpegBin = 'ffmpeg'): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(ffmpegBin, [
      '-hide_banner',
      '-filters',
    ]);
    return /^\s*T?\.?\s*ass\s/m.test(stdout) || /\bsubtitles\s/.test(stdout);
  } catch {
    return false;
  }
}

/** ASS 转义:花括号与换行 */
function assEscape(text: string): string {
  return text.replace(/[{}\\]/g, '').replace(/\n/g, ' ');
}

function assTime(ms: number): string {
  const cs = Math.floor((ms % 1000) / 10);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export interface SubtitleCue {
  text: string;
  beginMs: number;
  endMs: number;
}

/** 生成 ASS 字幕(样式随画幅缩放,底部居中) */
export function buildAss(
  cues: SubtitleCue[],
  aspectRatio: ComposeOptions['aspectRatio'],
): string {
  const [w, h] = RESOLUTION_BY_RATIO[aspectRatio].split(':').map(Number);
  const fontSize = Math.round(h * 0.038);
  const marginV = Math.round(h * 0.06);
  const events = cues
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.beginMs)},${assTime(c.endMs)},Default,,0,0,0,,${assEscape(c.text)}`,
    )
    .join('\n');
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,PingFang SC,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,2.5,1,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

/**
 * FFmpeg 合成:拼接各镜(视频截断/冻帧对齐,图片 Ken Burns)+ 配音轨(缺镜补静音)
 * + 字幕(ass 烧录,环境无 libass 时降级 mov_text 软字幕轨)→ H.264/AAC mp4。
 *
 * 纯函数式 helper:只依赖 jobDir 里的本地文件,不感知任务状态机/数据库 ——
 * 未来拆独立渲染 worker(scripts/video-render/)时整体平移即可(PRD §7)。
 */
export async function composeVideo(
  opts: ComposeOptions,
): Promise<ComposeResult> {
  const ffmpeg = opts.ffmpegBin ?? 'ffmpeg';
  const ffprobe = opts.ffprobeBin ?? 'ffprobe';
  const dims = RESOLUTION_BY_RATIO[opts.aspectRatio];
  const [w, h] = dims.split(':').map(Number);
  const { scenes } = opts;
  if (!scenes.length) throw new Error('合成至少需要 1 镜');

  const inputArgs: string[] = [];
  const filters: string[] = [];
  const vLabels: string[] = [];
  const aLabels: string[] = [];
  let inputCount = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const dur = Math.max(1, sc.durationSec);
    // ---- 视频输入 ----
    // 图片不加 -loop:zoompan 会对每帧复制 d 份,长输入 × d 会失控;
    // 单帧输入 + zoompan d=总帧数 才是 Ken Burns 的正确形态
    inputArgs.push('-i', sc.assetPath);
    const vin = inputCount++;
    if (sc.assetKind === 'image') {
      // Ken Burns:2x 超采样后缓慢推近(30fps,z 从 1.0 → ~1.08)
      filters.push(
        `[${vin}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},setsar=1,` +
          `zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(dur * 30)}:s=${w}x${h}:fps=30,` +
          `trim=duration=${dur},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`,
      );
    } else {
      // 截断或冻结尾帧补齐到该镜时长
      filters.push(
        `[${vin}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,` +
          `tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`,
      );
    }
    vLabels.push(`[v${i}]`);

    // ---- 音频输入 ----
    if (sc.audioPath) {
      inputArgs.push('-i', sc.audioPath);
      const ain = inputCount++;
      filters.push(
        `[${ain}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=duration=${dur},asetpts=PTS-STARTPTS[a${i}]`,
      );
    } else {
      inputArgs.push(
        '-f',
        'lavfi',
        '-t',
        String(dur),
        '-i',
        'anullsrc=r=44100:cl=stereo',
      );
      const ain = inputCount++;
      filters.push(
        `[${ain}:a]atrim=duration=${dur},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
    aLabels.push(`[a${i}]`);
  }

  filters.push(`${vLabels.join('')}concat=n=${scenes.length}:v=1:a=0[outv]`);
  filters.push(`${aLabels.join('')}concat=n=${scenes.length}:v=0:a=1[outa]`);

  let vOut = '[outv]';
  let subtitleMode: ComposeResult['subtitleMode'] = 'none';
  let assPath: string | null = null;
  if (opts.assContent) {
    assPath = path.join(opts.jobDir, 'subtitle.ass');
    await fs.writeFile(assPath, opts.assContent ?? '', 'utf8');
    if (await supportsAssBurn(ffmpeg)) {
      filters.push(`[outv]ass='${assPath.replace(/'/g, "'\\''")}'[vsub]`);
      vOut = '[vsub]';
      subtitleMode = 'burned';
    } else {
      subtitleMode = 'soft';
    }
  }

  // 组装参数:全部输入在前(含软字幕轨输入),filter_complex / -map 等输出选项在后
  const args: string[] = ['-y', ...inputArgs];
  let subInputIdx = -1;
  if (subtitleMode === 'soft' && assPath) {
    args.push('-i', assPath);
    subInputIdx = inputCount++;
  }
  args.push('-filter_complex', filters.join(';'));
  args.push('-map', vOut, '-map', '[outa]');
  if (subInputIdx >= 0) {
    // 软字幕轨:ASS 直接作字幕输入(mov_text 封装)
    args.push('-map', `${subInputIdx}:s`);
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
  );
  if (subtitleMode === 'soft') {
    args.push('-c:s', 'mov_text');
  }
  args.push('-movflags', '+faststart', opts.outputPath);

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  await execFileAsync(ffmpeg, args, {
    timeout: 10 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const durationSec = (await probeDurationSec(opts.outputPath, ffprobe)) ?? 0;
  return { outputPath: opts.outputPath, durationSec, subtitleMode };
}
