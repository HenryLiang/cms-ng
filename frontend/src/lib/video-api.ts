import { api } from './api';
import type {
  VideoGenProviderName,
  VideoGenerationJob,
  VideoGenerationMode,
  VideoJobStatus,
} from '@cms-ng/shared';

export type {
  VideoGenProviderName,
  VideoGenerationJob,
  VideoGenerationMode,
  VideoJobStatus,
};

export interface VideoCapability {
  enabled: boolean;
  provider: VideoGenProviderName | null;
  defaults: {
    durationSec: number;
    resolution: string;
    aspectRatio: string;
  };
  /** L2(稿件一键成片)可用:渲染开关 + 图片 provider 均就绪 */
  l2: boolean;
  /** TTS 已配置;false 时 L2 成片降级为无配音(或原生音频) */
  tts: boolean;
  /** 片段模型支持原生音频(Seedance 1.5+/2.x);无 TTS 时用作配音通道 */
  nativeAudio: boolean;
  /** 本地 FFmpeg 渲染开关 */
  render: boolean;
}

/** 后端 list 返回形态:{ items, meta } */
export interface VideoJobListResponse {
  items: VideoGenerationJobVo[];
  meta: { page: number; pageSize: number; total: number };
}

/** 后端 VO:在 shared VideoGenerationJob 基础上带成片播放 URL + L2 管线产物 */
export interface VideoGenerationJobVo extends VideoGenerationJob {
  resultUrl: string | null;
  /** L2 口播脚本(原始文本) */
  script?: string | null;
  /** L2 分镜 JSON 字符串(见 StoryboardVo) */
  storyboard?: string | null;
  /** 实际配音 provider;'none' 无配音降级;'native' 视频模型原生音频 */
  ttsProvider?: string | null;
}

/** L2 分镜(与后端 pipeline/storyboard.types.ts 契约一致,仅展示所需字段) */
export interface StoryboardSceneVo {
  index: number;
  narration: string;
  visual: { type: 'video' | 'image'; prompt: string; durationHintSec: number };
  asset?: {
    status: 'pending' | 'submitted' | 'done' | 'failed';
    url?: string;
    error?: string;
  };
  voice?: { audioUrl: string; durationMs: number };
}

export interface StoryboardVo {
  title: string;
  aspectRatio: string;
  scenes: StoryboardSceneVo[];
}

/** 分镜 JSON 安全解析(契约不符/未生成时返回 null) */
export function parseStoryboardVo(raw?: string | null): StoryboardVo | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoryboardVo;
    if (!parsed || !Array.isArray(parsed.scenes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface CreateVideoJobParams {
  /** TEXT_TO_CLIP 必填;ARTICLE_TO_VIDEO 由后端取稿件标题 */
  prompt?: string;
  mode?: VideoGenerationMode;
  /** ARTICLE_TO_VIDEO 必填 */
  articleId?: string;
  durationSec?: number;
  /** 480P/720P 为 Seedance 2.x 档(2.0-mini 仅这两档);MiniMax 无 480P 档 */
  resolution?: '480P' | '768P' | '1080P';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** L1 原生音频(Seedance 1.5+/2.x):生成有声视频;provider 不支持时静默忽略 */
  generateAudio?: boolean;
}

export async function getVideoCapability(): Promise<VideoCapability> {
  const res = await api.get('/video/capability');
  return res.data;
}

export async function createVideoJob(
  params: CreateVideoJobParams,
): Promise<VideoGenerationJobVo> {
  const res = await api.post('/video/jobs', params);
  return res.data;
}

export async function listVideoJobs(params?: {
  page?: number;
  pageSize?: number;
  status?: VideoJobStatus;
}): Promise<VideoJobListResponse> {
  const res = await api.get('/video/jobs', { params });
  return res.data;
}

export async function retryVideoJob(id: string): Promise<VideoGenerationJobVo> {
  const res = await api.post(`/video/jobs/${id}/retry`);
  return res.data;
}

export async function cancelVideoJob(id: string): Promise<VideoGenerationJobVo> {
  const res = await api.post(`/video/jobs/${id}/cancel`);
  return res.data;
}
