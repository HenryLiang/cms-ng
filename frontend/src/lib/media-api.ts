import { api } from './api';
import { MediaSource, MediaStatus } from '@cms-ng/shared';
import type { PaginatedResponse } from './article-api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface MediaAsset {
  id: string;
  storageKey: string;
  url: string;
  thumbnailUrl?: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  source: MediaSource;
  sourceRef?: string | null;
  prompt?: string | null;
  altText?: string | null;
  title?: string | null;
  description?: string | null;
  tags: string[];
  ownerId: string;
  libraryType: 'PERSONAL' | 'TEAM';
  teamId?: string | null;
  status: MediaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GetMediaParams {
  source?: MediaSource;
  status?: MediaStatus;
  search?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateMediaInput {
  altText?: string;
  title?: string;
  description?: string;
  tags?: string[];
  status?: MediaStatus;
}

export async function getMediaAssets(
  params: GetMediaParams = {},
): Promise<PaginatedResponse<MediaAsset>> {
  const res = await api.get('/media', { params });
  return res.data;
}

export async function getMediaAsset(id: string): Promise<MediaAsset> {
  const res = await api.get(`/media/${id}`);
  return res.data;
}

export async function updateMedia(
  id: string,
  input: UpdateMediaInput,
): Promise<MediaAsset> {
  const res = await api.patch(`/media/${id}`, input);
  return res.data;
}

export async function deleteMedia(id: string): Promise<void> {
  await api.delete(`/media/${id}`);
}

/**
 * 上传图片（多文件，后端中转存 COS）。
 * 用 fetch 而非 axios：axios 实例默认 Content-Type: application/json 会覆盖
 * FormData 的 multipart，导致后端 multer 拿不到 boundary。fetch 让浏览器自动
 * 设置 multipart/form-data; boundary=...，单文件大小/类型由后端校验。
 */
export async function uploadMedia(files: File[]): Promise<MediaAsset[]> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { message?: string });
    const err = new Error(data?.message || '上传失败');
    (err as Error & { response?: unknown }).response = {
      status: res.status,
      data,
    };
    throw err;
  }
  return res.json();
}
