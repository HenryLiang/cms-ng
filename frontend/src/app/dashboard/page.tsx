'use client';

import { useCallback, useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth-store';
import { getStories, updateStory, type Story } from '@/lib/story-api';
import {
  Plus,
  Clock,
  FileText,
  CheckCircle,
  Send,
  MoreHorizontal,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import LanguageBadge from '@/components/language-badge';
import { StatusBadge } from '@/components/ui';
import { buttonClasses, Card } from '@/components/ui';
import { SystemFeature } from '@cms-ng/shared';
import { useSystemFeaturesStore } from '@/store/system-features-store';
import { canUseFeature } from '@/lib/feature-access';

// 存词典 key 而非文案,渲染处经 t() 解析
const PIPELINE = [
  { key: 'DRAFT', labelKey: 'pipeline.draft', icon: Clock },
  { key: 'WRITING', labelKey: 'pipeline.writing', icon: FileText },
  { key: 'PENDING_REVIEW', labelKey: 'pipeline.pendingReview', icon: Send },
  { key: 'PUBLISHED', labelKey: 'pipeline.published', icon: CheckCircle },
] as const;

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const { user } = useAuthStore();
  const statuses = useSystemFeaturesStore((state) => state.statuses);
  const storiesEnabled = canUseFeature(
    SystemFeature.STORIES,
    user?.role,
    statuses,
  );
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(storiesEnabled);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    try {
      const data = await getStories();
      setStories(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (storiesEnabled) void loadStories();
  }, [loadStories, storiesEnabled]);

  async function moveStory(storyId: string, newStatus: string) {
    await updateStory(storyId, { status: newStatus as Story['status'] });
    setMenuOpenId(null);
    await loadStories();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!storiesEnabled) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('home.welcomeBack', { name: user?.name ?? '' })}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{t('home.storiesDisabledSubtitle')}</p>
        </div>
        <Card className="p-8 text-center">
          <p className="text-sm font-medium">{t('home.storiesDisabledTitle')}</p>
          <p className="mt-1 text-xs text-muted">
            {t('home.storiesDisabledDescription')}
          </p>
        </Card>
      </div>
    );
  }

  const stats: { labelKey: string; count: number; icon: LucideIcon }[] = [
    { labelKey: 'pipeline.draft', count: stories.filter((s) => s.status === 'DRAFT').length, icon: Clock },
    { labelKey: 'pipeline.writing', count: stories.filter((s) => s.status === 'WRITING').length, icon: FileText },
    {
      labelKey: 'pipeline.pendingReview',
      count: stories.filter((s) => s.status === 'PENDING_REVIEW' || s.status === 'IN_REVIEW').length,
      icon: Send,
    },
    {
      labelKey: 'pipeline.published',
      count: stories.filter((s) => s.status === 'PUBLISHED').length,
      icon: CheckCircle,
    },
  ];

  const recent = [...stories]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* 页头 */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('home.welcomeBack', { name: user?.name ?? '' })}</h1>
          <p className="mt-0.5 text-sm text-muted">{t('home.subtitle')}</p>
        </div>
        <Link href="/dashboard/stories/new" className={buttonClasses({ variant: 'primary' })}>
          <Plus className="h-4 w-4" />
          {t('home.newStory')}
        </Link>
      </div>

      {/* 统计卡 */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.labelKey} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
                  <Icon className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <div className="text-xs text-muted">{t(s.labelKey)}</div>
                  <div className="tnum mt-0.5 text-xl font-semibold">{s.count}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 最近选题表格 */}
      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t('home.recentStories')}</h3>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
              {stories.length}
            </span>
          </div>
          <Link
            href="/dashboard/stories"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            {t('home.viewAll')} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
              <FileText className="h-5 w-5 text-subtle" />
            </div>
            <p className="text-sm font-medium">{t('home.emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted">{t('home.emptyDescription')}</p>
            <Link
              href="/dashboard/stories/new"
              className={buttonClasses({ variant: 'primary', size: 'sm', className: 'mt-4' })}
            >
              <Plus className="h-4 w-4" />
              {t('home.newStory')}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                  <th className="px-5 py-2.5 font-medium">{t('home.table.story')}</th>
                  <th className="px-5 py-2.5 font-medium">{t('home.table.status')}</th>
                  <th className="px-5 py-2.5 font-medium">{t('home.table.language')}</th>
                  <th className="px-5 py-2.5 font-medium">{t('home.table.articles')}</th>
                  <th className="px-5 py-2.5 font-medium">{t('home.table.updatedAt')}</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((story) => {
                  const targets = PIPELINE.filter((p) => p.key !== story.status);
                  return (
                    <tr key={story.id} className="transition hover:bg-surface-muted/50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/stories/${story.id}`}
                          className="flex items-center gap-2"
                        >
                          {story.priority > 0 && (
                            <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                              P{story.priority}
                            </span>
                          )}
                          <span className="font-medium hover:text-brand">{story.title}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={story.status} />
                      </td>
                      <td className="px-5 py-3">
                        <LanguageBadge language={story.contentLanguage} />
                      </td>
                      <td className="px-5 py-3 text-muted tnum">
                        {story._count?.articles ?? 0}
                      </td>
                      <td className="px-5 py-3 tnum text-xs text-subtle">
                        {new Date(story.updatedAt).toLocaleDateString(locale)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() =>
                              setMenuOpenId(menuOpenId === story.id ? null : story.id)
                            }
                            className="rounded-md p-1 text-subtle transition hover:bg-surface-muted hover:text-foreground"
                            title={t('home.actions')}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuOpenId === story.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setMenuOpenId(null)}
                              />
                              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-line bg-surface py-1 shadow-pop">
                                <Link
                                  href={`/dashboard/stories/${story.id}`}
                                  className="block px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
                                >
                                  {t('home.viewDetails')}
                                </Link>
                                <div className="my-1 border-t border-line" />
                                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-subtle">
                                  {t('home.moveTo')}
                                </div>
                                {targets.map((target) => (
                                  <button
                                    key={target.key}
                                    onClick={() => moveStory(story.id, target.key)}
                                    className="block w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-surface-muted hover:text-foreground"
                                  >
                                    {t(target.labelKey)}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
