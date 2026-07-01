import {
  AutoTaskStatus,
  ScheduleType,
  RunStatus,
  ArticleRunStatus,
  TriggerType,
} from '@cms-ng/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function getToken() {
  return localStorage.getItem('accessToken') || '';
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

// ── Types ──

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

export interface AutoPublishTask {
  id: string;
  name: string;
  description?: string;
  status: AutoTaskStatus;
  scheduleType: ScheduleType;
  scheduleConfig: { times: string[]; timezone: string };
  topicStrategy: {
    fixedKeywords: string[];
    useTrending: boolean;
    trendingSources: string[];
  };
  contentConfig: {
    style: string;
    maxLength: number;
    language: string;
    systemPrompt?: string;
    authorSlug?: string;
  };
  filterConfig: {
    blockedCategories: string[];
    blockedKeywords: string[];
    allowedChannels: string[];
  };
  publishConfig: {
    platform: string;
    wordpressSiteId?: string;
    category?: string;
    postStatus?: string;
  };
  batchSize: number;
  retryConfig: { maxRetries: number; retryDelayMs: number };
  lastRunAt?: string;
  nextRunAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  createdByUser?: { id: string; name: string };
  runCount?: number;
  recentRuns?: AutoPublishRun[];
}

export interface AutoPublishRun {
  id: string;
  taskId: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  totalArticles: number;
  successCount: number;
  failedCount: number;
  errorLog: string[];
  triggerType: TriggerType;
  taskName?: string;
  articleCount?: number;
  articles?: AutoPublishArticle[];
}

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
  createdAt: string;
  updatedAt: string;
}

export interface AutoPublishStats {
  totalTasks: number;
  activeTasks: number;
  totalRuns: number;
  totalArticles: number;
  successArticles: number;
  failedArticles: number;
  successRate: number;
  killSwitchActive: boolean;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  scheduleType?: ScheduleType;
  scheduleConfig: { times: string[]; timezone: string };
  topicStrategy: {
    fixedKeywords: string[];
    useTrending: boolean;
    trendingSources?: string[];
  };
  contentConfig: {
    style: string;
    maxLength: number;
    language: string;
    systemPrompt?: string;
    authorSlug?: string;
  };
  filterConfig?: {
    blockedCategories?: string[];
    blockedKeywords?: string[];
    allowedChannels?: string[];
  };
  publishConfig: {
    platform: string;
    wordpressSiteId?: string;
    category?: string;
    postStatus?: string;
  };
  batchSize?: number;
  retryConfig?: { maxRetries: number; retryDelayMs: number };
}

// ── API Functions ──

export async function getTasks(): Promise<AutoPublishTask[]> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export async function getTask(id: string): Promise<AutoPublishTask> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks/${id}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to fetch task');
  return res.json();
}

export async function createTask(input: CreateTaskInput): Promise<AutoPublishTask> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || 'Failed to create task');
  }
  return res.json();
}

export async function updateTask(
  id: string,
  input: Partial<CreateTaskInput> & { status?: AutoTaskStatus },
): Promise<AutoPublishTask> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(err.message || 'Failed to update task');
  }
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to delete task');
}

export async function toggleTask(id: string): Promise<AutoPublishTask> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks/${id}/toggle`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to toggle task');
  return res.json();
}

export async function manualRun(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/auto-publish/tasks/${id}/run`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to trigger manual run');
  return res.json();
}

export async function getRuns(params?: {
  taskId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: AutoPublishRun[]; meta: { page: number; pageSize: number; total: number } }> {
  const searchParams = new URLSearchParams();
  if (params?.taskId) searchParams.set('taskId', params.taskId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

  const res = await fetch(
    `${API_BASE}/auto-publish/runs?${searchParams.toString()}`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error('Failed to fetch runs');
  return res.json();
}

export async function getRun(id: string): Promise<AutoPublishRun> {
  const res = await fetch(`${API_BASE}/auto-publish/runs/${id}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to fetch run');
  return res.json();
}

export async function getRunArticles(runId: string): Promise<AutoPublishArticle[]> {
  const res = await fetch(
    `${API_BASE}/auto-publish/runs/${runId}/articles`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error('Failed to fetch run articles');
  return res.json();
}

export async function getArticleTrace(articleId: string): Promise<{
  id: string;
  topic?: string;
  status: string;
  failedStep?: string;
  errorMessage?: string;
  retryCount: number;
  totalDurationMs?: number;
  executionTrace: StepTraceEntry[];
}> {
  const res = await fetch(
    `${API_BASE}/auto-publish/articles/${articleId}/trace`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error('Failed to fetch article trace');
  return res.json();
}

export async function withdrawArticle(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/auto-publish/articles/${id}/withdraw`,
    { method: 'POST', headers: headers() },
  );
  if (!res.ok) throw new Error('Failed to withdraw article');
}

export async function retryArticle(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/auto-publish/articles/${id}/retry`,
    { method: 'POST', headers: headers() },
  );
  if (!res.ok) throw new Error('Failed to retry article');
}

export async function setKillSwitch(enable: boolean): Promise<{ killSwitchActive: boolean }> {
  const res = await fetch(`${API_BASE}/auto-publish/kill-switch`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ enable }),
  });
  if (!res.ok) throw new Error('Failed to set kill switch');
  return res.json();
}

export async function getStats(): Promise<AutoPublishStats> {
  const res = await fetch(`${API_BASE}/auto-publish/stats`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}
