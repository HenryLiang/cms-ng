'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
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
import { getLanguageSettings } from '@/lib/language-settings-api';
import { useAuthStore } from '@/store/auth-store';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
} from '@cms-ng/shared';
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
  const t = useTranslations('autoPublish');
  const locale = useLocale();
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
    if (!confirm(t('list.deleteConfirm'))) return;
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
      alert(t('list.runTriggered'));
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
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            {/* Kill Switch */}
            {stats?.killSwitchActive ? (
              <Button variant="danger" onClick={() => handleKillSwitch(false)}>
                <PowerOff className="h-4 w-4" />
                {t('list.killSwitchOn')}
              </Button>
            ) : (
              <button
                onClick={() => {
                  if (confirm(t('list.killSwitchConfirm'))) {
                    handleKillSwitch(true);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Power className="h-4 w-4" />
                {t('list.killSwitch')}
              </button>
            )}
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('list.newTask')}
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard icon={BarChart3} label={t('list.statsActiveTasks')} value={stats.activeTasks} sub={t('list.statsTotalTasks', { count: stats.totalTasks })} />
          <StatCard icon={Zap} label={t('list.statsPublished')} value={stats.successArticles} sub={t('list.statsTotalArticles', { count: stats.totalArticles })} color="text-emerald-600" />
          <StatCard icon={CheckCircle} label={t('list.statsSuccessRate')} value={`${stats.successRate}%`} sub={t('list.statsTotalRuns', { count: stats.totalRuns })} color="text-blue-600" />
          <StatCard icon={XCircle} label={t('list.statsFailed')} value={stats.failedArticles} color="text-red-500" />
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
                    {task.scheduleConfig.times?.join(', ') || t('list.notSet')}
                  </span>
                  <span>{t('list.batchSize', { count: task.batchSize })}</span>
                  {task.lastRunAt && (
                    <span className="tnum">{t('list.lastRun', { time: new Date(task.lastRunAt).toLocaleString(locale) })}</span>
                  )}
                  {task.nextRunAt && task.status === 'ACTIVE' && (
                    <span className="text-blue-600 tnum">
                      {t('list.nextRun', { time: new Date(task.nextRunAt).toLocaleString(locale) })}
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
                  {t('list.run')}
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
                  {task.status === 'ACTIVE' ? t('list.pause') : t('list.enable')}
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
            <p className="text-muted">{t('list.empty')}</p>
            <p className="mt-1 text-sm text-subtle">{t('list.emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
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
  const t = useTranslations('autoPublish');
  const tCommon = useTranslations('common');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [times, setTimes] = useState('08:00,12:00,18:00');
  const [keywords, setKeywords] = useState('');
  const [useTrending, setUseTrending] = useState(true);
  const [style, setStyle] = useState('news_brief');
  const [maxLength, setMaxLength] = useState(800);
  const preferredLanguage = useAuthStore(
    (state) => state.user?.preferredLanguage,
  );
  const [selectedLanguage, setSelectedLanguage] =
    useState<ContentLanguage | null>(null);
  const [systemLanguage, setSystemLanguage] =
    useState<ContentLanguage | null>(null);
  const language = selectedLanguage ?? preferredLanguage ?? systemLanguage ?? '';
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

  useEffect(() => {
    if (preferredLanguage) return;
    let cancelled = false;
    getLanguageSettings()
      .then((settings) => {
        if (!cancelled) {
          setSystemLanguage(settings.contentLanguage);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSystemLanguage(DEFAULT_CONTENT_LANGUAGE);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preferredLanguage]);

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
          language: language || undefined,
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
      alert(t('form.createFailed', { message }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-line bg-surface shadow-card p-6 mb-6 space-y-4"
    >
      <h3 className="text-lg font-semibold">{t('form.title')}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.name')}</label>
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('form.namePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.description')}</label>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('form.descriptionPlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.times')}</label>
          <Input
            type="text"
            value={times}
            onChange={(e) => setTimes(e.target.value)}
            placeholder="08:00,12:00,18:00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.batchSize')}</label>
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
        <label className="block text-xs font-medium text-foreground mb-1">{t('form.keywords')}</label>
        <Input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={t('form.keywordsPlaceholder')}
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
          {t('form.useTrending')}
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.style')}</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="news_brief">{t('form.styleNewsBrief')}</option>
            <option value="standard">{t('form.styleStandard')}</option>
            <option value="analysis">{t('form.styleAnalysis')}</option>
            <option value="listicle">{t('form.styleListicle')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.maxLength')}</label>
          <Input
            type="number"
            min={100}
            max={5000}
            value={maxLength}
            onChange={(e) => setMaxLength(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.language')}</label>
          <select
            value={language}
            onChange={(e) =>
              setSelectedLanguage(e.target.value as ContentLanguage)
            }
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {!language && (
              <option value="" disabled>
                {tCommon('state.loading')}
              </option>
            )}
            <option value="TRADITIONAL_CHINESE_HK">{t('language.TRADITIONAL_CHINESE_HK')}</option>
            <option value="SIMPLIFIED_CHINESE">{t('language.SIMPLIFIED_CHINESE')}</option>
            <option value="TRADITIONAL_CHINESE_CANTONESE">{t('language.TRADITIONAL_CHINESE_CANTONESE')}</option>
            <option value="ENGLISH">{t('language.ENGLISH')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('form.authorStyle')}</label>
          <select
            value={authorSlug}
            onChange={(e) => setAuthorSlug(e.target.value)}
            disabled={!authorsAvailable}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
            title={
              authorsAvailable
                ? t('form.authorStyleHint')
                : t('form.authorStyleUnavailableHint')
            }
          >
            <option value="">{t('form.defaultStyle')}</option>
            {authors.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">{t('form.blockedKeywords')}</label>
        <Input
          type="text"
          value={blockedKeywords}
          onChange={(e) => setBlockedKeywords(e.target.value)}
          placeholder={t('form.blockedKeywordsPlaceholder')}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" variant="primary" loading={submitting}>
          <CheckCircle className="h-4 w-4" />
          {t('form.submit')}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          {tCommon('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
