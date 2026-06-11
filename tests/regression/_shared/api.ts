/**
 * Shared API helpers — typed wrappers over the QA backend.
 */
import { APIRequestContext, expect } from '@playwright/test';
import { QA_API } from './fixtures';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EDITOR' | 'REPORTER';
  preferredLanguage?: string | null;
}

export interface ApiStory {
  id: string;
  title: string;
  description?: string;
  status: string;
  contentLanguage?: string | null;
  createdById: string;
}

export interface ApiArticle {
  id: string;
  title: string;
  content: string;
  status: string;
  contentLanguage?: string | null;
  storyId?: string | null;
  authorId: string;
  tags?: string[];
}

export async function listStories(api: APIRequestContext, token: string) {
  const r = await api.get('/stories', { headers: { Authorization: `Bearer ${token}` } });
  return r;
}

export async function createStory(api: APIRequestContext, token: string, body: Partial<ApiStory>) {
  return api.post('/stories', {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function listArticles(api: APIRequestContext, token: string) {
  return api.get('/articles', { headers: { Authorization: `Bearer ${token}` } });
}

export async function createArticle(api: APIRequestContext, token: string, body: Partial<ApiArticle>) {
  return api.post('/articles', {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function patchArticle(api: APIRequestContext, token: string, id: string, body: any) {
  return api.patch(`/articles/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function reviewArticle(
  api: APIRequestContext,
  token: string,
  id: string,
  body: { decision: 'APPROVE' | 'REVISION'; comment?: string },
) {
  return api.patch(`/articles/${id}/review`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function reviewQueue(api: APIRequestContext, token: string) {
  return api.get('/articles/review-queue', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function bootstrapStory(api: APIRequestContext, token: string, titleTag: string): Promise<string> {
  const res = await api.post('/stories', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: `${titleTag}-${uniqueSuffix()}` },
  });
  if (!res.ok()) throw new Error(`bootstrapStory failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return body.id;
}

export async function registerUser(
  api: APIRequestContext,
  body: { email: string; name: string; password: string; role?: 'ADMIN' | 'EDITOR' | 'REPORTER' },
) {
  return api.post('/auth/register', { data: body });
}

export async function patchUser(api: APIRequestContext, token: string, id: string, body: any) {
  return api.patch(`/users/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function getMe(api: APIRequestContext, token: string) {
  return api.get('/users/me', { headers: { Authorization: `Bearer ${token}` } });
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export { QA_API };
