'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  getStory,
  updateStory,
  deleteStory,
  generateResearchKit,
  generateDraftFromResearchKit,
  type Story,
  type ResearchKitResult,
} from '@/lib/story-api';
import { getArticles, createArticle, type Article } from '@/lib/article-api';
import { getAuthors, type AuthorSummary } from '@/lib/authors-api';
import { useAuthStore } from '@/store/auth-store';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Save,
  BookOpen,
} from 'lucide-react';
import { ContentLanguage } from '@cms-ng/shared';
import LanguageBadge from '@/components/language-badge';
import ResearchKitPanel from '@/components/research-kit-panel';
import { Button, Badge, Card } from '@/components/ui';

export default function StoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const storyId = params.id as string;
  const { user } = useAuthStore();
  const t = useTranslations('stories');
  const tc = useTranslations('common');

  const [story, setStory] = useState<Story | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Research kit state
  const [researchKit, setResearchKit] = useState<ResearchKitResult | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [showResearchPanel, setShowResearchPanel] = useState(false);

  // Draft generation state
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState('');

  // Edit form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [angle, setAngle] = useState('');
  const [status, setStatus] = useState<Story['status']>('DRAFT');
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>(ContentLanguage.SIMPLIFIED_CHINESE);
  const [authors, setAuthors] = useState<AuthorSummary[]>([]);
  const [authorSlug, setAuthorSlug] = useState('');
  const [authorsAvailable, setAuthorsAvailable] = useState(true);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [storyId]);

  // Fetch author personas once for the author-style dropdown.
  useEffect(() => {
    getAuthors()
      .then((info) => {
        setAuthors(info.authors);
        setAuthorsAvailable(info.source === 'disk' && info.authors.length > 0);
      })
      .catch(() => setAuthorsAvailable(false));
  }, []);

  async function loadData() {
    setLoadError(null);
    try {
      const [storyData, articlesResp] = await Promise.all([
        getStory(storyId),
        getArticles({ storyId }),
      ]);
      setStory(storyData);
      setArticles(articlesResp.data);
      setTitle(storyData.title);
      setDescription(storyData.description || '');
      setAngle(storyData.angle || '');
      setStatus(storyData.status);
      if (storyData.contentLanguage) {
        setContentLanguage(storyData.contentLanguage);
      }
    } catch (err: unknown) {
      // 401 is handled globally by the api interceptor (redirect to /login).
      // Map other common status codes to user-friendly messages; never let
      // the error propagate as an unhandled rejection.
      const status =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      if (status === 403) {
        setLoadError(apiMsg || t('detail.errors.forbidden'));
      } else if (status === 404) {
        setLoadError(t('detail.errors.notFound'));
      } else if (status && status >= 500) {
        setLoadError(t('detail.errors.server'));
      } else {
        setLoadError(apiMsg || t('detail.errors.generic'));
      }
      setStory(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateStory(storyId, { title, description, angle, status, contentLanguage });
      setIsEditing(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('detail.deleteConfirm'))) return;
    await deleteStory(storyId);
    router.push('/dashboard');
  }

  async function handleCreateArticle() {
    const title = prompt(t('detail.articleTitlePrompt'));
    if (!title) return;
    await createArticle({
      storyId,
      title,
      content: '',
      contentLanguage: user?.preferredLanguage,
    });
    await loadData();
  }

  async function handleGenerateResearchKit() {
    setResearchLoading(true);
    setShowResearchPanel(true);
    try {
      const result = await generateResearchKit(storyId, contentLanguage);
      setResearchKit(result);
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      alert(apiMsg || t('research.failed'));
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleGenerateDraft() {
    if (!researchKit) return;
    setDraftLoading(true);
    try {
      const { article } = await generateDraftFromResearchKit(storyId, researchKit, draftInstruction, contentLanguage, authorSlug);
      router.push(`/dashboard/articles/${article.id}`);
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      alert(apiMsg || t('draft.failed'));
      setDraftLoading(false);
    }
  }

  const hasResearchData = researchKit && (
    researchKit.timeline.length > 0 ||
    researchKit.people.length > 0 ||
    researchKit.data.length > 0 ||
    researchKit.opinions.length > 0 ||
    (researchKit.wikipedia?.length ?? 0) > 0
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">{loadError ?? t('detail.errors.notFound')}</p>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    DRAFT: t('detail.status.DRAFT'),
    WRITING: t('detail.status.WRITING'),
    AI_OPTIMIZING: t('detail.status.AI_OPTIMIZING'),
    PENDING_REVIEW: t('detail.status.PENDING_REVIEW'),
    IN_REVIEW: t('detail.status.IN_REVIEW'),
    REVISION: t('detail.status.REVISION'),
    APPROVED: t('detail.status.APPROVED'),
    PUBLISHED: t('detail.status.PUBLISHED'),
    ARCHIVED: t('detail.status.ARCHIVED'),
  };

  return (
    <div className="h-full p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToDashboard')}
        </Link>

        <div className="mb-6 flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-2xl font-semibold bg-transparent border-b border-line-strong outline-none focus:border-brand"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full text-sm text-muted bg-transparent border border-line rounded-lg px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  placeholder={t('detail.descriptionPlaceholder')}
                />
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                    className="flex-1 text-sm bg-transparent border border-line rounded-lg px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    placeholder={t('detail.anglePlaceholder')}
                  />
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Story['status'])}
                    className="text-sm border border-line rounded-lg px-3 py-2 bg-surface text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  >
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-foreground">{story.title}</h1>
                  <Badge tone="neutral" className="px-3 py-1">
                    {statusLabels[story.status] || story.status}
                  </Badge>
                  <select
                    value={contentLanguage}
                    onChange={(e) => setContentLanguage(e.target.value as ContentLanguage)}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    title={t('language.label')}
                  >
                    <option value={ContentLanguage.SIMPLIFIED_CHINESE}>{t('language.simplifiedChinese')}</option>
                    <option value={ContentLanguage.TRADITIONAL_CHINESE_HK}>{t('language.traditionalChineseHk')}</option>
                    <option value={ContentLanguage.TRADITIONAL_CHINESE_CANTONESE}>{t('language.traditionalChineseCantonese')}</option>
                    <option value={ContentLanguage.ENGLISH}>{t('language.english')}</option>
                  </select>
                  <select
                    value={authorSlug}
                    onChange={(e) => setAuthorSlug(e.target.value)}
                    disabled={!authorsAvailable}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                    title={
                      authorsAvailable
                        ? t('detail.authorStyle.availableHint')
                        : t('detail.authorStyle.unavailableHint')
                    }
                  >
                    <option value="">{t('detail.authorStyle.default')}</option>
                    {authors.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {story.description && (
                  <p className="mt-2 text-sm text-muted">{story.description}</p>
                )}
                {story.angle && (
                  <p className="mt-1 text-sm text-muted">{t('detail.angle', { angle: story.angle })}</p>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 ml-4">
            {isEditing ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={handleSave}
                >
                  {!saving && <Save className="h-4 w-4" />}
                  {tc('actions.save')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  {tc('actions.cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  {tc('actions.edit')}
                </Button>
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  title={t('detail.deleteTooltip')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* AI Research Kit */}
        {showResearchPanel && (
          <ResearchKitPanel
            researchKit={researchKit}
            loading={researchLoading}
            onGenerate={handleGenerateResearchKit}
            onClose={() => setShowResearchPanel(false)}
            onGenerateDraft={handleGenerateDraft}
            draftLoading={draftLoading}
          />
        )}
        {showResearchPanel && hasResearchData && (
          <div className="mb-6">
            <textarea
              value={draftInstruction}
              onChange={(e) => setDraftInstruction(e.target.value)}
              rows={2}
              className="w-full text-sm text-muted bg-surface border border-line rounded-lg px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder={t('draft.instructionPlaceholder')}
            />
          </div>
        )}
        {!showResearchPanel && (
          <Card className="mb-6">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-medium text-foreground">{t('research.title')}</h2>
                <span className="text-xs text-subtle">{t('research.subtitle')}</span>
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={researchLoading}
                onClick={() => {
                  setShowResearchPanel(true);
                  handleGenerateResearchKit();
                }}
              >
                {!researchLoading && <BookOpen className="h-4 w-4" />}
                {t('research.generate')}
              </Button>
            </div>
          </Card>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">{t('detail.articlesTitle')}</h2>
          <Button variant="primary" size="sm" onClick={handleCreateArticle}>
            <Plus className="h-4 w-4" />
            {t('detail.createArticle')}
          </Button>
        </div>

        <div className="space-y-2">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/dashboard/articles/${article.id}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 hover:shadow-sm transition-shadow"
            >
              <FileText className="h-5 w-5 text-subtle" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">{article.title}</h3>
                <p className="text-xs text-muted">
                  {article.subtitle || t('detail.noSubtitle')} · {t('detail.version', { version: article.version })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    article.status === 'PUBLISHED'
                      ? 'success'
                      : article.status === 'PENDING_REVIEW'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {statusLabels[article.status] || article.status}
                </Badge>
                <LanguageBadge language={article.contentLanguage} />
              </div>
            </Link>
          ))}
          {articles.length === 0 && (
            <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
              <p className="text-sm text-muted">{t('detail.noArticles')}</p>
              <button
                onClick={handleCreateArticle}
                className="mt-2 text-sm font-medium text-foreground hover:underline"
              >
                {t('detail.createFirstArticle')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
