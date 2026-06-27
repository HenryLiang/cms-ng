'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getRun,
  withdrawArticle,
  retryArticle,
  type AutoPublishRun,
  type AutoPublishArticle,
} from '@/lib/auto-publish-api';
import ExecutionTraceViewer from '@/components/execution-trace-viewer';
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Undo2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// Pipeline steps in actual execution order (matching backend)
const PIPELINE_STEPS = [
  'billing_check',
  'topic-collection',
  'research',
  'article-generation',
  'article-save',
  'image-generation',
  'publish',
  'notification',
];

const PIPELINE_STEP_LABELS: Record<string, string> = {
  billing_check: '计费',
  'topic-collection': '选题',
  research: '调研',
  'article-generation': '写作',
  'article-save': '保存',
  'image-generation': '配图',
  publish: '发布',
  notification: '通知',
};

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<AutoPublishRun | null>(null);
  const [articles, setArticles] = useState<AutoPublishArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  async function loadData() {
    try {
      const runData = await getRun(id);
      setRun(runData);
      setArticles(runData.articles || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleWithdraw(articleId: string) {
    if (!confirm('确定从 WordPress 撤回这篇文章？')) return;
    setActionId(articleId);
    try {
      await withdrawArticle(articleId);
      await loadData();
    } finally {
      setActionId(null);
    }
  }

  async function handleRetry(articleId: string) {
    setActionId(articleId);
    try {
      await retryArticle(articleId);
      alert('重试已触发');
      setTimeout(loadData, 2000);
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8 text-center text-zinc-500">运行记录不存在</div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href={`/dashboard/auto-publish/${run.taskId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        返回任务详情
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">
          运行详情 — {run.taskName}
        </h1>
        <div className="mt-2 flex items-center gap-4 text-sm text-zinc-500">
          <RunStatusBadge status={run.status} />
          <span>
            {run.triggerType === 'MANUAL' ? '手动触发' : '定时触发'}
          </span>
          <span>{new Date(run.startedAt).toLocaleString('zh-HK')}</span>
          {run.completedAt && (
            <span>
              耗时:{' '}
              {Math.round(
                (new Date(run.completedAt).getTime() -
                  new Date(run.startedAt).getTime()) /
                  1000,
              )}
              秒
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center">
          <div className="text-2xl font-semibold text-zinc-900">
            {run.totalArticles}
          </div>
          <div className="text-xs text-zinc-500">计划</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
          <div className="text-2xl font-semibold text-emerald-600">
            {run.successCount}
          </div>
          <div className="text-xs text-emerald-600">成功</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl font-semibold text-red-600">
            {run.failedCount}
          </div>
          <div className="text-xs text-red-600">失败</div>
        </div>
      </div>

      {/* Error Log */}
      {run.errorLog && run.errorLog.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
          <h3 className="text-sm font-medium text-red-700 mb-2">错误日志</h3>
          <ul className="space-y-1">
            {run.errorLog.map((err, i) => (
              <li key={i} className="text-sm text-red-600">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Articles */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">
          文章追踪 ({articles.length})
        </h2>
        <div className="space-y-3">
          {articles.map((article) => (
            <div
              key={article.id}
              className="rounded-lg border border-zinc-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ArticleStatusIcon status={article.status} />
                    <span className="text-sm font-medium text-zinc-900">
                      {article.topic || '未选题'}
                    </span>
                  </div>
                  {article.errorMessage && (
                    <p className="mt-1 text-xs text-red-500">
                      失败于 {article.failedStep}:{' '}
                      {article.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {article.status === 'PUBLISHED' && (
                    <button
                      onClick={() => handleWithdraw(article.id)}
                      disabled={actionId === article.id}
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {actionId === article.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      撤回
                    </button>
                  )}
                  {article.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetry(article.id)}
                      disabled={actionId === article.id}
                      className="flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {actionId === article.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      重试
                    </button>
                  )}
                </div>
              </div>

              {/* Pipeline Progress (8 steps matching backend order) */}
              <div className="flex items-center gap-0.5">
                {PIPELINE_STEPS.map((step, i) => {
                  // Map article status to pipeline step index
                  const statusStepMap: Record<string, number> = {
                    TOPIC_SELECTED: 1,
                    RESEARCHED: 2,
                    DRAFTED: 3,
                    SAVED: 4,
                    IMAGED: 5,
                    PUBLISHED: 7,
                  };
                  const currentStepIdx = article.status === 'PUBLISHED' || article.status === 'WITHDRAWN'
                    ? 7
                    : statusStepMap[article.status] ?? -1;

                  const isCompleted = currentStepIdx >= i || article.status === 'WITHDRAWN';
                  const isCurrent = currentStepIdx === i && article.status !== 'PUBLISHED' && article.status !== 'WITHDRAWN' && article.status !== 'FAILED';
                  const isFailed = article.status === 'FAILED' && article.failedStep === step;

                  // Get duration from trace if available
                  const traceEntry = article.executionTrace?.find((t) => t.step === step);
                  const duration = traceEntry ? `${(traceEntry.durationMs / 1000).toFixed(1)}s` : undefined;

                  return (
                    <div key={step} className="flex flex-col items-center flex-1" title={`${PIPELINE_STEP_LABELS[step]}${duration ? ` (${duration})` : ''}`}>
                      <div
                        className={`h-1.5 w-full rounded-full transition-colors ${
                          isFailed
                            ? 'bg-red-400'
                            : isCompleted
                              ? 'bg-emerald-400'
                              : isCurrent
                                ? 'bg-blue-400 animate-pulse'
                                : 'bg-zinc-200'
                        }`}
                      />
                      <span
                        className={`text-[9px] mt-0.5 whitespace-nowrap ${
                          isFailed
                            ? 'text-red-600 font-medium'
                            : isCompleted
                              ? 'text-emerald-600'
                              : isCurrent
                                ? 'text-blue-600'
                                : 'text-zinc-400'
                        }`}
                      >
                        {PIPELINE_STEP_LABELS[step]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Trace viewer toggle */}
              {article.executionTrace && article.executionTrace.length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-100">
                  <button
                    onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {expandedArticle === article.id ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {expandedArticle === article.id ? '收起执行详情' : '查看执行详情'}
                    {article.totalDurationMs != null && (
                      <span className="ml-1 text-zinc-400">
                        ({(article.totalDurationMs / 1000).toFixed(1)}s)
                      </span>
                    )}
                  </button>

                  {expandedArticle === article.id && (
                    <div className="mt-3">
                      <ExecutionTraceViewer
                        trace={article.executionTrace}
                        totalDurationMs={article.totalDurationMs || 0}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {articles.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 text-sm">
              暂无文章记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArticleStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'PUBLISHED':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case 'FAILED':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'WITHDRAWN':
      return <Undo2 className="h-4 w-4 text-zinc-400" />;
    default:
      return <Clock className="h-4 w-4 text-blue-400" />;
  }
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    COMPLETED: { label: '完成', className: 'bg-emerald-50 text-emerald-600' },
    PARTIAL: { label: '部分成功', className: 'bg-amber-50 text-amber-600' },
    FAILED: { label: '失败', className: 'bg-red-50 text-red-600' },
    RUNNING: { label: '运行中', className: 'bg-blue-50 text-blue-600' },
  };
  const config = map[status] || { label: status, className: 'bg-zinc-100 text-zinc-500' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
