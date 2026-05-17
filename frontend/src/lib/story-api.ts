import { api } from './api';

type ArticleStatus = 'DRAFT' | 'WRITING' | 'AI_OPTIMIZING' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'REVISION' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface Story {
  id: string;
  title: string;
  description?: string;
  angle?: string;
  status: ArticleStatus;
  priority: number;
  tags: string[];
  deadline?: string;
  reporterId: string;
  editorId?: string;
  reporter?: { id: string; name: string; email: string };
  editor?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  _count?: { articles: number };
}

export interface CreateStoryInput {
  title: string;
  description?: string;
  angle?: string;
  status?: ArticleStatus;
  priority?: number;
  tags?: string[];
  deadline?: string;
}

export interface UpdateStoryInput extends Partial<CreateStoryInput> {}

export async function getStories(): Promise<Story[]> {
  const res = await api.get('/stories');
  return res.data;
}

export async function getStory(id: string): Promise<Story> {
  const res = await api.get(`/stories/${id}`);
  return res.data;
}

export async function createStory(data: CreateStoryInput): Promise<Story> {
  const res = await api.post('/stories', data);
  return res.data;
}

export async function updateStory(id: string, data: UpdateStoryInput): Promise<Story> {
  const res = await api.patch(`/stories/${id}`, data);
  return res.data;
}

export async function deleteStory(id: string): Promise<void> {
  await api.delete(`/stories/${id}`);
}

export interface ResearchKitTimelineEvent {
  date: string;
  event: string;
  source?: string;
}

export interface ResearchKitPerson {
  name: string;
  role: string;
  background?: string;
}

export interface ResearchKitDataPoint {
  label: string;
  value: string;
  source?: string;
}

export interface ResearchKitOpinion {
  source: string;
  viewpoint: string;
  stance?: string;
}

export interface ResearchKitResult {
  timeline: ResearchKitTimelineEvent[];
  people: ResearchKitPerson[];
  data: ResearchKitDataPoint[];
  opinions: ResearchKitOpinion[];
  relatedArticles?: string[];
}

export async function generateResearchKit(storyId: string): Promise<ResearchKitResult> {
  const res = await api.post(`/stories/${storyId}/research`);
  return res.data;
}
