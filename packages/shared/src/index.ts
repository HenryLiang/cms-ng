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

// ===== AI 初稿文体 =====
export enum ArticleGenre {
  STRAIGHT_NEWS = 'STRAIGHT_NEWS',
  NEWS_BRIEF = 'NEWS_BRIEF',
  IN_DEPTH_REPORT = 'IN_DEPTH_REPORT',
  FEATURE_STORY = 'FEATURE_STORY',
  NEWS_COMMENTARY = 'NEWS_COMMENTARY',
  INTERVIEW = 'INTERVIEW',
  EXPLAINER = 'EXPLAINER',
}

export const DEFAULT_DRAFT_WORD_COUNT = 1500;
export const MIN_DRAFT_WORD_COUNT = 100;
export const MAX_DRAFT_WORD_COUNT = 10000;

export interface ArticleGenreProfile {
  value: ArticleGenre;
  label: string;
  summary: string;
  definition: string;
  structure: readonly string[];
  characteristics: readonly string[];
}

/**
 * Editorial definitions shared by the draft form and the AI prompt builder.
 * Keeping this as one catalog prevents the UI description from drifting away
 * from the writing instructions that the model receives.
 */
export const ARTICLE_GENRE_CATALOG: readonly ArticleGenreProfile[] = [
  {
    value: ArticleGenre.STRAIGHT_NEWS,
    label: '消息（标准新闻）',
    summary: '用倒金字塔结构快速交代最重要的新闻事实。',
    definition:
      '以最新、最重要的事实为核心，客观回答谁、何时、何地、发生了什么、为何发生及有何影响的基础新闻文体。',
    structure: [
      '标题：准确提炼最具新闻价值的事实，避免空泛判断和悬浮口号。',
      '导语：首段交代核心事实与关键结果，优先回答最重要的新闻要素。',
      '主体：按重要性递减展开事实、数据、现场细节与权威信源。',
      '背景：补充必要的历史脉络、政策语境和相关方立场，不喧宾夺主。',
      '结尾：用后续进展、待解问题或影响收束，不重复全文。',
    ],
    characteristics: [
      '事实密度高，信息排序服从新闻价值。',
      '语言准确、克制、具体，事实与观点明确分开。',
      '关键结论尽量有数据、文件或具名信源支撑。',
      '避免按时间流水账铺陈，也避免评论式拔高。',
    ],
  },
  {
    value: ArticleGenre.NEWS_BRIEF,
    label: '快讯',
    summary: '以最短路径发布刚发生的核心事实和即时影响。',
    definition:
      '面向突发或刚确认事件的高时效短稿，只保留已经确认且对读者最有用的核心信息。',
    structure: [
      '标题：直接写明事件与结果，不制造悬念。',
      '首段：一句至两句交代时间、地点、主体、事件和当前结果。',
      '补充段：加入一至三个关键细节、数据或权威回应。',
      '背景段：只提供理解事件不可缺少的最短背景。',
      '结尾：说明最新状态、下一时间节点或信息仍待确认之处。',
    ],
    characteristics: [
      '时效优先、短句为主、段落精简。',
      '只写已确认事实，不用推测填补信息空白。',
      '每一段都应提供新信息，删除泛化分析和修辞铺垫。',
      '明确区分已发生、正在发生与可能发生。',
    ],
  },
  {
    value: ArticleGenre.IN_DEPTH_REPORT,
    label: '深度报道',
    summary: '围绕核心问题建立证据链，解释原因、机制与影响。',
    definition:
      '以一个有公共价值的核心问题为轴，通过事实核查、数据、案例、背景和多方观点揭示事件成因、运行机制及深层影响的分析性报道。',
    structure: [
      '开篇：用关键场景、事实冲突或数据提出核心问题，并说明报道价值。',
      '事实基线：先交代已确认事实、时间线和争议边界，让读者掌握全貌。',
      '分层分析：按原因、机制、利益关系或关键矛盾组织章节，每节回答一个子问题。',
      '证据链：将数据、文件、案例和具名信源相互印证，说明证据能证明什么、不能证明什么。',
      '多方观点：呈现主要利益相关方及相反解释，对分歧作公平而有依据的比较。',
      '影响与收束：分析短期和长期影响，以仍待观察的问题或有根据的趋势判断结尾。',
    ],
    characteristics: [
      '问题意识明确，章节之间存在递进关系而非材料堆砌。',
      '解释重于复述，结论必须能追溯到证据链。',
      '兼顾宏观背景与具体人物、案例，避免只有抽象判断。',
      '承认不确定性与证据边界，不把相关性写成因果性。',
      '所有细节、引语和数据均不得虚构。',
    ],
  },
  {
    value: ArticleGenre.FEATURE_STORY,
    label: '特写 / 通讯',
    summary: '以真实场景和人物细节呈现事件的现场感与社会意义。',
    definition:
      '以真实人物、现场和细节为主要叙事载体，在保证新闻事实准确的前提下，让读者具体感受事件过程、人物处境和时代背景的叙事性新闻文体。',
    structure: [
      '开场场景：从最能承载主题的真实瞬间、动作或细节切入。',
      '人物与事件：尽快交代主人公、核心事件及其现实处境。',
      '叙事推进：按时间、空间或人物行动组织材料，在场景与必要背景之间切换。',
      '主题深化：通过细节、对照、数据和多名相关者，将个体故事连接到公共议题。',
      '结尾回响：回到人物、场景或象征性细节，让主题自然显现，避免口号式升华。',
    ],
    characteristics: [
      '画面感来自可核实的动作、环境和原话，而不是文学化虚构。',
      '以人物推动叙事，但不牺牲必要的事实背景和公共价值。',
      '叙事节奏有张有弛，场景、概述和解释交替出现。',
      '克制煽情，不替受访者虚构心理活动、表情或对话。',
    ],
  },
  {
    value: ArticleGenre.NEWS_COMMENTARY,
    label: '新闻评论',
    summary: '基于可核实事实提出鲜明论点并完成严密论证。',
    definition:
      '针对具有公共意义的新闻事实作出判断，以清晰立场、可靠证据和完整推理影响读者理解的观点性新闻文体。',
    structure: [
      '由头：简要交代触发评论的新闻事实，避免大段复述事件。',
      '中心论点：尽早提出明确、可争辩且能被全文证明的核心判断。',
      '分论点：每部分围绕一个理由展开，使用事实、数据、案例或规则支撑。',
      '回应异议：准确呈现有代表性的反方观点，指出其合理处、局限或成立条件。',
      '结论：回扣公共价值，提出可执行建议、原则判断或值得继续追问的问题。',
    ],
    characteristics: [
      '立场鲜明但不先有结论后挑证据，事实与评价清楚分层。',
      '论点、论据、推理链完整，避免只有态度和修辞。',
      '批评针对行为、制度或观点，不进行人身攻击和动机臆测。',
      '不用绝对化语言掩盖复杂性，主动说明判断的适用边界。',
    ],
  },
  {
    value: ArticleGenre.INTERVIEW,
    label: '访谈整理',
    summary: '忠实整理真实访谈材料，突出受访者的观点、经验与信息增量。',
    definition:
      '基于真实采访记录，对问答进行必要编辑和主题化组织，在不改变原意的前提下呈现受访者重要观点与独家信息的稿件。',
    structure: [
      '标题与导语：点明受访者身份、访谈主题和最具新闻价值的观点。',
      '人物说明：简要介绍受访者与议题的关系、访谈背景和必要语境。',
      '主题分组：按两至五个核心议题组织问答或引述，每组有清晰小标题。',
      '追问与解释：保留能澄清事实、依据和分歧的追问，并补充必要背景资料。',
      '结尾：以最具余味的真实回答、下一步行动或未决问题收束。',
    ],
    characteristics: [
      '受访者声音是主体，编辑文字只承担连接、核实和解释作用。',
      '允许压缩口头重复和调整顺序，但不得改变原意。',
      '直接引语只能来自所给材料；没有采访记录时改用间接概述并明确资料缺口。',
      '不得虚构问题、回答、语气、现场或受访者观点。',
    ],
  },
  {
    value: ArticleGenre.EXPLAINER,
    label: '解释性报道',
    summary: '围绕读者问题拆解概念、机制、因果和现实影响。',
    definition:
      '以帮助读者理解复杂新闻为目的，用清晰问题链解释关键概念、运作机制、前因后果、争议和切身影响的知识型新闻文体。',
    structure: [
      '问题导入：从新闻事件切入，明确本文要回答的核心问题及其重要性。',
      '事实与概念：用通俗语言定义关键术语，交代理解问题所需的事实基线。',
      '机制拆解：按步骤、因果链或层级解释事情如何运作及为何发生。',
      '影响分析：分别说明对不同群体、行业或地区的现实影响。',
      '争议与边界：呈现主流解释、重要分歧、未知信息和常见误解。',
      '读者结论：总结已知、未知以及接下来值得关注的信号。',
    ],
    characteristics: [
      '以读者问题组织全文，先解释再评价。',
      '术语首次出现即定义，必要时使用类比但注明类比边界。',
      '因果链逐步展开，不跳步、不循环论证。',
      '兼顾准确与易懂，不用专业名词制造权威感。',
    ],
  },
];

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
