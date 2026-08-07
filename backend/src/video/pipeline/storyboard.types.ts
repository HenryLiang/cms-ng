/**
 * 分镜 JSON 契约(LLM 输出 → 应用层手写校验,仓库无 zod 运行时依赖)。
 * 持久化为 VideoGenerationJob.storyboard(TEXT),解析用 safeJsonParse。
 *
 * checkpoint 设计:每镜的素材/配音进度直接落在 scenes[].asset / scenes[].voice 上,
 * 崩溃恢复时按 scene 状态续跑,不重复扣费。
 */

/** 单镜视觉素材类型:AI 视频片段 | AI 图片(Ken Burns)| 媒体库已有素材 */
export type StoryboardVisualType = 'video_clip' | 'image' | 'media_asset';

/** 素材生成状态(P1 实际使用:pending/submitted/done/failed) */
export type SceneAssetStatus = 'pending' | 'submitted' | 'done' | 'failed';

export interface StoryboardSceneAsset {
  status: SceneAssetStatus;
  /** provider 侧异步任务 ID(video_clip 提交后写回,供崩溃续 poll) */
  providerTaskId?: string;
  /** 已转存 COS 的最终素材 URL */
  url?: string;
  /** 视频片段实际时长(秒,poll 成功时写回) */
  durationSec?: number;
  error?: string;
}

export interface StoryboardSceneVoice {
  /** 已转存 COS 的配音音频 URL(mp3) */
  audioUrl: string;
  durationMs: number;
  /** 词级时间戳(minimax 必有;volcengine 支持则返回),用于字幕烧录 */
  wordTimestamps?: Array<{ text: string; beginMs: number; endMs: number }>;
}

export interface StoryboardScene {
  index: number;
  /** 该镜口播文本(送 TTS) */
  narration: string;
  visual: {
    type: StoryboardVisualType;
    /** 视频/图片生成 prompt(type=media_asset 时为 null) */
    prompt: string | null;
    /** type=media_asset 时引用媒体库 */
    mediaAssetId?: string | null;
    /** 无配音降级时的该镜时长(秒) */
    durationHintSec: number;
  };
  /** 视频生成失败时的降级策略:P1 固定 'image' */
  fallback?: 'image';
  /** 以下为运行时 checkpoint(LLM 不产出,assets/voice step 写回) */
  asset?: StoryboardSceneAsset;
  voice?: StoryboardSceneVoice;
}

export interface Storyboard {
  title: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  scenes: StoryboardScene[];
}

/** LLM 原始输出(校验前的宽松形态) */
type RawScene = Partial<{
  index: number;
  narration: string;
  visual: Partial<{
    type: string;
    prompt: string | null;
    mediaAssetId: string | null;
    durationHintSec: number;
  }>;
}>;

const VISUAL_TYPES: StoryboardVisualType[] = [
  'video_clip',
  'image',
  'media_asset',
];
const MIN_SCENES = 2;
const MAX_SCENES = 12;
const MIN_DURATION_HINT = 2;
const MAX_DURATION_HINT = 15;

/**
 * 校验并归一化 LLM 分镜输出。非法即抛错(调用方重试/置失败),不做静默修复:
 * LLM 输出契约失败属于 prompt 问题,静默修复会掩盖系统性偏差(QA 视角)。
 *
 * 例外:opts.nativeAudio(原生音频模式)下 image 镜契约归一为 video_clip ——
 * 图片镜没有原生配音,会让旁白在成片中段静默丢失;这与未知 type→image 的
 * 归一同级,是确定性规则而非自由改写(调用方记录被归一的镜数)。
 */
export function parseStoryboard(
  raw: unknown,
  opts: { aspectRatio: string; nativeAudio?: boolean },
): Storyboard {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('分镜输出不是 JSON 对象');
  }
  const obj = raw as Partial<{ title: string; scenes: RawScene[] }>;
  if (!Array.isArray(obj.scenes)) {
    throw new Error('分镜缺少 scenes 数组');
  }
  if (obj.scenes.length < MIN_SCENES || obj.scenes.length > MAX_SCENES) {
    throw new Error(
      `分镜镜数 ${obj.scenes.length} 超出范围 [${MIN_SCENES}, ${MAX_SCENES}]`,
    );
  }
  const aspectRatio = (
    ['16:9', '9:16', '1:1'].includes(opts.aspectRatio)
      ? opts.aspectRatio
      : '9:16'
  ) as Storyboard['aspectRatio'];

  const scenes: StoryboardScene[] = obj.scenes.map((s, i) => {
    const narration = typeof s.narration === 'string' ? s.narration.trim() : '';
    if (!narration) throw new Error(`第 ${i + 1} 镜缺口播文本`);
    let type = VISUAL_TYPES.includes(s.visual?.type as StoryboardVisualType)
      ? (s.visual?.type as StoryboardVisualType)
      : 'image';
    // 原生音频模式:图片镜无原生配音(旁白会静默),契约归一为视频镜
    if (opts.nativeAudio && type === 'image') {
      type = 'video_clip';
    }
    if (type === 'media_asset' && !s.visual?.mediaAssetId) {
      throw new Error(`第 ${i + 1} 镜声明 media_asset 但缺 mediaAssetId`);
    }
    if (type !== 'media_asset') {
      const p =
        typeof s.visual?.prompt === 'string' ? s.visual.prompt.trim() : '';
      if (!p) throw new Error(`第 ${i + 1} 镜缺视觉生成 prompt`);
    }
    const hint = Number(s.visual?.durationHintSec);
    return {
      index: i,
      narration,
      visual: {
        type,
        prompt:
          type === 'media_asset'
            ? null
            : typeof s.visual?.prompt === 'string'
              ? s.visual.prompt.trim()
              : null,
        mediaAssetId: s.visual?.mediaAssetId ?? null,
        durationHintSec:
          Number.isFinite(hint) &&
          hint >= MIN_DURATION_HINT &&
          hint <= MAX_DURATION_HINT
            ? Math.round(hint)
            : 6,
      },
      fallback: 'image' as const,
    };
  });

  return {
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim()
        : '未命名成片',
    aspectRatio,
    scenes,
  };
}

/** 单镜目标时长(秒):有配音按配音,无配音按 hint */
export function sceneDurationSec(scene: StoryboardScene): number {
  if (scene.voice?.durationMs) {
    return Math.max(2, Math.ceil(scene.voice.durationMs / 1000));
  }
  return scene.visual.durationHintSec;
}
