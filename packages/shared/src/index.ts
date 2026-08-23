/**
 * @cms-ng/shared
 * 前后端共享的类型定义和常量
 */

// ===== 用户角色 =====
export enum UserRole {
  REPORTER = 'REPORTER',
  EDITOR = 'EDITOR',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/** SUPER_ADMIN inherits every ADMIN permission; the reverse is never true. */
export function hasRequiredRole(
  role: UserRole | string | null | undefined,
  requiredRoles: readonly UserRole[],
): boolean {
  if (!role) return false;
  if (requiredRoles.includes(role as UserRole)) return true;
  return (
    role === UserRole.SUPER_ADMIN && requiredRoles.includes(UserRole.ADMIN)
  );
}

export function isAdminRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function isEditorRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === UserRole.EDITOR || isAdminRole(role);
}

export function isSuperAdminRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === UserRole.SUPER_ADMIN;
}

// ===== 系统一级功能 =====
export enum SystemFeature {
  WORKBENCH = 'WORKBENCH',
  ARTICLES = 'ARTICLES',
  MEDIA = 'MEDIA',
  VIDEO = 'VIDEO',
  REVIEW = 'REVIEW',
  STORIES = 'STORIES',
  HOT_TOPICS = 'HOT_TOPICS',
  AUTO_PUBLISH = 'AUTO_PUBLISH',
  BILLING = 'BILLING',
  ACCOUNTS = 'ACCOUNTS',
  SETTINGS = 'SETTINGS',
}

export type SystemFeatureGroup = 'WORKSPACE' | 'AUTOMATION' | 'SYSTEM';

export interface SystemFeatureDefinition {
  key: SystemFeature;
  label: string;
  description: string;
  group: SystemFeatureGroup;
  configurable: boolean;
  roles: readonly UserRole[];
  /** Accounts stay reachable by SUPER_ADMIN even when hidden from ADMIN. */
  superAdminAlwaysAvailable?: boolean;
}

const ALL_STAFF_ROLES = [
  UserRole.REPORTER,
  UserRole.EDITOR,
  UserRole.ADMIN,
] as const;
const EDITOR_ROLES = [UserRole.EDITOR, UserRole.ADMIN] as const;
const ADMIN_ROLES = [UserRole.ADMIN] as const;

export const SYSTEM_FEATURE_CATALOG: readonly SystemFeatureDefinition[] = [
  {
    key: SystemFeature.WORKBENCH,
    label: '工作台',
    description: '登录后的默认工作区入口',
    group: 'WORKSPACE',
    configurable: false,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.ARTICLES,
    label: '稿件管理',
    description: '稿件创建、编辑和版本管理',
    group: 'WORKSPACE',
    configurable: true,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.MEDIA,
    label: '媒体库',
    description: '图片上传、检索和素材管理',
    group: 'WORKSPACE',
    configurable: true,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.VIDEO,
    label: '视频创作',
    description: '文生视频和稿件一键成片',
    group: 'WORKSPACE',
    configurable: true,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.REVIEW,
    label: '审核台',
    description: '编辑审核和退修流程',
    group: 'WORKSPACE',
    configurable: true,
    roles: EDITOR_ROLES,
  },
  {
    key: SystemFeature.STORIES,
    label: '选题中心',
    description: '选题发现、研究和采写协作',
    group: 'WORKSPACE',
    configurable: true,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.HOT_TOPICS,
    label: '实时热点',
    description: '热榜与快讯聚合监控(newsnow 数据源)',
    group: 'WORKSPACE',
    configurable: true,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.AUTO_PUBLISH,
    label: '自动发布',
    description: '自动发布任务和运行记录管理',
    group: 'AUTOMATION',
    configurable: true,
    roles: EDITOR_ROLES,
  },
  {
    key: SystemFeature.BILLING,
    label: '计费管理',
    description: '余额、消费记录和计费配置',
    group: 'AUTOMATION',
    configurable: true,
    roles: ALL_STAFF_ROLES,
  },
  {
    key: SystemFeature.ACCOUNTS,
    label: '账号管理',
    description: '账号创建、启停和消费查看',
    group: 'SYSTEM',
    configurable: true,
    roles: ADMIN_ROLES,
    superAdminAlwaysAvailable: true,
  },
  {
    key: SystemFeature.SETTINGS,
    label: '系统设置',
    description: '系统级配置与功能开放管理',
    group: 'SYSTEM',
    configurable: false,
    roles: ADMIN_ROLES,
  },
];

