'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  getArticle,
  updateArticle,
  deleteArticle,
  getArticleVersions,
  rollbackArticle,
  aiRewrite,
  aiExpand,
  aiCondense,
  aiPolish,
  aiHeadlines,
  aiExcerpt,
  aiTag,
  aiChat,
  aiGenerateDraft,
  aiFactCheck,
  aiReviewReport,
  aiOptimizeSEO,
  aiOptimizeGEO,
  aiGenerateImage,
  type Article,
  type ArticleVersion,
  type HeadlineOption,
  type ChatMessage,
  type DraftResult,
  type FactCheckResult,
  type ReviewReportResult,
  type SEOResult,
  type GEOResult,
  type GenerateImageResult,
  type ArticleStatus,
} from '@/lib/article-api';
import { getAuthors, type AuthorSummary } from '@/lib/authors-api';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
} from '@cms-ng/shared';
import { getEditors } from '@/lib/users-api';
import { uploadMedia } from '@/lib/media-api';
import RichTextEditor, { type RichTextEditorRef } from '@/components/rich-text-editor';
import { MediaPicker } from '@/components/media-picker';
import FactCheckPanel from '@/components/fact-check-panel';
import ReviewReportPanel from '@/components/review-report-panel';
import SEOPanel from '@/components/seo-panel';
import GEOPanel from '@/components/geo-panel';
import ChannelPanel from '@/components/channels/channel-panel';
import ArticleTagsEditor from '@/components/article-tags-editor';
import { Badge, Button, StatusBadge, buttonClasses } from '@/components/ui';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Send,
  RotateCcw,
  Wand2,
  Sparkles,
  MessageSquare,
  X,
  Check,
  CheckCircle2,
  Plus,
  Scissors,
  PenTool,
  SendHorizonal,
  History,
  ShieldCheck,
  ClipboardCheck,
  TrendingUp,
  Image as ImageIcon,
  Bot,
  Clapperboard,
  Upload,
} from 'lucide-react';

