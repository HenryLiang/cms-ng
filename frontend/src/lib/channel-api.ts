import { Platform, PublishStatus } from '@cms-ng/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function getToken() {
  return localStorage.getItem('accessToken') || '';
}

export interface PlatformPublish {
  id: string;
  articleId: string;
  platform: Platform;
  status: PublishStatus;
  adaptedTitle?: string;
  adaptedContent?: string;
  adaptedExcerpt?: string;
  adaptedTags: string[];
  coverImages: string[];
  scheduledAt?: string;
  publishedAt?: string;
  publishedUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformMetadata {
  key: Platform;
  name: string;
  description: string;
  maxTitleLength?: number;
  maxContentLength?: number;
  supportsImages: boolean;
  supportsVideo: boolean;
  aspectRatios: string[];
  styleGuide: string;
}

export async function getPlatforms(): Promise<PlatformMetadata[]> {
  const res = await fetch(`${API_BASE}/channels/platforms`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch platforms');
  return res.json();
}

export async function getPublishes(articleId: string): Promise<PlatformPublish[]> {
  const res = await fetch(`${API_BASE}/channels/${articleId}/publishes`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch publishes');
  return res.json();
}

export async function generateAdaptation(
  articleId: string,
  platform: Platform,
  customPrompt?: string,
): Promise<PlatformPublish> {
  const res = await fetch(`${API_BASE}/channels/${articleId}/adapt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ platform, customPrompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || 'Failed to generate adaptation');
  }
  return res.json();
}

export async function updatePublish(
  articleId: string,
  publishId: string,
  data: { status?: PublishStatus; publishedUrl?: string; notes?: string },
): Promise<PlatformPublish> {
  const res = await fetch(`${API_BASE}/channels/${articleId}/publishes/${publishId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update publish');
  return res.json();
}

export async function deletePublish(articleId: string, publishId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/channels/${articleId}/publishes/${publishId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to delete publish');
  return res.json();
}

export async function publishToWordPress(
  articleId: string,
  wpStatus: 'publish' | 'draft' = 'publish',
): Promise<PlatformPublish> {
  const res = await fetch(`${API_BASE}/channels/${articleId}/publish-wordpress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ wpStatus }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || 'Failed to publish to WordPress');
  }
  return res.json();
}