export function getSystemFeatureDefinition(
  feature: SystemFeature,
): SystemFeatureDefinition {
  const definition = SYSTEM_FEATURE_CATALOG.find(
    (item) => item.key === feature,
  );
  if (!definition) {
    throw new Error(`Unknown system feature: ${feature}`);
  }
  return definition;
}

// ===== 稿件状态 =====
export enum ArticleStatus {
  DRAFT = 'DRAFT', // 选题中/草稿
  WRITING = 'WRITING', // 采写中
  AI_OPTIMIZING = 'AI_OPTIMIZING', // AI优化中
  PENDING_REVIEW = 'PENDING_REVIEW', // 待审核
  IN_REVIEW = 'IN_REVIEW', // 审核中
  REVISION = 'REVISION', // 退回修改
  APPROVED = 'APPROVED', // 审核通过
  PUBLISHED = 'PUBLISHED', // 已发布
  ARCHIVED = 'ARCHIVED', // 已归档
  PIPELINE_FAILED = 'PIPELINE_FAILED', // 管道失败（自动发布半成品）
  AUTO_PUBLISHED = 'AUTO_PUBLISHED', // 自动发布
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

// ===== 计费相关枚举 =====
export enum TransactionType {
  TOP_UP = 'TOP_UP',
  AI_LLM = 'AI_LLM',
  AI_IMAGE = 'AI_IMAGE',
  AI_VIDEO = 'AI_VIDEO',
  PUBLISH = 'PUBLISH',
  AUTO_PUBLISH = 'AUTO_PUBLISH',
  DATA_FETCH = 'DATA_FETCH',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  ALIPAY = 'ALIPAY',
  WECHAT_PAY = 'WECHAT_PAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MANUAL = 'MANUAL',
}

export enum BillingCategory {
  AI = 'AI',
  PUBLISHING = 'PUBLISHING',
  OTHER = 'OTHER',
}

// ===== 站内通知 =====
export enum NotificationType {
  TASK = 'TASK',
  BILLING = 'BILLING',
  SYSTEM = 'SYSTEM',
}

export enum NotificationLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  unreadCount: number;
}

// ===== 媒体资源 =====
export enum MediaSource {
  UPLOAD = 'UPLOAD',
  AI_GENERATED = 'AI_GENERATED',
}

export enum MediaStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

export enum MediaLibraryType {
  PERSONAL = 'PERSONAL',
  TEAM = 'TEAM',
}

// ===== 媒体 AI 打标状态 =====
export enum MediaTagStatus {
  /** 未触发(功能关闭期间入库 / 历史资产) */
  NONE = 'NONE',
  /** 已入库待打标 */
  PENDING = 'PENDING',
  /** 打标中(僵尸态由定时任务恢复) */
  TAGGING = 'TAGGING',
  /** 打标完成 */
  DONE = 'DONE',
  /** 打标失败(可重试) */
  FAILED = 'FAILED',
}

// ===== 文生视频(PRD: docs/PRD-text-to-video.md) =====
/** 视频生成 provider(多媒体 seam,与文本 AI_PROVIDER 配置隔离) */
export enum VideoGenProviderName {
  VOLCENGINE = 'volcengine',
  MINIMAX = 'minimax',
}

/** 任务模式:P0 仅 TEXT_TO_CLIP;ARTICLE_TO_VIDEO 为 P1 预留 */
export enum VideoGenerationMode {
  TEXT_TO_CLIP = 'TEXT_TO_CLIP',
  ARTICLE_TO_VIDEO = 'ARTICLE_TO_VIDEO',
}

