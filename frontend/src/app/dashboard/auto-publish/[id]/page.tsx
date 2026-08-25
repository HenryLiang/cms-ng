'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  getTask,
  updateTask,
  manualRun,
  getRuns,
  type AutoPublishTask,
  type AutoPublishRun,
} from '@/lib/auto-publish-api';
import { AutoTaskStatus } from '@cms-ng/shared';
import { Button, Card, Badge } from '@/components/ui';
import {
  ArrowLeft,
  Play,
  Pause,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const t = useTranslations('autoPublish');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [task, setTask] = useState<AutoPublishTask | null>(null);
  const [runs, setRuns] = useState<AutoPublishRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [id]);

  async function loadData() {
    try {
      const [taskData, runsData] = await Promise.all([
        getTask(id),
        getRuns({ taskId: id, pageSize: 20 }),
      ]);
      setTask(taskData);
      setRuns(runsData.data);
    } finally {
      setLoading(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    try {
      await manualRun(id);
      alert(t('detail.runTriggered'));
      setTimeout(loadData, 2000);
    } finally {
      setRunning(false);
    }
  }

  async function handleToggle() {
    const newStatus =
      task!.status === AutoTaskStatus.ACTIVE
        ? AutoTaskStatus.PAUSED
        : AutoTaskStatus.ACTIVE;
    await updateTask(id, { status: newStatus });
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8 text-center text-muted">{t('detail.notFound')}</div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href="/dashboard/auto-publish"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('detail.back')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{task.name}</h1>
          {task.description && (
            <p className="mt-1 text-sm text-muted">{task.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-sm">
            <TaskStatusBadge status={task.status} />
            <span className="text-subtle">|</span>
            <span className="text-muted">
              {t('detail.creator', { name: task.createdByUser?.name || t('detail.unknownUser') })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            loading={running}
            onClick={handleRun}
          >
            <Zap className="h-4 w-4" />
            {t('detail.manualRun')}
          </Button>
          <button
            onClick={handleToggle}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              task.status === AutoTaskStatus.ACTIVE
                ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {task.status === AutoTaskStatus.ACTIVE ? (
              <>
                <Pause className="h-4 w-4" /> {t('detail.pause')}
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> {t('detail.enable')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Config Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <ConfigCard title={t('detail.scheduleConfig')}>
          <div className="space-y-1 text-sm text-muted">
            <div>{t('detail.times', { times: task.scheduleConfig.times?.join(', ') || t('detail.notSet') })}</div>
            <div>{t('detail.timezone', { timezone: task.scheduleConfig.timezone || 'Asia/Hong_Kong' })}</div>
            <div>{t('detail.batchSize', { count: task.batchSize })}</div>
            {task.nextRunAt && task.status === AutoTaskStatus.ACTIVE && (
              <div className="text-blue-600 tnum">
                {t('detail.nextRun', { time: new Date(task.nextRunAt).toLocaleString(locale) })}
              </div>
            )}
          </div>
        </ConfigCard>

        <ConfigCard title={t('detail.topicStrategy')}>
          <div className="space-y-1 text-sm text-muted">
            {task.topicStrategy.fixedKeywords?.length > 0 && (
              <div>
                {t('detail.keywords')}{' '}
                {task.topicStrategy.fixedKeywords.map((k) => (
                  <span
                    key={k}
                    className="inline-block rounded bg-surface-muted px-1.5 py-0.5 text-xs mr-1"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
            <div>{t('detail.useTrending', { value: task.topicStrategy.useTrending ? tCommon('state.yes') : tCommon('state.no') })}</div>
          </div>
        </ConfigCard>

        <ConfigCard title={t('detail.contentConfig')}>
          <div className="space-y-1 text-sm text-muted">
            <div>
              {t('detail.style')}{' '}
              {
                { news_brief: t('style.news_brief'), standard: t('style.standard'), analysis: t('style.analysis'), listicle: t('style.listicle') }[
                  task.contentConfig.style
                ] || task.contentConfig.style
              }
            </div>
            <div>{t('detail.maxLength', { count: task.contentConfig.maxLength })}</div>
            <div>
              {t('detail.language')}{' '}
              {
                {
                  TRADITIONAL_CHINESE_HK: t('language.TRADITIONAL_CHINESE_HK'),
                  SIMPLIFIED_CHINESE: t('language.SIMPLIFIED_CHINESE'),
                  TRADITIONAL_CHINESE_CANTONESE: t('language.TRADITIONAL_CHINESE_CANTONESE'),
                  ENGLISH: t('language.ENGLISH'),
                }[task.contentConfig.language] || task.contentConfig.language
              }
            </div>
          </div>
        </ConfigCard>

        <ConfigCard title={t('detail.publishConfig')}>
          <div className="space-y-1 text-sm text-muted">
            <div>{t('detail.platform', { platform: task.publishConfig.platform })}</div>
            <div>
              {t('detail.postStatus', { status: task.publishConfig.postStatus || 'publish' })}
            </div>
            {task.publishConfig.category && (
              <div>{t('detail.category', { category: task.publishConfig.category })}</div>
            )}
          </div>
        </ConfigCard>
      </div>

      {/* Run History */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">{t('detail.runHistory')}</h2>
        <div className="space-y-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/dashboard/auto-publish/runs/${run.id}`}
              className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <RunStatusIcon status={run.status} />
                <div>
                  <div className="text-sm font-medium text-foreground tnum">
                    {new Date(run.startedAt).toLocaleString(locale)}
                  </div>
                  <div className="text-xs text-muted tnum">
                    {run.triggerType === 'MANUAL' ? t('trigger.MANUAL') : t('trigger.SCHEDULED')}
                    {' · '}
                    {t('detail.runSummary', { success: run.successCount, failed: run.failedCount, total: run.totalArticles })}
                  </div>
                </div>
              </div>
              <RunStatusBadge status={run.status} />
            </Link>
          ))}
          {runs.length === 0 && (
            <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-muted text-sm">
              {t('detail.noRuns')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
      {children}
    </Card>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const t = useTranslations('autoPublish');
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
    ACTIVE: { label: t('status.ACTIVE'), tone: 'success' },
    PAUSED: { label: t('status.PAUSED'), tone: 'warning' },
    DISABLED: { label: t('status.DISABLED'), tone: 'neutral' },
  };
  const config = map[status] || map.PAUSED;
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    case 'PARTIAL':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'FAILED':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'RUNNING':
      return <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />;
    default:
      return <Clock className="h-5 w-5 text-subtle" />;
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
