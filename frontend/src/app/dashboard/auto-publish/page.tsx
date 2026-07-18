'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getTasks,
  getStats,
  toggleTask,
  deleteTask,
  manualRun,
  setKillSwitch,
  createTask,
  type AutoPublishTask,
  type AutoPublishStats,
  type CreateTaskInput,
} from '@/lib/auto-publish-api';
import { getAuthors } from '@/lib/authors-api';
import { Button, Card, PageHeader, Badge, Input } from '@/components/ui';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Zap,
  Power,
  PowerOff,
  CheckCircle,
  XCircle,
  BarChart3,
  Clock,
  type LucideIcon,
} from 'lucide-react';

export default function AutoPublishPage() {
  const [tasks, setTasks] = useState<AutoPublishTask[]>([]);
  const [stats, setStats] = useState<AutoPublishStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [tasksData, statsData] = await Promise.all([getTasks(), getStats()]);
      setTasks(tasksData);
      setStats(statsData);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string) {
    setActionId(id);
    try {
      await toggleTask(id);
      await loadData();
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这个任务？删除后不可恢复。')) return;
    setActionId(id);
    try {
      await deleteTask(id);
      await loadData();
    } finally {
      setActionId(null);
    }
  }

  async function handleRun(id: string) {
    setActionId(id);
    try {
      await manualRun(id);
      alert('手动运行已触发，请在运行记录中查看进度');
    } finally {
      setActionId(null);
    }
  }

  async function handleKillSwitch(enable: boolean) {
    await setKillSwitch(enable);
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <PageHeader
        title="自动发布"
        subtitle="管理自动发布任务，定时从选题到发布全自动运行"
        actions={
          <>
            {/* Kill Switch */}
            {stats?.killSwitchActive ? (
              <Button variant="danger" onClick={() => handleKillSwitch(false)}>
                <PowerOff className="h-4 w-4" />
                紧急停止已开启 - 点击恢复
              </Button>
            ) : (
              <button
                onClick={() => {
                  if (confirm('确认开启紧急停止？所有自动发布任务将暂停。')) {
                    handleKillSwitch(true);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Power className="h-4 w-4" />
                紧急停止
              </button>
            )}
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              新建任务
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard icon={BarChart3} label="活跃任务" value={stats.activeTasks} sub={`共 ${stats.totalTasks} 个`} />
          <StatCard icon={Zap} label="已发布" value={stats.successArticles} sub={`共 ${stats.totalArticles} 篇`} color="text-emerald-600" />
          <StatCard icon={CheckCircle} label="成功率" value={`${stats.successRate}%`} sub={`${stats.totalRuns} 次运行`} color="text-blue-600" />
          <StatCard icon={XCircle} label="失败" value={stats.failedArticles} color="text-red-500" />
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <CreateTaskForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadData();
          }}
        />
      )}

      {/* Task List */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <Card key={task.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/auto-publish/${task.id}`}
                  className="text-base font-medium text-foreground hover:text-brand"
                >
                  {task.name}
                </Link>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <TaskStatusBadge status={task.status} />
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {task.scheduleConfig.times?.join(', ') || '未设置'}
                  </span>
                  <span>每次 {task.batchSize} 篇</span>
                  {task.lastRunAt && (
                    <span className="tnum">上次: {new Date(task.lastRunAt).toLocaleString('zh-HK')}</span>
                  )}
                  {task.nextRunAt && task.status === 'ACTIVE' && (
                    <span className="text-blue-600 tnum">
                      下次: {new Date(task.nextRunAt).toLocaleString('zh-HK')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRun(task.id)}
                  disabled={actionId === task.id}
                >
                  <Zap className="h-3 w-3" />
                  运行
                </Button>
                <button
                  onClick={() => handleToggle(task.id)}
                  disabled={actionId === task.id}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    task.status === 'ACTIVE'
                      ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                      : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {actionId === task.id ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                  ) : task.status === 'ACTIVE' ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  {task.status === 'ACTIVE' ? '暂停' : '启用'}
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  disabled={actionId === task.id}
                  className="text-subtle hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}

        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <Zap className="h-8 w-8 text-subtle mx-auto mb-3" />
            <p className="text-muted">暂无自动发布任务</p>
            <p className="mt-1 text-sm text-subtle">点击右上角「新建任务」开始</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
    ACTIVE: { label: '运行中', tone: 'success' },
    PAUSED: { label: '已暂停', tone: 'warning' },
    DISABLED: { label: '已禁用', tone: 'neutral' },
  };
  const config = map[status] || map.PAUSED;
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-foreground',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className={`text-2xl font-semibold tnum ${color}`}>{value}</div>
      {sub && <div className="text-xs text-subtle mt-1">{sub}</div>}
    </Card>
  );
}

function CreateTaskForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [times, setTimes] = useState('08:00,12:00,18:00');
  const [keywords, setKeywords] = useState('');
  const [useTrending, setUseTrending] = useState(true);
  const [style, setStyle] = useState('news_brief');
  const [maxLength, setMaxLength] = useState(800);
  const [language, setLanguage] = useState('TRADITIONAL_CHINESE_HK');
  // Author-style persona for auto-published drafts. '' = default generation.
  const [authorSlug, setAuthorSlug] = useState('');
  const [authors, setAuthors] = useState<{ slug: string; name: string }[]>([]);
  const [authorsAvailable, setAuthorsAvailable] = useState(true);
  const [batchSize, setBatchSize] = useState(1);
  const [blockedKeywords, setBlockedKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch author personas once for the author-style dropdown.
  useEffect(() => {
    getAuthors()
      .then((info) => {
        setAuthors(info.authors);
        setAuthorsAvailable(info.source === 'disk' && info.authors.length > 0);
      })
      .catch(() => setAuthorsAvailable(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input: CreateTaskInput = {
        name,
        description: description || undefined,
        scheduleConfig: {
          times: times.split(',').map((t) => t.trim()).filter(Boolean),
          timezone: 'Asia/Hong_Kong',
        },
        topicStrategy: {
          fixedKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          useTrending,
          trendingSources: ['google_trends', 'rss'],
        },
        contentConfig: {
          style,
          maxLength,
          language,
          authorSlug: authorSlug || undefined,
        },
        filterConfig: {
          blockedKeywords: blockedKeywords.split(',').map((k) => k.trim()).filter(Boolean),
          blockedCategories: [],
          allowedChannels: [],
        },
        publishConfig: {
          platform: 'WORDPRESS',
          postStatus: 'publish',
        },
        batchSize,
      };
      await createTask(input);
      onCreated();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`创建失败: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-line bg-surface shadow-card p-6 mb-6 space-y-4"
    >
      <h3 className="text-lg font-semibold">新建自动发布任务</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">任务名称 *</label>
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：科技早报"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">描述</label>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">发布时间（逗号分隔）</label>
          <Input
            type="text"
            value={times}
            onChange={(e) => setTimes(e.target.value)}
            placeholder="08:00,12:00,18:00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">每次生成篇数</label>
          <Input
            type="number"
            min={1}
            max={20}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">固定关键词（逗号分隔）</label>
        <Input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="科技,AI,区块链"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={useTrending}
          onChange={(e) => setUseTrending(e.target.checked)}
          id="useTrending"
        />
        <label htmlFor="useTrending" className="text-sm text-foreground">
          同时从热点话题中选取选题
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">文章风格</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="news_brief">快讯（~500字）</option>
            <option value="standard">标准报道（~1500字）</option>
            <option value="analysis">深度分析（~3000字）</option>
            <option value="listicle">列表体</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">最大字数</label>
          <Input
            type="number"
            min={100}
            max={5000}
            value={maxLength}
            onChange={(e) => setMaxLength(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">语言</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="TRADITIONAL_CHINESE_HK">繁体中文（港式）</option>
            <option value="SIMPLIFIED_CHINESE">简体中文</option>
            <option value="TRADITIONAL_CHINESE_CANTONESE">粤语书面语</option>
            <option value="ENGLISH">English</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">作者风格</label>
          <select
            value={authorSlug}
            onChange={(e) => setAuthorSlug(e.target.value)}
            disabled={!authorsAvailable}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
            title={
              authorsAvailable
                ? '选中的作者文风将应用到自动生成的初稿'
                : '未检测到作者风格数据，将使用默认生成方式'
            }
          >
            <option value="">默认风格</option>
            {authors.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">屏蔽关键词（逗号分隔）</label>
        <Input
          type="text"
          value={blockedKeywords}
          onChange={(e) => setBlockedKeywords(e.target.value)}
          placeholder="政治,宗教,暴力"
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" variant="primary" loading={submitting}>
          <CheckCircle className="h-4 w-4" />
          创建任务
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          取消
        </Button>
      </div>
    </form>
  );
}
