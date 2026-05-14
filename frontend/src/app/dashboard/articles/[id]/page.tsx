'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getArticle,
  updateArticle,
  deleteArticle,
  aiRewrite,
  aiExpand,
  aiCondense,
  aiPolish,
  aiHeadlines,
  aiExcerpt,
  aiChat,
  type Article,
  type HeadlineOption,
  type ChatMessage,
} from '@/lib/article-api';
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
  Plus,
  Type,
  Scissors,
  AlignLeft,
  PenTool,
  ChevronRight,
  SendHorizonal,
} from 'lucide-react';

export default function ArticleEditorPage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');

  // AI Quick Mode state
  const [selectedText, setSelectedText] = useState('');
  const selectedTextRef = useRef('');
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [showAIResult, setShowAIResult] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Headline Lab state
  const [showHeadlines, setShowHeadlines] = useState(false);
  const [headlines, setHeadlines] = useState<HeadlineOption[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);

  // AI Excerpt state
  const [excerptLoading, setExcerptLoading] = useState(false);

  // AI Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      });
      await loadArticle();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('确定要删除这篇稿件吗？此操作不可恢复。')) return;
    await deleteArticle(articleId);
    router.push('/dashboard/articles');
  }

  // ===== Text Selection Detection =====
  const handleTextSelection = useCallback(() => {
    const textarea = contentRef.current;
    if (!textarea) return;

    // For textarea, use selectionStart/End instead of window.getSelection()
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.substring(start, end).trim();

    if (text.length > 0) {
      // Position menu near the textarea center (exact position in textarea is hard,
      // so we use a reasonable position based on the textarea bounds)
      const rect = textarea.getBoundingClientRect();
      setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top + 40 });
      setSelectedText(text);
      setShowAIMenu(true);
      // Only reset result panel if this is a new/different selection
      if (text !== selectedTextRef.current) {
        setShowAIResult(false);
      }
      selectedTextRef.current = text;
    } else if (!showAIResult && !aiLoading) {
      // Only hide if we're not showing a result panel or loading
      // (prevents mouseup on AI buttons from closing the menu)
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
          result = await aiRewrite(articleId, text, style as any);
          break;
        case 'expand':
          result = await aiExpand(articleId, text);
          break;
        case 'condense':
          result = await aiCondense(articleId, text);
          break;
        case 'polish':
          result = await aiPolish(articleId, text);
          break;
      }
      setAiResult(result);
    } finally {
      setAiLoading(false);
    }
  }

  function applyAIResult(mode: 'replace' | 'insert') {
    if (!aiResult) return;
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.slice(0, start);
    const after = content.slice(end);

    if (mode === 'replace') {
      setContent(before + aiResult + after);
      // Restore focus and set cursor position
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + aiResult.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    } else {
      setContent(before + '\n\n' + aiResult + '\n\n' + after);
      requestAnimationFrame(() => {
        textarea.focus();
      });
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
      const result = await aiHeadlines(articleId, 5);
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
      const result = await aiExcerpt(articleId, 200);
      setExcerpt(result);
    } finally {
      setExcerptLoading(false);
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
      ]);
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

  const wordCount = content.trim().length;

  return (
    <div className="flex h-full flex-col">
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
            </div>
            <p className="text-xs text-zinc-500">
              版本 {article.version} · {wordCount} 字 · 最后保存{' '}
              {new Date(article.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
          <button
            onClick={() => handleSave('PENDING_REVIEW')}
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

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto bg-white relative">
          <div className="mx-auto max-w-3xl p-8">
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="mb-4 w-full bg-transparent text-lg text-zinc-600 outline-none"
              placeholder="副标题（可选）"
            />
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[60vh] w-full resize-none bg-transparent text-base leading-relaxed text-zinc-800 outline-none"
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
                  onClick={() => handleSave('DRAFT')}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  退回草稿
                </button>
              </div>
            </div>
          </div>

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
    </div>
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
