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
  /** 片段模型支持原生音频(Seedance 1.5+/2.x)= 唯一配音通道;false 时 L2 成片无配音(纯字幕) */
  nativeAudio: boolean;
  /** L1 多模态参考物能力(PRD §18):可用角色 + 数量上限 + 互斥约束 */
  references: {
    roles: VideoReferenceRole[];
    limits: Record<VideoReferenceRole, number>;
    /** 帧角色(首/尾帧)与参考角色(图/视频/音频)互斥(Seedance 2.x 实测) */
    frameReferenceExclusive: boolean;
  };
  /** L1 可选参数:seed 复现 / draft 打样 / 尾帧续拍链 */
  seed: boolean;
  draft: boolean;
  returnLastFrame: boolean;
  /** 时长能力:free=自由输入(min~max 整数),fixed=档位下拉(allowed)*/
  duration: {
    mode: 'free' | 'fixed';
    min: number;
    max: number;
    allowed?: number[];
  };
  /** 本地 FFmpeg 渲染开关 */
  render: boolean;
}

/** 多模态参考物角色(与后端 VideoGenProvider 契约一致) */
export type VideoReferenceRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

export interface VideoReference {
  role: VideoReferenceRole;
  url: string;
}

/** 后端 list 返回形态:{ items, meta } */
export interface VideoJobListResponse {
  items: VideoGenerationJobVo[];
  meta: { page: number; pageSize: number; total: number };
}

/** 后端 VO:在 shared VideoGenerationJob 基础上带成片播放 URL + L2 管线产物 */
export interface VideoGenerationJobVo extends VideoGenerationJob {
  resultUrl: string | null;
  /** returnLastFrame 任务的尾帧图 URL(续拍链素材,已入媒体库) */
  lastFrameUrl: string | null;
  /** L1 提交的可选参数 JSON 字符串(references/seed/draft/returnLastFrame) */
  submitOptions?: string | null;
  /** L2 口播脚本(原始文本) */
  script?: string | null;
  /** L2 分镜 JSON 字符串(见 StoryboardVo) */
  storyboard?: string | null;
  /** 实际配音通道;'none' 无配音降级;'native' 视频模型原生音频 */
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
  /** L1 多模态参考素材(角色可用性/数量上限见 capability.references) */
  references?: VideoReference[];
  /** L1 随机种子(Seedance 2.x):相同 seed 复现 */
  seed?: number;
  /** L1 草稿模式(Seedance 2.x):更快更便宜,用于打样 */
  draft?: boolean;
  /** L1 返回尾帧图入媒体库(Seedance 2.x):续拍链 */
  returnLastFrame?: boolean;
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