/** 视频任务状态机(P0 使用子集:PENDING→ASSETS_GENERATING→UPLOADING→SUCCEEDED/FAILED) */
export enum VideoJobStatus {
  PENDING = 'PENDING',
  SCRIPTING = 'SCRIPTING',
  STORYBOARDING = 'STORYBOARDING',
  ASSETS_GENERATING = 'ASSETS_GENERATING',
  VOICE_SYNTHESIZING = 'VOICE_SYNTHESIZING',
  COMPOSING = 'COMPOSING',
  UPLOADING = 'UPLOADING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** 视频任务 VO(后端 Prisma model 的序列化形态) */
export interface VideoGenerationJob {
  id: string;
  mode: VideoGenerationMode;
  status: VideoJobStatus;
  provider: VideoGenProviderName;
  prompt: string;
  articleId?: string;
  durationSec?: number;
  resolution?: string;
  aspectRatio?: string;
  costEstimate?: number;
  costActual?: number;
  resultAssetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
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
  balance?: number;
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
  /** Optional author persona slug (e.g. 'author-luxun') from data/authors/.
   *  When set, auto-published drafts adopt that author's voice. */
  authorSlug?: string;
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

// ===== Pipeline 执行追踪 (Execution Trace) =====

export interface StepTraceEntry {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  decisions?: string[];
  error?: {
    message: string;
    stack?: string;
  };
}

export type PipelineStepName =
  | 'billing_check'
  | 'topic-collection'
  | 'research'
  | 'article-generation'
  | 'article-save'
  | 'image-generation'
  | 'publish'
  | 'notification';

export interface TopicCollectionTraceMetadata {
  sources: {
    fixedKeywords: { count: number; items: string[] };
    trendingTopics: { count: number; items: string[] };
  };
  rawCandidateCount: number;
  afterFilterCount: number;
  afterDedupCount: number;
  selectionMethod?: string;
  todayArticleCount?: number;
  selectedIndex?: number;
  allCandidates?: string[];
}

export interface ResearchTraceMetadata {
  researchKit: {
    timelineCount: number;
    peopleCount: number;
    dataCount: number;
    opinionsCount: number;
  };
  searchSources: string[];
  fullResearchKit?: Record<string, unknown>;
}

export interface BillingCheckTraceMetadata {
  balanceCheckEnabled: boolean;
  currentBalance?: number;
  estimatedCost?: number;
  breakdown?: Array<Record<string, unknown>>;
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
  executionTrace?: StepTraceEntry[] | null;
  totalDurationMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== 计费接口 =====
export interface BillingConfigItem {
  id: string;
  category: BillingCategory;
  itemKey: string;
  itemName: string;
  unitPrice: number;
  unit: string;
  isActive: boolean;
}

export interface BillingTransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  category: BillingCategory;
  amount: number;
  balanceAfter: number;
  description: string;
  articleId?: string;
  aiOperationId?: string;
  platformPublishId?: string;
  quantity?: number;
  unitPrice?: number;
  status: TransactionStatus;
  createdAt: Date;
}

export interface BalanceInfo {
  balance: number;
  alertThreshold: number | null;
  recentTransactions: BillingTransactionRecord[];
}

export interface CostEstimate {
  estimatedCost: number;
  breakdown: Array<{
    item: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  sufficientBalance: boolean;
  currentBalance: number;
}

export interface TopUpRecordInfo {
  id: string;
  userId: string;
  amount: number;
  creditsAdded: number;
  bonusCredits: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  paidAt?: Date;
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

// ===== 选题数据源 =====
export type TopicSourceCategory =
  | 'news'
  | 'trending'
  | 'social'
  | 'culture'
  | 'history';

export type TopicSourceParameter =
  | {
      key: string;
      label: string;
      kind: 'select';
      defaultValue?: string | number;
      options: Array<{ value: string | number; label: string }>;
    }
  | {
      key: string;
      label: string;
      kind: 'date' | 'text' | 'combobox';
      defaultValue?: string;
      placeholder?: string;
      options?: Array<{ value: string; label: string }>;
    };

export interface TopicSourceDefinition {
  id: string;
  label: string;
  category: TopicSourceCategory;
  icon: 'newspaper' | 'trending' | 'flame' | 'video' | 'social' | 'calendar';
  /** 热榜卡片墙的列表形态:hottest=名次榜单,realtime=快讯时间线(目前仅 newsnow 源设置)。 */
  listType?: 'hottest' | 'realtime';
  parameters?: TopicSourceParameter[];
  aggregate?: boolean;
  autoFetch?: boolean;
  manualRefresh?: boolean;
  visible?: boolean;
}

export interface TopicCandidateLink {
  title: string;
  source: string;
  snippet: string;
  url: string;
}

export interface TopicCandidate {
  title: string;
  description: string;
  source: string;
  heatScore: number;
  tags: string[];
  articles: TopicCandidateLink[];
  /** 条目发布时间(ISO 8601);仅带时间的源(如 newsnow 快讯类)填充。 */
  publishedAt?: string;
  coverImage?: string;
  year?: number;
  type?: string;
}

export interface TopicSourcePage {
  items: TopicCandidate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  status?: 'available' | 'degraded' | 'unavailable';
  warnings?: string[];
  fetchedAt?: string;
}
