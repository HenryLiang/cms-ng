import { api } from './api';
import { ContentLanguage } from '@cms-ng/shared';

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
  coverImage?: string;
  version: number;
  contentLanguage?: ContentLanguage;
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
  contentLanguage?: ContentLanguage;
}

export interface UpdateArticleInput extends Partial<CreateArticleInput> {
  editorId?: string;
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface GetArticlesParams {
  storyId?: string;
  page?: number;
  pageSize?: number;
}

export async function getArticles(
  params: GetArticlesParams = {},
): Promise<PaginatedResponse<Article>> {
  const res = await api.get('/articles', { params });
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

// ===== Version History =====
export interface ArticleVersion {
  id: string;
  version: number;
  title: string;
  createdAt: string;
}

export async function getArticleVersions(id: string): Promise<ArticleVersion[]> {
  const res = await api.get(`/articles/${id}/versions`);
  return res.data;
}

export async function rollbackArticle(id: string, version: number): Promise<Article> {
  const res = await api.post(`/articles/${id}/rollback/${version}`);
  return res.data;
}

// ===== AI Operations =====
export async function aiRewrite(
  id: string,
  text: string,
  style?: string,
  instruction?: string,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-rewrite`, { text, style, instruction, language, authorSlug });
  return res.data.result;
}

export async function aiExpand(
  id: string,
  text: string,
  instruction?: string,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-expand`, { text, instruction, language, authorSlug });
  return res.data.result;
}

export async function aiCondense(
  id: string,
  text: string,
  maxLength?: number,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-condense`, { text, maxLength, language, authorSlug });
  return res.data.result;
}

export async function aiPolish(
  id: string,
  text: string,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-polish`, { text, language, authorSlug });
  return res.data.result;
}

export interface HeadlineOption {
  title: string;
  style: string;
  reasoning: string;
}

export async function aiHeadlines(
  id: string,
  count?: number,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<HeadlineOption[]> {
  const res = await api.post(`/articles/${id}/ai-headlines`, { count, language, authorSlug });
  return res.data.headlines;
}

export async function aiExcerpt(
  id: string,
  maxLength?: number,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-excerpt`, { maxLength, language, authorSlug });
  return res.data.excerpt;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function aiChat(
  id: string,
  messages: ChatMessage[],
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<string> {
  const res = await api.post(`/articles/${id}/ai-chat`, { messages, language, authorSlug });
  return res.data.reply;
}

export interface DraftResult {
  title: string;
  subtitle?: string;
  content: string;
}

export async function aiGenerateDraft(
  id: string,
  instruction?: string,
  language?: ContentLanguage,
  authorSlug?: string,
): Promise<DraftResult> {
  const res = await api.post(`/articles/${id}/ai-draft`, { instruction, language, authorSlug });
  return res.data;
}

export interface FactCheckFinding {
  type: 'fact' | 'inconsistency' | 'dispute' | 'source_needed' | 'risk';
  text: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface FactCheckResult {
  score: number;
  summary: string;
  findings: FactCheckFinding[];
}

export async function aiFactCheck(id: string, language?: ContentLanguage): Promise<FactCheckResult> {
  const res = await api.post(`/articles/${id}/ai-fact-check`, { language });
  return res.data;
}

export interface ReviewDimension {
  name: string;
  score: number;
  maxScore: number;
  comment: string;
}

export interface ReviewSuggestion {
  dimension: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface ReviewReportResult {
  overallScore: number;
  summary: string;
  dimensions: ReviewDimension[];
  suggestions: ReviewSuggestion[];
}

export async function aiReviewReport(id: string, language?: ContentLanguage): Promise<ReviewReportResult> {
  const res = await api.post(`/articles/${id}/ai-review`, { language });
  return res.data;
}

export interface SEOKeyword {
  keyword: string;
  searchVolume: 'high' | 'medium' | 'low';
}

export interface SEOSuggestion {
  category: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface SEOResult {
  overallScore: number;
  readabilityScore: number;
  optimizedTitle: { title: string; reasoning: string }[];
  metaDescription: string;
  keywords: SEOKeyword[];
  suggestions: SEOSuggestion[];
}

export async function aiOptimizeSEO(id: string, language?: ContentLanguage): Promise<SEOResult> {
  const res = await api.post(`/articles/${id}/ai-seo`, { language });
  return res.data;
}

// ===== AI GEO (Generative Engine Optimization) =====
// Mirrors the backend GEOResult in ai/dto/writing-operations.dto.ts. When one
// changes, both should change together.

export interface GEOEntity {
  name: string;
  type: 'person' | 'org' | 'place' | 'date' | 'stat';
}

export interface GEOSuggestion {
  category: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface GEOSuggestedQuestion {
  question: string;
  answerSnippet: string;
}

export interface GEOKeyStatement {
  statement: string;
  reason: string;
}

export interface GEOResult {
  overallScore: number;
  citationScore: number;
  answerReadinessScore: number;
  optimizedSummary: string;
  suggestedQuestions: GEOSuggestedQuestion[];
  keyStatements: GEOKeyStatement[];
  entities: GEOEntity[];
  suggestions: GEOSuggestion[];
}

export async function aiOptimizeGEO(id: string, language?: ContentLanguage): Promise<GEOResult> {
  const res = await api.post(`/articles/${id}/ai-geo`, { language });
  return res.data;
}

// ===== AI Image Generation =====

export interface GenerateImageInput {
  style?: 'news' | 'illustration' | 'photo' | 'social';
  aspectRatio?: string;
  size?: '2K' | '3K' | '4K';
  customPrompt?: string;
}

export interface GenerateImageResult {
  url: string;
  prompt: string;
}

export async function aiGenerateImage(id: string, options?: GenerateImageInput): Promise<GenerateImageResult> {
  const res = await api.post(`/articles/${id}/ai-generate-image`, options, { timeout: 180000 });
  return res.data;
}
