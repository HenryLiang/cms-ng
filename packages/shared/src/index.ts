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
  PIPELINE_FAILED = 'PIPELINE_FAILED', // 管道失败（自动发布半成品）
  AUTO_PUBLISHED = 'AUTO_PUBLISHED',   // 自动发布
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
  WORDPRESS = 'WORDPRESS',
}

// ===== 内容语言 =====
export enum ContentLanguage {
  SIMPLIFIED_CHINESE = 'SIMPLIFIED_CHINESE',
  TRADITIONAL_CHINESE_HK = 'TRADITIONAL_CHINESE_HK',
  TRADITIONAL_CHINESE_CANTONESE = 'TRADITIONAL_CHINESE_CANTONESE',
  ENGLISH = 'ENGLISH',
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
  preferredLanguage?: ContentLanguage;
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
  contentLanguage?: ContentLanguage;
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
  contentLanguage?: ContentLanguage;
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

// ===== 自动发布任务状态 =====
export enum AutoTaskStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
}

// ===== 调度类型 =====
export enum ScheduleType {
  FIXED_TIME = 'FIXED_TIME',
  INTERVAL = 'INTERVAL',
  CRON = 'CRON',
}

// ===== 运行状态 =====
export enum RunStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

// ===== 文章运行状态 =====
export enum ArticleRunStatus {
  PENDING = 'PENDING',
  TOPIC_SELECTED = 'TOPIC_SELECTED',
  RESEARCHED = 'RESEARCHED',
  DRAFTED = 'DRAFTED',
  IMAGED = 'IMAGED',
  SAVED = 'SAVED',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  WITHDRAWN = 'WITHDRAWN',
}

// ===== 触发类型 =====
export enum TriggerType {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
}

// ===== 自动发布任务配置接口 =====
export interface AutoPublishScheduleConfig {
  times: string[];
  timezone: string;
}

export interface AutoPublishTopicStrategy {
  fixedKeywords: string[];
  useTrending: boolean;
  trendingSources: string[];
}

export interface AutoPublishContentConfig {
  style: string;
  maxLength: number;
  language: ContentLanguage;
  systemPrompt?: string;
}

export interface AutoPublishFilterConfig {
  blockedCategories: string[];
  blockedKeywords: string[];
  allowedChannels: string[];
}

export interface AutoPublishPublishConfig {
  platform: Platform;
  wordpressSiteId?: string;
  category?: string;
  postStatus?: string;
}

export interface AutoPublishRetryConfig {
  maxRetries: number;
  retryDelayMs: number;
}

// ===== 自动发布任务 =====
export interface AutoPublishTask {
  id: string;
  name: string;
  description?: string;
  status: AutoTaskStatus;
  scheduleType: ScheduleType;
  scheduleConfig: AutoPublishScheduleConfig;
  topicStrategy: AutoPublishTopicStrategy;
  contentConfig: AutoPublishContentConfig;
  filterConfig: AutoPublishFilterConfig;
  publishConfig: AutoPublishPublishConfig;
  batchSize: number;
  retryConfig: AutoPublishRetryConfig;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===== 自动发布运行记录 =====
export interface AutoPublishRun {
  id: string;
  taskId: string;
  status: RunStatus;
  startedAt: Date;
  completedAt?: Date;
  totalArticles: number;
  successCount: number;
  failedCount: number;
  errorLog?: string;
  triggerType: TriggerType;
  articles?: AutoPublishArticle[];
}

// ===== 自动发布文章追踪 =====
export interface AutoPublishArticle {
  id: string;
  runId: string;
  taskId: string;
  status: ArticleRunStatus;
  topic?: string;
  articleId?: string;
  platformPublishId?: string;
  failedStep?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
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
