/**
 * @cms-ng/shared
 * 前后端共享的类型定义和常量
 */

// ===== 用户角色 =====
export enum UserRole {
  REPORTER = 'REPORTER',
  EDITOR = 'EDITOR',
  ADMIN = 'ADMIN',
}

// ===== 稿件状态 =====
export enum ArticleStatus {
  DRAFT = 'DRAFT',           // 选题中/草稿
  WRITING = 'WRITING',       // 采写中
  AI_OPTIMIZING = 'AI_OPTIMIZING', // AI优化中
  PENDING_REVIEW = 'PENDING_REVIEW', // 待审核
  IN_REVIEW = 'IN_REVIEW',   // 审核中
  REVISION = 'REVISION',     // 退回修改
  APPROVED = 'APPROVED',     // 审核通过
  PUBLISHED = 'PUBLISHED',   // 已发布
  ARCHIVED = 'ARCHIVED',     // 已归档
}

// ===== 平台类型 =====
export enum Platform {
  WEBSITE = 'WEBSITE',
  FACEBOOK = 'FACEBOOK',
  INSTAGRAM = 'INSTAGRAM',
  X = 'X',
  THREADS = 'THREADS',
  LINKEDIN = 'LINKEDIN',
  XIAOHONGSHU = 'XIAOHONGSHU',
  YOUTUBE = 'YOUTUBE',
  PUSH = 'PUSH',
}

// ===== 平台发布状态 =====
export enum PublishStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  READY = 'READY',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

// ===== AI智能体类型 =====
export enum AgentType {
  STORY = 'STORY',
  RESEARCH = 'RESEARCH',
  WRITING = 'WRITING',
  EDITOR = 'EDITOR',
  REVIEW = 'REVIEW',
  VISUAL = 'VISUAL',
  DISTRIBUTE = 'DISTRIBUTE',
}

// ===== 用户 =====
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  department?: string;
  expertise: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ===== 选题 =====
export interface Story {
  id: string;
  title: string;
  description?: string;
  angle?: string;
  status: ArticleStatus;
  priority: number;
  reporterId: string;
  editorId?: string;
  tags: string[];
  deadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ===== 稿件 =====
export interface Article {
  id: string;
  storyId: string;
  title: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  status: ArticleStatus;
  authorId: string;
  editorId?: string;
  tags: string[];
  coverImage?: string;
  platforms: Platform[];
  aiGeneratedParts?: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

// ===== 平台发布记录 =====
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
  scheduledAt?: Date;
  publishedAt?: Date;
  publishedUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===== 平台元数据 =====
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

// ===== AI操作记录 =====
export interface AIOperation {
  id: string;
  articleId?: string;
  agentType: AgentType;
  action: string;
  prompt: string;
  result?: string;
  model: string;
  tokensUsed?: number;
  durationMs: number;
  createdBy: string;
  createdAt: Date;
}

// ===== API响应格式 =====
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}
