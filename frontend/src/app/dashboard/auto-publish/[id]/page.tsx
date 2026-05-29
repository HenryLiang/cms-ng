'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getTask,
  updateTask,
  manualRun,
  getRuns,
  type AutoPublishTask,
  type AutoPublishRun,
} from '@/lib/auto-publish-api';
import { AutoTaskStatus } from '@cms-ng/shared';
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [task, setTask] = useState<AutoPublishTask | null>(null);
  const [runs, setRuns] = useState<AutoPublishRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    loadData();
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
      alert('手动运行已触发');
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
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8 text-center text-zinc-500">任务不存在</div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href="/dashboard/auto-publish"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        返回任务列表
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{task.name}</h1>
          {task.description && (
            <p className="mt-1 text-sm text-zinc-500">{task.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-sm">
            <StatusBadge status={task.status} />
            <span className="text-zinc-400">|</span>
            <span className="text-zinc-500">
              创建者: {task.createdByUser?.name || '未知'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            手动运行
          </button>
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
                <Pause className="h-4 w-4" /> 暂停
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> 启用
              </>
            )}
          </button>
        </div>
      </div>

      {/* Config Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <ConfigCard title="调度配置">
          <div className="space-y-1 text-sm text-zinc-600">
            <div>时间: {task.scheduleConfig.times?.join(', ') || '未设置'}</div>
            <div>时区: {task.scheduleConfig.timezone || 'Asia/Hong_Kong'}</div>
            <div>每次生成: {task.batchSize} 篇</div>
            {task.nextRunAt && task.status === AutoTaskStatus.ACTIVE && (
              <div className="text-blue-600">
                下次运行: {new Date(task.nextRunAt).toLocaleString('zh-HK')}
              </div>
            )}
          </div>
        </ConfigCard>

        <ConfigCard title="选题策略">
          <div className="space-y-1 text-sm text-zinc-600">
            {task.topicStrategy.fixedKeywords?.length > 0 && (
              <div>
                关键词:{' '}
                {task.topicStrategy.fixedKeywords.map((k) => (
                  <span
                    key={k}
                    className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs mr-1"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
            <div>热点选题: {task.topicStrategy.useTrending ? '是' : '否'}</div>
          </div>
        </ConfigCard>

        <ConfigCard title="内容配置">
          <div className="space-y-1 text-sm text-zinc-600">
            <div>
              风格:{' '}
              {
                { news_brief: '快讯', standard: '标准报道', analysis: '深度分析', listicle: '列表体' }[
                  task.contentConfig.style
                ] || task.contentConfig.style
              }
            </div>
            <div>字数上限: {task.contentConfig.maxLength}</div>
            <div>
              语言:{' '}
              {
                {
                  TRADITIONAL_CHINESE_HK: '繁体中文（港式）',
                  SIMPLIFIED_CHINESE: '简体中文',
                  TRADITIONAL_CHINESE_CANTONESE: '粤语书面语',
                  ENGLISH: 'English',
                }[task.contentConfig.language] || task.contentConfig.language
              }
            </div>
          </div>
        </ConfigCard>

        <ConfigCard title="发布配置">
          <div className="space-y-1 text-sm text-zinc-600">
            <div>平台: {task.publishConfig.platform}</div>
            <div>
              发布状态: {task.publishConfig.postStatus || 'publish'}
            </div>
            {task.publishConfig.category && (
              <div>分类: {task.publishConfig.category}</div>
            )}
          </div>
        </ConfigCard>
      </div>

      {/* Run History */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">运行历史</h2>
        <div className="space-y-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/dashboard/auto-publish/runs/${run.id}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3">
                <RunStatusIcon status={run.status} />
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    {new Date(run.startedAt).toLocaleString('zh-HK')}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {run.triggerType === 'MANUAL' ? '手动触发' : '定时触发'}
                    {' · '}
                    成功 {run.successCount} / 失败 {run.failedCount} / 计划 {run.totalArticles}
                  </div>
                </div>
              </div>
              <RunStatusBadge status={run.status} />
            </Link>
          ))}
          {runs.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 text-sm">
              暂无运行记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-medium text-zinc-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: '运行中', className: 'bg-emerald-50 text-emerald-600' },
    PAUSED: { label: '已暂停', className: 'bg-amber-50 text-amber-600' },
    DISABLED: { label: '已禁用', className: 'bg-zinc-100 text-zinc-500' },
  };
  const config = map[status] || map.PAUSED;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
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
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    default:
      return <Clock className="h-5 w-5 text-zinc-400" />;
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
