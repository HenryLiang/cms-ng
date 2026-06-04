'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
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
  aiChat,
  aiGenerateDraft,
  aiFactCheck,
  aiReviewReport,
  aiOptimizeSEO,
  aiGenerateImage,
  type Article,
  type ArticleVersion,
  type HeadlineOption,
  type ChatMessage,
  type DraftResult,
  type FactCheckResult,
  type ReviewReportResult,
  type SEOResult,
  type GenerateImageResult,
} from '@/lib/article-api';
import { ContentLanguage } from '@cms-ng/shared';
import { getEditors } from '@/lib/users-api';
import RichTextEditor, { type RichTextEditorRef } from '@/components/rich-text-editor';
import FactCheckPanel from '@/components/fact-check-panel';
import ReviewReportPanel from '@/components/review-report-panel';
import SEOPanel from '@/components/seo-panel';
import ChannelPanel from '@/components/channels/channel-panel';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Save,
  Send,
  RotateCcw,
  Wand2,
  Sparkles,
  MessageSquare,
  X,
  Check,
  CheckCircle2,
  Plus,
  Type,
  Scissors,
  AlignLeft,
  PenTool,
  ChevronRight,
  SendHorizonal,
  History,
  ShieldCheck,
  ClipboardCheck,
  Target,
  AlertTriangle,
  TrendingUp,
  Image,
} from 'lucide-react';

