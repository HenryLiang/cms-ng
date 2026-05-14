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