export default function ArticleEditorPage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;
  const t = useTranslations('articles');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>(
    DEFAULT_CONTENT_LANGUAGE,
  );
  // Author-style persona selector. authorSlug='' means "use default generation".
  // Loaded once on mount from GET /authors; degrades gracefully when no data on disk.
  const [authors, setAuthors] = useState<AuthorSummary[]>([]);
  const [authorSlug, setAuthorSlug] = useState<string>('');
  const [authorsAvailable, setAuthorsAvailable] = useState<boolean>(true);

  // AI Quick Mode state
  const [selectedText, setSelectedText] = useState('');
  const selectedTextRef = useRef('');
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [showAIResult, setShowAIResult] = useState(false);
  const editorRef = useRef<RichTextEditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Headline Lab state
  const [showHeadlines, setShowHeadlines] = useState(false);
  const [headlines, setHeadlines] = useState<HeadlineOption[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);

  // AI Excerpt state
  const [excerptLoading, setExcerptLoading] = useState(false);
  const [tagLoading, setTagLoading] = useState(false);

  // AI Draft Generation state
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // AI Fact Check state
  const [showFactCheck, setShowFactCheck] = useState(false);
  const [factCheckResult, setFactCheckResult] = useState<FactCheckResult | null>(null);
  const [factCheckLoading, setFactCheckLoading] = useState(false);

  // AI Review Report state
  const [showReviewReport, setShowReviewReport] = useState(false);
  const [reviewReportResult, setReviewReportResult] = useState<ReviewReportResult | null>(null);
  const [reviewReportLoading, setReviewReportLoading] = useState(false);

  // AI SEO state
  const [showSEO, setShowSEO] = useState(false);
  const [seoResult, setSeoResult] = useState<SEOResult | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);

  // AI GEO state
  const [showGEO, setShowGEO] = useState(false);
  const [geoResult, setGeoResult] = useState<GEOResult | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // AI Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Submit for review modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editors, setEditors] = useState<{ id: string; name: string }[]>([]);
  const [selectedEditor, setSelectedEditor] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Version history
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  // AI Image Generation state
  const [showImageGen, setShowImageGen] = useState(false);
  const [imageGenLoading, setImageGenLoading] = useState(false);
  const [imageGenResult, setImageGenResult] = useState<GenerateImageResult | null>(null);
  const [imageGenStyle, setImageGenStyle] = useState<'news' | 'illustration' | 'photo' | 'social'>('news');
  const [imageGenRatio, setImageGenRatio] = useState('16:9');
  const [imageGenSize, setImageGenSize] = useState<'2K' | '3K' | '4K'>('2K');
  const [imageGenCustomPrompt, setImageGenCustomPrompt] = useState('');

  // Image preview
  const [showImagePreview, setShowImagePreview] = useState(false);
  // Cover image: pick from media library / upload
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  useEffect(() => {
    loadArticle();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [articleId]);

  // Fetch author personas once. When the backend reports no data on disk
  // (source='fallback'), the picker is disabled and authorSlug stays '' so
  // all AI ops use the default generation style.
  useEffect(() => {
    getAuthors()
      .then((info) => {
        setAuthors(info.authors);
        setAuthorsAvailable(info.source === 'disk' && info.authors.length > 0);
      })
      .catch(() => {
        // Network/backend error — disable the picker rather than blocking editing.
        setAuthorsAvailable(false);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadArticle() {
    setLoadError(null);
    try {
      const data = await getArticle(articleId);
      setArticle(data);
      setTitle(data.title);
      setSubtitle(data.subtitle || '');
      setContent(data.content);
      setExcerpt(data.excerpt || '');
      setTags(data.tags ?? []);
      if (data.contentLanguage) {
        setContentLanguage(data.contentLanguage);
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
        setLoadError(apiMsg || t('editor.loadErrorForbidden'));
      } else if (status === 404) {
        setLoadError(t('editor.loadErrorNotFound'));
      } else if (status && status >= 500) {
        setLoadError(t('editor.loadErrorServer'));
      } else {
        setLoadError(apiMsg || t('editor.loadErrorGeneric'));
      }
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(status?: string) {
    setSaving(true);
    try {
      // Read the live editor HTML directly (editor onChange is debounced 500ms,
      // so the `content` state may lag the editor - issue #114). This guarantees
      // Save always persists the latest edits regardless of debounce timing.
      const latestContent = editorRef.current?.editor?.getHTML() ?? content;
      await updateArticle(articleId, {
        title,
        subtitle: subtitle || undefined,
        content: latestContent,
        excerpt: excerpt || undefined,
        tags,
        status: status as ArticleStatus,
        contentLanguage,
        coverImage: article?.coverImage ?? null,
      });
      await loadArticle();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // 错误已由 api 拦截器 toast；避免 unhandled rejection
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('editor.deleteConfirm'))) return;
    await deleteArticle(articleId);
    router.push('/dashboard/articles');
  }

  async function handleOpenSubmitModal() {
    setShowSubmitModal(true);
    setSelectedEditor('');
    try {
      const data = await getEditors();
      setEditors(data);
    } catch {
      setEditors([]);
    }
  }

  async function handleConfirmSubmit() {
    setSubmittingReview(true);
    try {
      await updateArticle(articleId, {
        status: 'PENDING_REVIEW',
        editorId: selectedEditor || undefined,
      });
      setShowSubmitModal(false);
      await loadArticle();
    } finally {
      setSubmittingReview(false);
    }
  }

  // ===== Version History =====
  async function handleOpenVersions() {
    setShowVersions(true);
    setVersionsLoading(true);
    try {
      const data = await getArticleVersions(articleId);
      setVersions(data);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRollback(version: number) {
    if (!confirm(t('editor.rollbackConfirm', { version }))) return;
    setRollingBack(true);
    try {
      await rollbackArticle(articleId, version);
      setShowVersions(false);
      await loadArticle();
    } finally {
      setRollingBack(false);
    }
  }

  // ===== Text Selection Detection =====
  const handleTextSelection = useCallback(() => {
    const editor = editorRef.current?.editor;
    const container = editorContainerRef.current;
    if (!editor || !container) return;

    const { from, to } = editor.state.selection;
    if (from === to) {
      if (!showAIResult && !aiLoading) {
        setShowAIMenu(false);
        setShowAIResult(false);
        selectedTextRef.current = '';
      }
      return;
    }

    const text = editor.state.doc.textBetween(from, to).trim();
    if (text.length > 0) {
      const coords = editor.view.coordsAtPos(from);
      const containerRect = container.getBoundingClientRect();
      setSelectionPos({
        x: coords.left - containerRect.left,
        y: coords.top - containerRect.top,
      });
      setSelectedText(text);
      setShowAIMenu(true);
      if (text !== selectedTextRef.current) {
        setShowAIResult(false);
      }
      selectedTextRef.current = text;
    } else if (!showAIResult && !aiLoading) {
      setShowAIMenu(false);
      setShowAIResult(false);
      selectedTextRef.current = '';
    }
  }, [showAIResult, aiLoading]);

  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(handleTextSelection, 10);
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleTextSelection]);

  // ===== AI Quick Operations =====
  async function handleAIOperation(operation: string, style?: string) {
    const text = selectedTextRef.current;
    if (!text) return;
    setAiLoading(true);
    setShowAIResult(true);
    try {
      let result = '';
      switch (operation) {
        case 'rewrite':
          result = await aiRewrite(articleId, text, style, undefined, contentLanguage, authorSlug);
          break;
        case 'expand':
          result = await aiExpand(articleId, text, undefined, contentLanguage, authorSlug);
          break;
        case 'condense':
          result = await aiCondense(articleId, text, undefined, contentLanguage, authorSlug);
          break;
        case 'polish':
          result = await aiPolish(articleId, text, contentLanguage, authorSlug);
          break;
      }
      setAiResult(result);
    } finally {
      setAiLoading(false);
    }
  }

  function applyAIResult(mode: 'replace' | 'insert') {
    if (!aiResult) return;
    const editor = editorRef.current?.editor;
    if (!editor) return;

    const { from, to } = editor.state.selection;

    if (mode === 'replace') {
      editor.chain().focus().deleteRange({ from, to }).insertContent(aiResult).run();
    } else {
      editor.chain().focus().insertContent('\n\n' + aiResult + '\n\n').run();
    }

    setShowAIMenu(false);
    setShowAIResult(false);
    setAiResult('');
    setSelectedText('');
    selectedTextRef.current = '';
  }

  // ===== Headline Lab =====
  async function handleGenerateHeadlines() {
    setHeadlinesLoading(true);
    setShowHeadlines(true);
    try {
      const result = await aiHeadlines(articleId, 5, contentLanguage, authorSlug);
      setHeadlines(result);
    } catch {
      setHeadlines([]);
    } finally {
      setHeadlinesLoading(false);
    }
  }

  function applyHeadline(newTitle: string) {
    setTitle(newTitle);
    setShowHeadlines(false);
  }

  // ===== AI Excerpt =====
  async function handleGenerateExcerpt() {
    setExcerptLoading(true);
    try {
      const result = await aiExcerpt(articleId, 200, contentLanguage, authorSlug);
      setExcerpt(result);
    } finally {
      setExcerptLoading(false);
    }
  }

  async function handleGenerateTags() {
    setTagLoading(true);
    try {
      const latestContent = editorRef.current?.editor?.getHTML() ?? content;
      const updated = await aiTag(articleId, {
        title,
        content: latestContent,
        tags,
        language: contentLanguage,
      });
      setArticle(updated);
      setTags((current) =>
        Array.from(new Set([...current, ...(updated.tags ?? [])])),
      );
    } catch {
      // 错误已由 api 拦截器 toast；避免点击事件产生 unhandled rejection
    } finally {
      setTagLoading(false);
    }
  }

  // ===== AI Draft Generation =====
  async function handleGenerateDraft() {
    setDraftLoading(true);
    try {
      const result = await aiGenerateDraft(articleId, undefined, contentLanguage, authorSlug);
      setDraftResult(result);
      setShowDraftPreview(true);
    } catch {
      alert(t('aiPanel.draftFailed'));
    } finally {
      setDraftLoading(false);
    }
  }

  function applyDraft(mode: 'replace' | 'insert') {
    if (!draftResult) return;
    if (mode === 'replace') {
      setTitle(draftResult.title);
      setSubtitle(draftResult.subtitle || '');
      setContent(draftResult.content);
    } else {
      setContent((prev) => prev + '\n\n' + draftResult.content);
    }
    setTags((current) =>
      Array.from(new Set([...current, ...(draftResult.tags ?? [])])),
    );
    setShowDraftPreview(false);
    setDraftResult(null);
  }

  // ===== AI Fact Check =====
  async function handleFactCheck() {
    setFactCheckLoading(true);
    try {
      const result = await aiFactCheck(articleId, contentLanguage);
      setFactCheckResult(result);
      setShowFactCheck(true);
    } catch {
      alert(t('aiPanel.factCheckFailed'));
    } finally {
      setFactCheckLoading(false);
    }
  }

  // ===== AI Review Report =====
  async function handleReviewReport() {
    setReviewReportLoading(true);
    try {
      const result = await aiReviewReport(articleId, contentLanguage);
      setReviewReportResult(result);
      setShowReviewReport(true);
    } catch {
      alert(t('aiPanel.reviewReportFailed'));
    } finally {
      setReviewReportLoading(false);
    }
  }

  // ===== AI SEO =====
  async function handleOptimizeSEO() {
    setSeoLoading(true);
    try {
      const result = await aiOptimizeSEO(articleId, contentLanguage);
      setSeoResult(result);
      setShowSEO(true);
    } catch {
      alert(t('aiPanel.seoFailed'));
    } finally {
      setSeoLoading(false);
    }
  }

  // ===== AI GEO =====
  async function handleOptimizeGEO() {
    setGeoLoading(true);
    try {
      const result = await aiOptimizeGEO(articleId, contentLanguage);
      setGeoResult(result);
      setShowGEO(true);
    } catch {
      alert(t('aiPanel.geoFailed'));
    } finally {
      setGeoLoading(false);
    }
  }

  // ===== AI Image Generation =====
  async function handleGenerateImage() {
    setImageGenLoading(true);
    try {
      const result = await aiGenerateImage(articleId, {
        style: imageGenStyle,
        aspectRatio: imageGenRatio,
        size: imageGenSize,
        customPrompt: imageGenCustomPrompt || undefined,
      });
      setImageGenResult(result);
      setArticle((prev) => (prev ? { ...prev, coverImage: result.url } : prev));
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      const errMsg = err instanceof Error ? err.message : undefined;
      const msg = apiMsg || errMsg || t('aiPanel.unknownError');
      console.error('AI image generation failed:', msg, err);
      alert(t('aiPanel.imageFailed', { message: msg }));
    } finally {
      setImageGenLoading(false);
    }
  }

  // ===== Cover image: upload to media library and set as cover =====
  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const [asset] = await uploadMedia([file]);
      if (asset) {
        setArticle((prev) => (prev ? { ...prev, coverImage: asset.url } : prev));
      }
    } catch {
      // 错误已由 api 拦截器 toast，不重复弹窗
    } finally {
      setCoverUploading(false);
      e.target.value = '';
    }
  }

  // ===== AI Chat =====
  async function handleSendChat() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const reply = await aiChat(articleId, [
        ...chatMessages,
        { role: 'user', content: userMsg },
      ], contentLanguage, authorSlug);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } finally {
      setChatLoading(false);
    }
  }

  const quickChatPrompts = [
    t('aiChat.quickPrompts.angle'),
    t('aiChat.quickPrompts.data'),
    t('aiChat.quickPrompts.logic'),
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">{loadError ?? t('editor.loadErrorNotFound')}</p>
      </div>
    );
  }

  const wordCount = content.replace(/<[^>]+>/g, '').trim().length;

  return (
    <div className="flex h-full flex-col">
      {/* Save success toast */}
      {saveSuccess && article && (
        <div className="absolute top-16 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 shadow-lg transition-opacity duration-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-800">
            {t('editor.saveSuccess', { version: article.version })}
          </span>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/articles" className="text-muted transition-colors hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-transparent text-lg font-semibold text-foreground outline-none"
                placeholder={t('editor.titlePlaceholder')}
              />
              <button
                onClick={handleGenerateHeadlines}
                disabled={headlinesLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-brand/20 bg-brand-soft px-2 py-1 text-xs font-medium text-brand-soft-text transition hover:brightness-95 disabled:opacity-50"
                title={t('headlineLab.title')}
              >
                {headlinesLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {t('headlineLab.title')}
              </button>
              <StatusBadge status={article.status} />
              <select
                value={contentLanguage}
                onChange={(e) => setContentLanguage(e.target.value as ContentLanguage)}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                title={t('editor.languageTooltip')}
              >
                <option value={ContentLanguage.SIMPLIFIED_CHINESE}>{t('language.SIMPLIFIED_CHINESE')}</option>
                <option value={ContentLanguage.TRADITIONAL_CHINESE_HK}>{t('language.TRADITIONAL_CHINESE_HK')}</option>
                <option value={ContentLanguage.TRADITIONAL_CHINESE_CANTONESE}>{t('language.TRADITIONAL_CHINESE_CANTONESE')}</option>
                <option value={ContentLanguage.ENGLISH}>{t('language.ENGLISH')}</option>
              </select>
              <select
                value={authorSlug}
                onChange={(e) => setAuthorSlug(e.target.value)}
                disabled={!authorsAvailable}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                title={
                  authorsAvailable
                    ? t('editor.authorStyleTooltip')
                    : t('editor.authorStyleUnavailableTooltip')
                }
              >
                <option value="">{t('editor.defaultStyle')}</option>
                {authors.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-muted tnum">
              {t('editor.metaLine', {
                version: article.version,
                wordCount,
                savedAt: new Date(article.updatedAt).toLocaleString(locale),
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleOpenVersions}>
            <History className="h-4 w-4" />
            {t('editor.versionHistory')}
          </Button>
          <Button variant="secondary" size="sm" loading={saving} onClick={() => handleSave()}>
            {tCommon('actions.save')}
          </Button>
          <Button variant="primary" size="sm" disabled={saving} onClick={handleOpenSubmitModal}>
            <Send className="h-4 w-4" />
            {t('editor.submitForReview')}
          </Button>
          <button
            onClick={handleDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50"
            title={t('editor.deleteTooltip')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Headline Lab Modal */}
      {showHeadlines && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-20">
          <div className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">{t('headlineLab.title')}</h3>
              </div>
              <button onClick={() => setShowHeadlines(false)} className="text-subtle hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            {headlinesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
              </div>
            ) : headlines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
                <p className="text-muted">{t('headlineLab.empty')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {headlines.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg border border-line p-4 hover:bg-surface-muted transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-base font-medium text-foreground">{h.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                          {h.style}
                        </span>
                        <span className="text-xs text-muted">{h.reasoning}</span>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => applyHeadline(h.title)}
                      className="shrink-0"
                    >
                      {t('headlineLab.adopt')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit for Review Modal */}
      {showSubmitModal && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-20">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('editor.submitForReview')}</h3>
              <button onClick={() => setShowSubmitModal(false)} className="text-subtle hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              {t('submitReview.description')}
            </p>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-foreground">{t('submitReview.editorLabel')}</label>
              <select
                value={selectedEditor}
                onChange={(e) => setSelectedEditor(e.target.value)}
                className="w-full rounded-lg border border-line p-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">{t('submitReview.autoAssign')}</option>
                {editors.map((editor) => (
                  <option key={editor.id} value={editor.id}>
                    {editor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowSubmitModal(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button variant="primary" loading={submittingReview} onClick={handleConfirmSubmit}>
                {!submittingReview && <Send className="h-4 w-4" />}
                {t('submitReview.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersions && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-20">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted" />
                <h3 className="text-lg font-semibold">{t('editor.versionHistory')}</h3>
              </div>
              <button onClick={() => setShowVersions(false)} className="text-subtle hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            {versionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
              </div>
            ) : versions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
                <p className="text-muted">{t('versionHistory.empty')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-lg border border-line p-3 hover:bg-surface-muted"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone="neutral">
                          v{v.version}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{v.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {new Date(v.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                    {v.version !== article?.version && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRollback(v.version)}
                        disabled={rollingBack}
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t('versionHistory.rollback')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Draft Preview Modal */}
      {showDraftPreview && draftResult && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-10">
          <div className="w-full max-w-3xl rounded-xl bg-surface p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">{t('draftPreview.title')}</h3>
              </div>
              <button onClick={() => setShowDraftPreview(false)} className="text-subtle hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto space-y-4 pr-2">
              <div>
                <label className="text-xs font-medium text-muted">{t('draftPreview.titleLabel')}</label>
                <p className="text-base font-semibold text-foreground">{draftResult.title}</p>
              </div>
              {draftResult.subtitle && (
                <div>
                  <label className="text-xs font-medium text-muted">{t('draftPreview.subtitleLabel')}</label>
                  <p className="text-base text-foreground">{draftResult.subtitle}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted">{t('draftPreview.contentLabel')}</label>
                <DraftPreview content={draftResult.content} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-line">
              <Button variant="secondary" onClick={() => setShowDraftPreview(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button variant="secondary" onClick={() => applyDraft('insert')}>
                <Plus className="h-4 w-4" />
                {t('draftPreview.insertAtEnd')}
              </Button>
              <Button variant="primary" onClick={() => applyDraft('replace')}>
                <Check className="h-4 w-4" />
                {t('draftPreview.replaceContent')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={editorContainerRef} className="flex-1 overflow-hidden bg-surface relative flex flex-col">
          <div className="mx-auto max-w-3xl w-full px-8 pt-8">
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="mb-4 w-full bg-transparent text-lg text-muted outline-none"
              placeholder={t('editor.subtitlePlaceholder')}
            />
            {/* Cover Image */}
            {article?.coverImage ? (
              <div
                className="mb-4 rounded-lg border border-line overflow-hidden max-h-[300px] cursor-pointer"
                onClick={() => setShowImagePreview(true)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 外链 COS 封面图,用 img 务实(避免 next/image remotePatterns 配置) */}
                <img
                  src={article.coverImage}
                  alt={t('editor.coverImageAlt')}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowImageGen(true)}>
                <Sparkles className="h-3.5 w-3.5" />
                {t('editor.aiGenerate')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowCoverPicker(true)}>
                <ImageIcon className="h-3.5 w-3.5" />
                {t('editor.pickFromMediaLibrary')}
              </Button>
              <label className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'cursor-pointer' })}>
                <Upload className="h-3.5 w-3.5" />
                {coverUploading ? t('editor.uploading') : t('editor.uploadImage')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={coverUploading}
                  onChange={(e) => void handleCoverUpload(e)}
                />
              </label>
              {article?.coverImage && (
                <button
                  onClick={() =>
                    setArticle((prev) =>
                      prev ? { ...prev, coverImage: undefined } : prev,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t('editor.removeCover')}
                </button>
              )}
            </div>
            <MediaPicker
              open={showCoverPicker}
              onClose={() => setShowCoverPicker(false)}
              onPick={(asset) => {
                setArticle((prev) =>
                  prev ? { ...prev, coverImage: asset.url } : prev,
                );
              }}
            />
          </div>
          <div className="flex-1 min-h-0 mx-auto max-w-3xl w-full px-8 pb-8">
            <RichTextEditor
              key={articleId}
              ref={editorRef}
              content={content || ''}
              onChange={setContent}
              placeholder={t('editor.contentPlaceholder')}
            />
          </div>

          {/* AI Floating Menu */}
          {showAIMenu && selectedText && (
            <>
              {!showAIResult ? (
                <div
                  className="absolute z-40 flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1.5 shadow-lg"
                  style={{
                    left: Math.min(selectionPos.x, window.innerWidth - 300),
                    top: Math.max(selectionPos.y - 45, 10),
                  }}
                >
                  <AIOperationButton
                    icon={<PenTool className="h-3.5 w-3.5" />}
                    label={t('aiMenu.rewrite')}
                    onClick={() => handleAIOperation('rewrite', 'serious')}
                  />
                  <div className="h-4 w-px bg-slate-700" />
                  <AIOperationButton
                    icon={<Plus className="h-3.5 w-3.5" />}
                    label={t('aiMenu.expand')}
                    onClick={() => handleAIOperation('expand')}
                  />
                  <div className="h-4 w-px bg-slate-700" />
                  <AIOperationButton
                    icon={<Scissors className="h-3.5 w-3.5" />}
                    label={t('aiMenu.condense')}
                    onClick={() => handleAIOperation('condense')}
                  />
                  <div className="h-4 w-px bg-slate-700" />
                  <AIOperationButton
                    icon={<Wand2 className="h-3.5 w-3.5" />}
                    label={t('aiMenu.polish')}
                    onClick={() => handleAIOperation('polish')}
                  />
                </div>
              ) : (
                <div
                  className="absolute z-40 w-80 rounded-lg bg-surface border border-line shadow-xl overflow-hidden"
                  style={{
                    left: Math.min(selectionPos.x - 160, window.innerWidth - 340),
                    top: Math.max(selectionPos.y - 20, 10),
                  }}
                >
                  <div className="flex items-center justify-between border-b border-line px-3 py-2">
                    <span className="text-xs font-medium text-muted">{t('aiMenu.resultTitle')}</span>
                    <button onClick={() => setShowAIMenu(false)} className="text-subtle hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto p-3">
                    {aiLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                      </div>
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiResult}</p>
                    )}
                  </div>
                  {!aiLoading && (
                    <div className="flex gap-2 border-t border-line p-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => applyAIResult('replace')}
                        className="flex-1"
                      >
                        <Check className="h-3 w-3" />
                        {t('aiMenu.replace')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => applyAIResult('insert')}
                        className="flex-1"
                      >
                        <Plus className="h-3 w-3" />
                        {t('aiMenu.insert')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowAIMenu(false)}>
                        {tCommon('actions.cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="w-[30rem] border-l border-line bg-canvas p-4 overflow-auto flex flex-col">
          <div className="space-y-6 flex-1">
            <ArticleTagsEditor
              tags={tags}
              onChange={setTags}
              onAITag={handleGenerateTags}
              aiLoading={tagLoading}
            />

            {/* Excerpt */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">{t('editor.excerptHeading')}</h3>
                <button
                  onClick={handleGenerateExcerpt}
                  disabled={excerptLoading}
                  className="flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  {excerptLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {t('editor.aiGenerate')}
                </button>
              </div>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder={t('editor.excerptPlaceholder')}
              />
            </div>

            {/* Story */}
            <div>
              <h3 className="text-sm font-medium text-foreground">{t('editor.storyHeading')}</h3>
              {article.story ? (
                <Link
                  href={`/dashboard/stories/${article.storyId}`}
                  className="mt-2 block rounded-lg border border-line bg-surface p-3 text-sm hover:shadow-sm transition-shadow"
                >
                  <p className="font-medium text-foreground">{article.story.title}</p>
                </Link>
              ) : (
                <p className="mt-2 text-sm text-muted">{t('editor.noStory')}</p>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <h3 className="text-sm font-medium text-foreground">{t('quickActions.heading')}</h3>
              <div className="mt-2 space-y-2">
                <button
                  onClick={handleGenerateDraft}
                  disabled={draftLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  {draftLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {t('quickActions.generateDraft')}
                </button>
                <button
                  onClick={handleFactCheck}
                  disabled={factCheckLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {factCheckLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {t('quickActions.factCheck')}
                </button>
                <button
                  onClick={handleReviewReport}
                  disabled={reviewReportLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {reviewReportLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4" />
                  )}
                  {t('quickActions.reviewReport')}
                </button>
                <button
                  onClick={handleOptimizeSEO}
                  disabled={seoLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {seoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                  {t('quickActions.seoOptimize')}
                </button>
                <button
                  onClick={handleOptimizeGEO}
                  disabled={geoLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                >
                  {geoLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                  {t('quickActions.geoOptimize')}
                </button>
                <button
                  onClick={() => setShowImageGen(true)}
                  disabled={imageGenLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 disabled:opacity-50"
                >
                  {imageGenLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  {t('quickActions.generateImage')}
                </button>
                <Link
                  href={`/dashboard/video?mode=article&articleId=${article.id}`}
                  className="flex w-full items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100"
                >
                  <Clapperboard className="h-4 w-4" />
                  {t('quickActions.videoGenerate')}
                </Link>
                <button
                  onClick={() => handleSave('DRAFT')}
                  className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('quickActions.revertToDraft')}
                </button>
              </div>
            </div>

            {/* Fact Check Result Panel */}
            {showFactCheck && factCheckResult && (
              <FactCheckPanel
                result={factCheckResult}
                onClose={() => setShowFactCheck(false)}
              />
            )}

            {/* Review Report Result Panel */}
            {showReviewReport && reviewReportResult && (
              <ReviewReportPanel
                result={reviewReportResult}
                onClose={() => setShowReviewReport(false)}
              />
            )}

            {/* SEO Result Panel */}
            {showSEO && seoResult && (
              <SEOPanel
                result={seoResult}
                onClose={() => setShowSEO(false)}
                onApplyTitle={(newTitle) => setTitle(newTitle)}
              />
            )}

            {/* GEO Result Panel */}
            {showGEO && geoResult && (
              <GEOPanel
                result={geoResult}
                onClose={() => setShowGEO(false)}
                onApplySummary={(summary) => setExcerpt(summary)}
              />
            )}
          </div>

          {/* Platform Distribution */}
          <ChannelPanel articleId={articleId} />

          {/* AI Chat Toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100"
          >
            <MessageSquare className="h-4 w-4" />
            {showChat ? t('aiChat.collapse') : t('aiChat.expand')}
          </button>

          {/* AI Chat Panel */}
          {showChat && (
            <div className="mt-4 flex flex-col rounded-lg border border-line bg-surface overflow-hidden" style={{ height: '320px' }}>
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-xs font-medium text-foreground">{t('aiChat.title')}</span>
                <button onClick={() => setShowChat(false)} className="text-subtle hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-xs text-subtle mb-3">{t('aiChat.emptyHint')}</p>
                    <div className="space-y-1.5">
                      {quickChatPrompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setChatInput(prompt);
                          }}
                          className="block w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-muted"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-slate-900 text-white'
                          : 'bg-surface-muted text-foreground'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg bg-surface-muted px-3 py-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex items-center gap-2 border-t border-line p-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder={t('aiChat.inputPlaceholder')}
                  className="flex-1 rounded-md border border-line px-2 py-1.5 text-xs outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <button
                  onClick={handleSendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="rounded-md bg-brand p-1.5 text-white transition hover:bg-brand-hover disabled:opacity-50"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* AI Image Generation Modal */}
      {showImageGen && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-10">
          <div className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('imageGen.title')}</h3>
              <button
                onClick={() => {
                  setShowImageGen(false);
                  setImageGenResult(null);
                }}
                className="text-subtle hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!imageGenResult ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">{t('imageGen.styleLabel')}</label>
                    <div className="flex gap-2">
                      {[
                        { key: 'news', label: t('imageGen.styles.news') },
                        { key: 'illustration', label: t('imageGen.styles.illustration') },
                        { key: 'photo', label: t('imageGen.styles.photo') },
                        { key: 'social', label: t('imageGen.styles.social') },
                      ].map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setImageGenStyle(s.key as 'news' | 'illustration' | 'photo' | 'social')}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            imageGenStyle === s.key
                              ? 'border border-brand bg-brand-soft text-brand-soft-text'
                              : 'border border-line bg-surface text-muted hover:bg-surface-muted'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">{t('imageGen.ratioLabel')}</label>
                    <select
                      value={imageGenRatio}
                      onChange={(e) => setImageGenRatio(e.target.value)}
                      className="w-full rounded-lg border border-line p-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    >
                      <option value="16:9">{t('imageGen.ratios.banner')}</option>
                      <option value="4:3">{t('imageGen.ratios.standard')}</option>
                      <option value="1:1">{t('imageGen.ratios.square')}</option>
                      <option value="3:4">{t('imageGen.ratios.xiaohongshu')}</option>
                      <option value="9:16">{t('imageGen.ratios.stories')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">{t('imageGen.sizeLabel')}</label>
                    <select
                      value={imageGenSize}
                      onChange={(e) => setImageGenSize(e.target.value as '2K' | '3K' | '4K')}
                      className="w-full rounded-lg border border-line p-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    >
                      <option value="2K">{t('imageGen.sizes.fast')}</option>
                      <option value="3K">{t('imageGen.sizes.hd')}</option>
                      <option value="4K">{t('imageGen.sizes.uhd')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">{t('imageGen.extraPromptLabel')}</label>
                    <textarea
                      value={imageGenCustomPrompt}
                      onChange={(e) => setImageGenCustomPrompt(e.target.value)}
                      placeholder={t('imageGen.extraPromptPlaceholder')}
                      rows={2}
                      className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setShowImageGen(false)}>
                    {tCommon('actions.cancel')}
                  </Button>
                  <Button variant="primary" loading={imageGenLoading} onClick={handleGenerateImage}>
                    {!imageGenLoading && <ImageIcon className="h-4 w-4" />}
                    {imageGenLoading ? t('imageGen.generating') : t('imageGen.generate')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-line bg-canvas p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 外链 COS 封面图,用 img 务实(避免 next/image remotePatterns 配置) */}
                  <img
                    src={imageGenResult.url}
                    alt={t('imageGen.title')}
                    className="w-full rounded-lg"
                  />
                </div>
                <p className="mt-2 text-xs text-muted line-clamp-2">
                  Prompt: {imageGenResult.prompt}
                </p>
                <div className="mt-4 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setImageGenResult(null)}>
                    {t('imageGen.regenerate')}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowImageGen(false);
                      setImageGenResult(null);
                    }}
                  >
                    {t('imageGen.done')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Image Preview Overlay */}
      {showImagePreview && article?.coverImage && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={() => setShowImagePreview(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={() => setShowImagePreview(false)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- 外链 COS 封面图预览,用 img 务实 */}
            <img
              src={article.coverImage}
              alt={t('editor.coverPreviewAlt')}
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DraftPreview({ content }: { content: string }) {
  const sanitized = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(?!\/?(?:p|h2|h3|ul|ol|li|blockquote|strong|em|br)\b)[^>]*>/gi, '');
  return (
    <div
      className="prose prose-slate max-w-none mt-1 rounded-lg border border-line bg-canvas p-4"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function AIOperationButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