export default function ArticleEditorPage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>(ContentLanguage.TRADITIONAL_CHINESE_HK);

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

  useEffect(() => {
    loadArticle();
  }, [articleId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadArticle() {
    try {
      const data = await getArticle(articleId);
      setArticle(data);
      setTitle(data.title);
      setSubtitle(data.subtitle || '');
      setContent(data.content);
      setExcerpt(data.excerpt || '');
      if (data.contentLanguage) {
        setContentLanguage(data.contentLanguage);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(status?: string) {
    setSaving(true);
    try {
      await updateArticle(articleId, {
        title,
        subtitle: subtitle || undefined,
        content,
        excerpt: excerpt || undefined,
        status: status as any,
        contentLanguage,
      });
      await loadArticle();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('确定要删除这篇稿件吗？此操作不可恢复。')) return;
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
    if (!confirm(`确定要回滚到版本 v${version} 吗？当前内容将被覆盖。`)) return;
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
          result = await aiRewrite(articleId, text, style as any, undefined, contentLanguage);
          break;
        case 'expand':
          result = await aiExpand(articleId, text, undefined, contentLanguage);
          break;
        case 'condense':
          result = await aiCondense(articleId, text, undefined, contentLanguage);
          break;
        case 'polish':
          result = await aiPolish(articleId, text, contentLanguage);
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
      const result = await aiHeadlines(articleId, 5, contentLanguage);
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
      const result = await aiExcerpt(articleId, 200, contentLanguage);
      setExcerpt(result);
    } finally {
      setExcerptLoading(false);
    }
  }

  // ===== AI Draft Generation =====
  async function handleGenerateDraft() {
    setDraftLoading(true);
    try {
      const result = await aiGenerateDraft(articleId, undefined, contentLanguage);
      setDraftResult(result);
      setShowDraftPreview(true);
    } catch {
      alert('初稿生成失败，请稍后重试');
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
      alert('事实核查失败，请稍后重试');
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
      alert('预审报告生成失败，请稍后重试');
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
      alert('SEO 分析失败，请稍后重试');
    } finally {
      setSeoLoading(false);
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
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '未知错误';
      console.error('AI 配图生成失败:', msg, err);
      alert(`图片生成失败：${msg}`);
    } finally {
      setImageGenLoading(false);
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
      ], contentLanguage);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } finally {
      setChatLoading(false);
    }
  }

  const quickChatPrompts = [
    '分析这个选题的报道角度',
    '补充数据支撑建议',
    '检查逻辑一致性',
  ];

  const statusLabels: Record<string, string> = {
    DRAFT: '草稿',
    WRITING: '采写中',
    AI_OPTIMIZING: 'AI优化中',
    PENDING_REVIEW: '待审核',
    IN_REVIEW: '审核中',
    REVISION: '退回修改',
    APPROVED: '已通过',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500">稿件不存在</p>
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
            保存成功，当前版本 v{article.version}
          </span>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/articles" className="text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-transparent text-lg font-semibold outline-none"
                placeholder="稿件标题"
              />
              <button
                onClick={handleGenerateHeadlines}
                disabled={headlinesLoading}
                className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                title="标题实验室"
              >
                {headlinesLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                标题实验室
              </button>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {statusLabels[article.status] || article.status}
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
            <p className="text-xs text-zinc-500">
              版本 {article.version} · {wordCount} 字 · 最后保存{' '}
              {new Date(article.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenVersions}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <History className="h-4 w-4" />
            版本历史
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
          <button
            onClick={handleOpenSubmitModal}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            提交审核
          </button>
          <button onClick={handleDelete} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Headline Lab Modal */}
      {showHeadlines && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-20">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">标题实验室</h3>
              </div>
              <button onClick={() => setShowHeadlines(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {headlinesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
              </div>
            ) : headlines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
                <p className="text-zinc-500">暂无标题建议，请稍后重试</p>
              </div>
            ) : (
              <div className="space-y-3">
                {headlines.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-base font-medium text-zinc-900">{h.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                          {h.style}
                        </span>
                        <span className="text-xs text-zinc-500">{h.reasoning}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => applyHeadline(h.title)}
                      className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      采用
                    </button>
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
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">提交审核</h3>
              <button onClick={() => setShowSubmitModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-zinc-500">
              提交后稿件将进入待审核状态，编辑将进行审核。
            </p>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-zinc-700">选择审核编辑（可选）</label>
              <select
                value={selectedEditor}
                onChange={(e) => setSelectedEditor(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 p-2.5 text-sm outline-none focus:border-zinc-400"
              >
                <option value="">自动分配</option>
                {editors.map((editor) => (
                  <option key={editor.id} value={editor.id}>
                    {editor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={submittingReview}
                className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {submittingReview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersions && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-20">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-zinc-600" />
                <h3 className="text-lg font-semibold">版本历史</h3>
              </div>
              <button onClick={() => setShowVersions(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {versionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              </div>
            ) : versions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
                <p className="text-zinc-500">暂无版本历史</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          v{v.version}
                        </span>
                        <span className="text-sm font-medium text-zinc-900">{v.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(v.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    {v.version !== article?.version && (
                      <button
                        onClick={() => handleRollback(v.version)}
                        disabled={rollingBack}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        回滚
                      </button>
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
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">AI 生成初稿</h3>
              </div>
              <button onClick={() => setShowDraftPreview(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto space-y-4 pr-2">
              <div>
                <label className="text-xs font-medium text-zinc-500">标题</label>
                <p className="text-base font-semibold text-zinc-900">{draftResult.title}</p>
              </div>
              {draftResult.subtitle && (
                <div>
                  <label className="text-xs font-medium text-zinc-500">副标题</label>
                  <p className="text-base text-zinc-700">{draftResult.subtitle}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-500">正文</label>
                <DraftPreview content={draftResult.content} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-zinc-100">
              <button
                onClick={() => setShowDraftPreview(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={() => applyDraft('insert')}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-4 w-4" />
                插入到末尾
              </button>
              <button
                onClick={() => applyDraft('replace')}
                className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <Check className="h-4 w-4" />
                替换当前内容
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={editorContainerRef} className="flex-1 overflow-hidden bg-white relative flex flex-col">
          <div className="mx-auto max-w-3xl w-full px-8 pt-8">
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="mb-4 w-full bg-transparent text-lg text-zinc-600 outline-none"
              placeholder="副标题（可选）"
            />
            {/* Cover Image */}
            {article?.coverImage ? (
              <div
                className="mb-4 rounded-lg border border-zinc-200 overflow-hidden max-h-[300px] cursor-pointer"
                onClick={() => setShowImagePreview(true)}
              >
                <img
                  src={article.coverImage}
                  alt="封面图"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowImageGen(true)}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 py-6 text-sm text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                <Image className="h-4 w-4" />
                暂无封面图，点击 AI 生成配图
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 mx-auto max-w-3xl w-full px-8 pb-8">
            <RichTextEditor
              key={articleId}
              ref={editorRef}
              content={content || ''}
              onChange={setContent}
              placeholder="开始写作..."
            />
          </div>

          {/* AI Floating Menu */}
          {showAIMenu && selectedText && (
            <>
              {!showAIResult ? (
                <div
                  className="absolute z-40 flex items-center gap-1 rounded-lg bg-zinc-900 px-2 py-1.5 shadow-lg"
                  style={{
                    left: Math.min(selectionPos.x, window.innerWidth - 300),
                    top: Math.max(selectionPos.y - 45, 10),
                  }}
                >
                  <AIOperationButton
                    icon={<PenTool className="h-3.5 w-3.5" />}
                    label="改写"
                    onClick={() => handleAIOperation('rewrite', 'serious')}
                  />
                  <div className="h-4 w-px bg-zinc-700" />
                  <AIOperationButton
                    icon={<Plus className="h-3.5 w-3.5" />}
                    label="扩写"
                    onClick={() => handleAIOperation('expand')}
                  />
                  <div className="h-4 w-px bg-zinc-700" />
                  <AIOperationButton
                    icon={<Scissors className="h-3.5 w-3.5" />}
                    label="精简"
                    onClick={() => handleAIOperation('condense')}
                  />
                  <div className="h-4 w-px bg-zinc-700" />
                  <AIOperationButton
                    icon={<Wand2 className="h-3.5 w-3.5" />}
                    label="润色"
                    onClick={() => handleAIOperation('polish')}
                  />
                </div>
              ) : (
                <div
                  className="absolute z-40 w-80 rounded-lg bg-white border border-zinc-200 shadow-xl overflow-hidden"
                  style={{
                    left: Math.min(selectionPos.x - 160, window.innerWidth - 340),
                    top: Math.max(selectionPos.y - 20, 10),
                  }}
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                    <span className="text-xs font-medium text-zinc-600">AI 处理结果</span>
                    <button onClick={() => setShowAIMenu(false)} className="text-zinc-400 hover:text-zinc-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto p-3">
                    {aiLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{aiResult}</p>
                    )}
                  </div>
                  {!aiLoading && (
                    <div className="flex gap-2 border-t border-zinc-100 p-2">
                      <button
                        onClick={() => applyAIResult('replace')}
                        className="flex-1 flex items-center justify-center gap-1 rounded-md bg-zinc-900 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        <Check className="h-3 w-3" />
                        替换
                      </button>
                      <button
                        onClick={() => applyAIResult('insert')}
                        className="flex-1 flex items-center justify-center gap-1 rounded-md border border-zinc-200 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <Plus className="h-3 w-3" />
                        插入
                      </button>
                      <button
                        onClick={() => setShowAIMenu(false)}
                        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        取消
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="w-80 border-l border-zinc-200 bg-zinc-50 p-4 overflow-auto flex flex-col">
          <div className="space-y-6 flex-1">
            {/* Excerpt */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-900">摘要</h3>
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
                  AI 生成
                </button>
              </div>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="输入稿件摘要..."
              />
            </div>

            {/* Story */}
            <div>
              <h3 className="text-sm font-medium text-zinc-900">所属选题</h3>
              {article.story ? (
                <Link
                  href={`/dashboard/stories/${article.storyId}`}
                  className="mt-2 block rounded-lg border border-zinc-200 bg-white p-3 text-sm hover:shadow-sm transition-shadow"
                >
                  <p className="font-medium text-zinc-900">{article.story.title}</p>
                </Link>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">无关联选题</p>
              )}
            </div>

            {/* Quick Actions */}
            <div>
              <h3 className="text-sm font-medium text-zinc-900">快速操作</h3>
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
                  AI 生成初稿
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
                  AI 事实核查
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
                  AI 预审报告
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
                  AI SEO优化
                </button>
                <button
                  onClick={() => setShowImageGen(true)}
                  disabled={imageGenLoading}
                  className="flex w-full items-center gap-2 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 disabled:opacity-50"
                >
                  {imageGenLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Image className="h-4 w-4" />
                  )}
                  AI 生成配图
                </button>
                <button
                  onClick={() => handleSave('DRAFT')}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  退回草稿
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
          </div>

          {/* Platform Distribution */}
          <ChannelPanel articleId={articleId} />

          {/* AI Chat Toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100"
          >
            <MessageSquare className="h-4 w-4" />
            {showChat ? '收起 AI 助手' : '打开 AI 助手'}
          </button>

          {/* AI Chat Panel */}
          {showChat && (
            <div className="mt-4 flex flex-col rounded-lg border border-zinc-200 bg-white overflow-hidden" style={{ height: '320px' }}>
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                <span className="text-xs font-medium text-zinc-700">AI 创作助手</span>
                <button onClick={() => setShowChat(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-xs text-zinc-400 mb-3">向 AI 助手提问，获取写作建议</p>
                    <div className="space-y-1.5">
                      {quickChatPrompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setChatInput(prompt);
                          }}
                          className="block w-full rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-100"
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
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg bg-zinc-100 px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex items-center gap-2 border-t border-zinc-100 p-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="输入问题..."
                  className="flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                />
                <button
                  onClick={handleSendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="rounded-md bg-zinc-900 p-1.5 text-white hover:bg-zinc-800 disabled:opacity-50"
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
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">AI 生成配图</h3>
              <button
                onClick={() => {
                  setShowImageGen(false);
                  setImageGenResult(null);
                }}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!imageGenResult ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">风格</label>
                    <div className="flex gap-2">
                      {[
                        { key: 'news', label: '新闻摄影' },
                        { key: 'illustration', label: '插画' },
                        { key: 'photo', label: '写实照片' },
                        { key: 'social', label: '社媒海报' },
                      ].map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setImageGenStyle(s.key as any)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            imageGenStyle === s.key
                              ? 'bg-zinc-900 text-white'
                              : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">比例</label>
                    <select
                      value={imageGenRatio}
                      onChange={(e) => setImageGenRatio(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 p-2.5 text-sm outline-none focus:border-zinc-400"
                    >
                      <option value="16:9">16:9 (文章横幅)</option>
                      <option value="4:3">4:3 (标准)</option>
                      <option value="1:1">1:1 (社媒方形)</option>
                      <option value="3:4">3:4 (小红书)</option>
                      <option value="9:16">9:16 (Stories)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">分辨率</label>
                    <select
                      value={imageGenSize}
                      onChange={(e) => setImageGenSize(e.target.value as '2K' | '3K' | '4K')}
                      className="w-full rounded-lg border border-zinc-200 p-2.5 text-sm outline-none focus:border-zinc-400"
                    >
                      <option value="2K">2K（快速）</option>
                      <option value="3K">3K（高清）</option>
                      <option value="4K">4K（超清）</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">额外描述（可选）</label>
                    <textarea
                      value={imageGenCustomPrompt}
                      onChange={(e) => setImageGenCustomPrompt(e.target.value)}
                      placeholder="例如：加入香港天际线背景，黄昏时分..."
                      rows={2}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setShowImageGen(false)}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleGenerateImage}
                    disabled={imageGenLoading}
                    className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {imageGenLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Image className="h-4 w-4" />
                    )}
                    {imageGenLoading ? '生成中...' : '生成配图'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                  <img
                    src={imageGenResult.url}
                    alt="AI 生成配图"
                    className="w-full rounded-lg"
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500 line-clamp-2">
                  Prompt: {imageGenResult.prompt}
                </p>
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    onClick={() => setImageGenResult(null)}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    重新生成
                  </button>
                  <button
                    onClick={() => {
                      setShowImageGen(false);
                      setImageGenResult(null);
                    }}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    完成
                  </button>
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
            <img
              src={article.coverImage}
              alt="封面图预览"
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
      className="prose prose-zinc max-w-none mt-1 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
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
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
