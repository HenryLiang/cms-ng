'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>(ContentLanguage.TRADITIONAL_CHINESE_HK);
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
        setLoadError(apiMsg || '您没有权限访问此选题');
      } else if (status === 404) {
        setLoadError('选题不存在');
      } else if (status && status >= 500) {
        setLoadError('服务器错误，请稍后重试');
      } else {
        setLoadError(apiMsg || '加载失败，请稍后重试');
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
    if (!confirm('确定要删除这个选题吗？相关稿件也会被删除。')) return;
    await deleteStory(storyId);
    router.push('/dashboard');
  }

  async function handleCreateArticle() {
    const title = prompt('请输入稿件标题：');
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
      alert(apiMsg || '资料搜集失败，请稍后重试');
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
      alert(apiMsg || '初稿生成失败，请稍后重试');
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
        <p className="text-muted">{loadError ?? '选题不存在'}</p>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    DRAFT: '选题中',
    WRITING: '采写中',
    AI_OPTIMIZING: 'AI优化中',
    PENDING_REVIEW: '待审核',
    IN_REVIEW: '审核中',
    REVISION: '退回修改',
    APPROVED: '已通过',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  };

  return (
    <div className="h-full p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回工作台
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
                  placeholder="选题描述..."
                />
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                    className="flex-1 text-sm bg-transparent border border-line rounded-lg px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    placeholder="报道角度..."
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
                    title="内容语言"
                  >
                    <option value={ContentLanguage.SIMPLIFIED_CHINESE}>简体中文</option>
                    <option value={ContentLanguage.TRADITIONAL_CHINESE_HK}>繁体中文（香港）</option>
                    <option value={ContentLanguage.TRADITIONAL_CHINESE_CANTONESE}>繁体中文（粤语）</option>
                    <option value={ContentLanguage.ENGLISH}>English</option>
                  </select>
                  <select
                    value={authorSlug}
                    onChange={(e) => setAuthorSlug(e.target.value)}
                    disabled={!authorsAvailable}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                    title={
                      authorsAvailable
                        ? '作者风格：选中的作者文风将应用到生成的初稿'
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
                {story.description && (
                  <p className="mt-2 text-sm text-muted">{story.description}</p>
                )}
                {story.angle && (
                  <p className="mt-1 text-sm text-muted">角度：{story.angle}</p>
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
                  保存
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  编辑
                </Button>
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  title="删除选题"
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
              placeholder="对初稿的特殊要求，如：侧重民生角度、增加专家观点、控制字数在2000字以内..."
            />
          </div>
        )}
        {!showResearchPanel && (
          <Card className="mb-6">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-medium text-foreground">AI 资料搜集</h2>
                <span className="text-xs text-subtle">基于选题信息生成结构化背景资料</span>
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
                生成资料包
              </Button>
            </div>
          </Card>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">相关稿件</h2>
          <Button variant="primary" size="sm" onClick={handleCreateArticle}>
            <Plus className="h-4 w-4" />
            新建稿件
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
                  {article.subtitle || '暂无副标题'} · 版本 {article.version}
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
              <p className="text-sm text-muted">暂无稿件</p>
              <button
                onClick={handleCreateArticle}
                className="mt-2 text-sm font-medium text-foreground hover:underline"
              >
                创建第一篇稿件 -&gt;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
