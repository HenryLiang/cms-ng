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
import { useAuthStore } from '@/store/auth-store';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Loader2,
  Save,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { ContentLanguage } from '@cms-ng/shared';
import LanguageBadge from '@/components/language-badge';
import ResearchKitPanel from '@/components/research-kit-panel';

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

  useEffect(() => {
    loadData();
  }, [storyId]);

  async function loadData() {
    setLoadError(null);
    try {
      const [storyData, articlesData] = await Promise.all([
        getStory(storyId),
        getArticles(storyId),
      ]);
      setStory(storyData);
      setArticles(articlesData);
      setTitle(storyData.title);
      setDescription(storyData.description || '');
      setAngle(storyData.angle || '');
      setStatus(storyData.status);
      if (storyData.contentLanguage) {
        setContentLanguage(storyData.contentLanguage);
      }
    } catch (err: any) {
      // 401 is handled globally by the api interceptor (redirect to /login).
      // Map other common status codes to user-friendly messages; never let
      // the error propagate as an unhandled rejection.
      const status = err?.response?.status;
      const apiMsg = err?.response?.data?.message;
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
    } catch (err: any) {
      const apiMsg = err?.response?.data?.message;
      alert(apiMsg || '资料搜集失败，请稍后重试');
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleGenerateDraft() {
    if (!researchKit) return;
    setDraftLoading(true);
    try {
      const { article } = await generateDraftFromResearchKit(storyId, researchKit, draftInstruction, contentLanguage);
      router.push(`/dashboard/articles/${article.id}`);
    } catch (err: any) {
      const apiMsg = err?.response?.data?.message;
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
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500">{loadError ?? '选题不存在'}</p>
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
          className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
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
                  className="w-full text-2xl font-semibold bg-transparent border-b border-zinc-300 outline-none focus:border-zinc-900"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full text-sm text-zinc-600 bg-transparent border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400"
                  placeholder="选题描述..."
                />
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                    className="flex-1 text-sm bg-transparent border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400"
                    placeholder="报道角度..."
                  />
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Story['status'])}
                    className="text-sm border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400"
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
                  <h1 className="text-2xl font-semibold">{story.title}</h1>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                    {statusLabels[story.status] || story.status}
                  </span>
                  <select
                    value={contentLanguage}
                    onChange={(e) => setContentLanguage(e.target.value as ContentLanguage)}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 outline-none focus:border-zinc-400"
                    title="内容语言"
                  >
                    <option value={ContentLanguage.SIMPLIFIED_CHINESE}>简体中文</option>
                    <option value={ContentLanguage.TRADITIONAL_CHINESE_HK}>繁体中文（香港）</option>
                    <option value={ContentLanguage.TRADITIONAL_CHINESE_CANTONESE}>繁体中文（粤语）</option>
                    <option value={ContentLanguage.ENGLISH}>English</option>
                  </select>
                </div>
                {story.description && (
                  <p className="mt-2 text-sm text-zinc-600">{story.description}</p>
                )}
                {story.angle && (
                  <p className="mt-1 text-sm text-zinc-500">角度：{story.angle}</p>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 ml-4">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  编辑
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
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
              className="w-full text-sm text-zinc-600 bg-white border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400"
              placeholder="对初稿的特殊要求，如：侧重民生角度、增加专家观点、控制字数在2000字以内..."
            />
          </div>
        )}
        {!showResearchPanel && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-medium text-zinc-900">AI 资料搜集</h2>
                <span className="text-xs text-zinc-400">基于选题信息生成结构化背景资料</span>
              </div>
              <button
                onClick={() => {
                  setShowResearchPanel(true);
                  handleGenerateResearchKit();
                }}
                disabled={researchLoading}
                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                <BookOpen className="h-4 w-4" />
                生成资料包
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">相关稿件</h2>
          <button
            onClick={handleCreateArticle}
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            新建稿件
          </button>
        </div>

        <div className="space-y-2">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/dashboard/articles/${article.id}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 hover:shadow-sm transition-shadow"
            >
              <FileText className="h-5 w-5 text-zinc-400" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-zinc-900 truncate">{article.title}</h3>
                <p className="text-xs text-zinc-500">
                  {article.subtitle || '暂无副标题'} · 版本 {article.version}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  article.status === 'PUBLISHED'
                    ? 'bg-emerald-50 text-emerald-700'
                    : article.status === 'PENDING_REVIEW'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-zinc-100 text-zinc-700'
                }`}>
                  {statusLabels[article.status] || article.status}
                </span>
                <LanguageBadge language={article.contentLanguage} />
              </div>
            </Link>
          ))}
          {articles.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
              <p className="text-sm text-zinc-500">暂无稿件</p>
              <button
                onClick={handleCreateArticle}
                className="mt-2 text-sm font-medium text-zinc-900 hover:underline"
              >
                创建第一篇稿件 →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
