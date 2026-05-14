import { api } from './api';

type ArticleStatus = 'DRAFT' | 'WRITING' | 'AI_OPTIMIZING' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'REVISION' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface Article {
  id: string;
  storyId: string;
  title: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  status: ArticleStatus;
  tags: string[];
  authorId: string;
  editorId?: string;
  author?: { id: string; name: string; email: string };
  editor?: { id: string; name: string; email: string };
  story?: { id: string; title: string };
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface CreateArticleInput {
  storyId: string;
  title: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  status?: ArticleStatus;
  tags?: string[];
}

export interface UpdateArticleInput extends Partial<CreateArticleInput> {}

export async function getArticles(storyId?: string): Promise<Article[]> {
  const res = await api.get('/articles', { params: { storyId } });
  return res.data;
}

export async function getArticle(id: string): Promise<Article> {
  const res = await api.get(`/articles/${id}`);
  return res.data;
}

export async function createArticle(data: CreateArticleInput): Promise<Article> {
  const res = await api.post('/articles', data);
  return res.data;
}

export async function updateArticle(id: string, data: UpdateArticleInput): Promise<Article> {
  const res = await api.patch(`/articles/${id}`, data);
  return res.data;
}

export async function deleteArticle(id: string): Promise<void> {
  await api.delete(`/articles/${id}`);
}

// ===== AI Operations =====
export async function aiRewrite(
  id: string,
  text: string,
  style?: string,
  instruction?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-rewrite`, { text, style, instruction });
  return res.data.result;
}

export async function aiExpand(id: string, text: string, instruction?: string): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-expand`, { text, instruction });
  return res.data.result;
}

export async function aiCondense(id: string, text: string, maxLength?: number): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-condense`, { text, maxLength });
  return res.data.result;
}

export async function aiPolish(id: string, text: string): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-polish`, { text });
  return res.data.result;
}

export interface HeadlineOption {
  title: string;
  style: string;
  reasoning: string;
}

export async function aiHeadlines(id: string, count?: number): Promise<HeadlineOption[]> {
  const res = await api.post(`/articles/${id}/ai-headlines`, { count });
  return res.data.headlines;
}

export async function aiExcerpt(id: string, maxLength?: number): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-excerpt`, { maxLength });
  return res.data.excerpt;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function aiChat(id: string, messages: ChatMessage[]): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-chat`, { messages });
  return res.data.reply;
}
