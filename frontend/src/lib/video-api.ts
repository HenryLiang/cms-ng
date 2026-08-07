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
}

/** 后端 list 返回形态:{ items, meta } */
export interface VideoJobListResponse {
  items: VideoGenerationJobVo[];
  meta: { page: number; pageSize: number; total: number };
}

/** 后端 VO:在 shared VideoGenerationJob 基础上带成片播放 URL */
export interface VideoGenerationJobVo extends VideoGenerationJob {
  resultUrl: string | null;
}

export interface CreateVideoJobParams {
  prompt: string;
  durationSec?: number;
  resolution?: '768P' | '1080P';
  aspectRatio?: '16:9' | '9:16' | '1:1';
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
