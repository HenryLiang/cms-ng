import { api } from './api';

type TopicStatus = 'OPEN' | 'ADOPTED' | 'ARCHIVED';

export interface TrendingTopic {
  id: string;
  title: string;
  description?: string;
  source?: string;
  heatScore: number;
  tags: string[];
  status: TopicStatus;
  suggestedAngles?: string[];
  createdBy: string;
  adoptedStoryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorySuggestion {
  title: string;
  description: string;
  suggestedAngle: string;
  reason: string;
}

export interface GoogleTrendItem {
  title: string;
  description: string;
  source: string;
  heatScore: number;
  tags: string[];
  articles?: {
    title: string;
    source: string;
    snippet: string;
    url: string;
  }[];
}

export interface PaginatedNewsResponse {
  items: GoogleTrendItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateTopicInput {
  title: string;
  description?: string;
  source?: string;
  heatScore?: number;
  tags?: string[];
  status?: TopicStatus;
}

export interface UpdateTopicInput extends Partial<CreateTopicInput> {}

export async function getTopics(): Promise<TrendingTopic[]> {
  const res = await api.get('/trending-topics');
  return res.data;
}

export async function getTopic(id: string): Promise<TrendingTopic> {
  const res = await api.get(`/trending-topics/${id}`);
  return res.data;
}

export async function createTopic(data: CreateTopicInput): Promise<TrendingTopic> {
  const res = await api.post('/trending-topics', data);
  return res.data;
}

export async function updateTopic(id: string, data: UpdateTopicInput): Promise<TrendingTopic> {
  const res = await api.patch(`/trending-topics/${id}`, data);
  return res.data;
}

export async function deleteTopic(id: string): Promise<void> {
  await api.delete(`/trending-topics/${id}`);
}

export async function getAISuggestions(): Promise<StorySuggestion[]> {
  const res = await api.post('/trending-topics/suggestions');
  return res.data;
}

export async function adoptTopic(topicId: string): Promise<{ storyId: string; topicId: string }> {
  const res = await api.post(`/trending-topics/${topicId}/adopt`);
  return res.data;
}

export async function getGoogleTrends(
  geo: string,
  timeRange: string,
  page = 1,
  limit = 10,
): Promise<PaginatedNewsResponse> {
  const res = await api.get('/trending-topics/google-trends', {
    params: { geo, timeRange, page, limit },
  });
  return res.data;
}

export async function getNewsBySource(
  source: string,
  page = 1,
  limit = 10,
): Promise<PaginatedNewsResponse> {
  const res = await api.get(`/trending-topics/${source}`, {
    params: { page, limit },
  });
  return res.data;
}

export async function importGoogleTrend(data: GoogleTrendItem): Promise<TrendingTopic> {
  const res = await api.post('/trending-topics/import-google-trend', data);
  return res.data;
}

/** 通用导入：source 由调用方传入（x-trends / x-accounts / 任意）。 */
export async function importTopic(
  data: GoogleTrendItem & { source?: string },
): Promise<TrendingTopic> {
  const res = await api.post('/trending-topics/import', data);
  return res.data;
}

// ─── X (Twitter) 数据源 ───

export interface XWoeid {
  woeid: number;
  label: string;
}

export interface XWatchAccount {
  id: string;
  userName: string;
  displayName?: string | null;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getXTrends(
  woeid: number,
  page = 1,
  limit = 10,
): Promise<PaginatedNewsResponse> {
  const res = await api.get('/trending-topics/x-trends', {
    params: { woeid, page, limit },
  });
  return res.data;
}

export async function getXWoeids(): Promise<XWoeid[]> {
  const res = await api.get('/trending-topics/x-trends/woeids');
  return res.data;
}

export async function getXAccounts(
  page = 1,
  limit = 20,
): Promise<PaginatedNewsResponse> {
  const res = await api.get('/trending-topics/x-accounts', {
    params: { page, limit },
  });
  return res.data;
}

export async function getXAccountTweets(
  userName: string,
  limit?: number,
): Promise<GoogleTrendItem[]> {
  const res = await api.get(`/trending-topics/x-accounts/${userName}`, {
    params: limit ? { limit } : {},
  });
  return res.data;
}

export async function getXWatchAccounts(): Promise<XWatchAccount[]> {
  const res = await api.get('/trending-topics/x-watch');
  return res.data;
}

export async function addXWatchAccount(data: {
  userName: string;
  displayName?: string;
  category?: string;
}): Promise<XWatchAccount> {
  const res = await api.post('/trending-topics/x-watch', data);
  return res.data;
}

export async function removeXWatchAccount(id: string): Promise<void> {
  await api.delete(`/trending-topics/x-watch/${id}`);
}
