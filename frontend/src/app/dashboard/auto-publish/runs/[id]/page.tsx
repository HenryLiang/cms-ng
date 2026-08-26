'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  getRun,
  withdrawArticle,
  retryArticle,
  type AutoPublishRun,
  type AutoPublishArticle,
} from '@/lib/auto-publish-api';
import ExecutionTraceViewer from '@/components/execution-trace-viewer';
import { Card, Badge } from '@/components/ui';
import {
  ArrowLeft,
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

// Pipeline step -> dictionary key (autoPublish.run.steps.*)
const PIPELINE_STEP_LABEL_KEYS: Record<string, string> = {
  billing_check: 'run.steps.billingCheck',
  'topic-collection': 'run.steps.topicCollection',
  research: 'run.steps.research',
  'article-generation': 'run.steps.articleGeneration',
  'article-save': 'run.steps.articleSave',
  'image-generation': 'run.steps.imageGeneration',
  publish: 'run.steps.publish',
  notification: 'run.steps.notification',
};

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations('autoPublish');
  const tCommon = useTranslations('common');
  const locale = useLocale();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [id]);

  async function handleWithdraw(articleId: string) {
    if (!confirm(t('run.withdrawConfirm'))) return;
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
      alert(t('run.retryTriggered'));
      setTimeout(loadData, 2000);
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8 text-center text-muted">{t('run.notFound')}</div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href={`/dashboard/auto-publish/${run.taskId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('run.back')}
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('run.title', { name: run.taskName ?? '' })}
        </h1>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted">
          <RunStatusBadge status={run.status} />
          <span>
            {run.triggerType === 'MANUAL' ? t('trigger.MANUAL') : t('trigger.SCHEDULED')}
          </span>
          <span className="tnum">{new Date(run.startedAt).toLocaleString(locale)}</span>
          {run.completedAt && (
            <span className="tnum">
              {t('run.duration', {
                seconds: Math.round(
                  (new Date(run.completedAt).getTime() -
                    new Date(run.startedAt).getTime()) /
                    1000,
                ),
              })}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4 text-center">
          <div className="text-2xl font-semibold text-foreground tnum">
            {run.totalArticles}
          </div>
          <div className="text-xs text-muted">{t('run.planned')}</div>
        </Card>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <div className="text-2xl font-semibold text-emerald-600 tnum">
            {run.successCount}
          </div>
          <div className="text-xs text-emerald-600">{t('run.success')}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl font-semibold text-red-600 tnum">
            {run.failedCount}
          </div>
          <div className="text-xs text-red-600">{t('run.failed')}</div>
        </div>
      </div>

      {/* Error Log */}
      {run.errorLog && run.errorLog.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
          <h3 className="text-sm font-medium text-red-700 mb-2">{t('run.errorLog')}</h3>
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
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {t('run.articleTracking')} (<span className="tnum">{articles.length}</span>)
        </h2>
        <div className="space-y-3">
          {articles.map((article) => (
            <Card key={article.id} className="p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ArticleStatusIcon status={article.status} />
                    <span className="text-sm font-medium text-foreground">
                      {article.topic || t('run.noTopic')}
                    </span>
                  </div>
                  {article.errorMessage && (
                    <p className="mt-1 text-xs text-red-500">
                      {t('run.failedAt', { step: article.failedStep ?? '', message: article.errorMessage ?? '' })}
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
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      {t('run.withdraw')}
                    </button>
                  )}
                  {article.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetry(article.id)}
                      disabled={actionId === article.id}
                      className="flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {actionId === article.id ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {tCommon('actions.retry')}
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
                  const stepLabel = t(PIPELINE_STEP_LABEL_KEYS[step]);

                  return (
                    <div key={step} className="flex flex-col items-center flex-1" title={`${stepLabel}${duration ? ` (${duration})` : ''}`}>
                      <div
                        className={`h-1.5 w-full rounded-full transition-colors ${
                          isFailed
                            ? 'bg-red-400'
                            : isCompleted
                              ? 'bg-emerald-400'
                              : isCurrent
                                ? 'bg-blue-400 animate-pulse'
                                : 'bg-surface-muted'
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
                                : 'text-subtle'
                        }`}
                      >
                        {stepLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Trace viewer toggle */}
              {article.executionTrace && article.executionTrace.length > 0 && (
                <div className="mt-2 pt-2 border-t border-line">
                  <button
                    onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {expandedArticle === article.id ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {expandedArticle === article.id ? t('run.collapseTrace') : t('run.expandTrace')}
                    {article.totalDurationMs != null && (
                      <span className="ml-1 text-subtle tnum">
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
            </Card>
          ))}

          {articles.length === 0 && (
            <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-muted text-sm">
              {t('run.noArticles')}
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
      return <Undo2 className="h-4 w-4 text-subtle" />;
    default:
      return <Clock className="h-4 w-4 text-blue-400" />;
  }
}

function RunStatusBadge({ status }: { status: string }) {
  const t = useTranslations('autoPublish');
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
    COMPLETED: { label: t('status.COMPLETED'), tone: 'success' },
    PARTIAL: { label: t('status.PARTIAL'), tone: 'warning' },
    FAILED: { label: t('status.FAILED'), tone: 'danger' },
    RUNNING: { label: t('status.RUNNING'), tone: 'info' },
  };
  const config = map[status] || { label: status, tone: 'neutral' as const };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
