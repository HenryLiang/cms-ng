'use client';

import { useState, useEffect } from 'react';
import { getReviewQueue, submitReview } from '@/lib/review-api';
import { getArticle } from '@/lib/article-api';
import { Loader2, CheckCircle, XCircle, FileText, User, Clock, Send } from 'lucide-react';
import type { Article } from '@/lib/article-api';

interface ReviewArticle extends Article {
  reviewComment?: string;
}

export default function ReviewPage() {
  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<ReviewArticle | null>(null);
  const [articleDetail, setArticleDetail] = useState<Article | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    setLoading(true);
    try {
      const data = await getReviewQueue();
      setArticles(data);
      if (data.length > 0 && !selectedArticle) {
        handleSelect(data[0]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(article: ReviewArticle) {
    setSelectedArticle(article);
    setComment('');
    setDetailLoading(true);
    try {
      const detail = await getArticle(article.id);
      setArticleDetail(detail);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDecision(decision: 'APPROVE' | 'REVISION') {
    if (!selectedArticle) return;
    if (decision === 'REVISION' && !comment.trim()) {
      alert('退回修改需要填写审核意见');
      return;
    }
    setSubmitting(true);
    try {
      await submitReview(selectedArticle.id, decision, comment.trim() || undefined);
      await loadQueue();
      setSelectedArticle(null);
      setArticleDetail(null);
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabels: Record<string, string> = {
    PENDING_REVIEW: '待审核',
    IN_REVIEW: '审核中',
    REVISION: '退回修改',
    APPROVED: '已通过',
  };

  const statusColors: Record<string, string> = {
    PENDING_REVIEW: 'bg-amber-50 text-amber-700',
    IN_REVIEW: 'bg-blue-50 text-blue-700',
    REVISION: 'bg-red-50 text-red-700',
    APPROVED: 'bg-emerald-50 text-emerald-700',
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar - article list */}
      <div className="w-80 border-r border-zinc-200 bg-white overflow-y-auto">
        <div className="border-b border-zinc-200 p-4">
          <h1 className="text-lg font-semibold">审核台</h1>
          <p className="mt-1 text-sm text-zinc-500">
            待审核稿件 {articles.length} 篇
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {articles.map((article) => (
            <button
              key={article.id}
              onClick={() => handleSelect(article)}
              className={`w-full text-left p-4 transition-colors ${
                selectedArticle?.id === article.id
                  ? 'bg-zinc-50'
                  : 'hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-400" />
                <span className="flex-1 truncate text-sm font-medium text-zinc-900">
                  {article.title}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {article.author?.name || '未知作者'}
                </span>
                <span className={`rounded px-1.5 py-0.5 ${statusColors[article.status] || 'bg-zinc-100 text-zinc-700'}`}>
                  {statusLabels[article.status] || article.status}
                </span>
              </div>
              {article.story && (
                <p className="mt-1 text-xs text-zinc-400">
                  选题：{article.story.title}
                </p>
              )}
            </button>
          ))}
          {articles.length === 0 && (
            <div className="p-8 text-center text-sm text-zinc-500">
              暂无待审核稿件
            </div>
          )}
        </div>
      </div>

      {/* Right panel - article detail */}
      <div className="flex-1 overflow-y-auto bg-zinc-50 p-8">
        {!selectedArticle && (
          <div className="flex h-full items-center justify-center text-zinc-400">
            请选择左侧稿件进行审核
          </div>
        )}

        {selectedArticle && detailLoading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        )}

        {selectedArticle && articleDetail && !detailLoading && (
          <div className="mx-auto max-w-3xl">
            {/* Header */}
            <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900">
                    {articleDetail.title}
                  </h2>
                  {articleDetail.subtitle && (
                    <p className="mt-1 text-sm text-zinc-600">{articleDetail.subtitle}</p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusColors[articleDetail.status] || ''}`}>
                  {statusLabels[articleDetail.status] || articleDetail.status}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-6 text-sm text-zinc-500">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  作者：{articleDetail.author?.name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  版本：v{articleDetail.version}
                </span>
                {articleDetail.story && (
                  <span>选题：{articleDetail.story.title}</span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-medium text-zinc-500">正文内容</h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                {articleDetail.content}
              </div>
            </div>

            {/* Excerpt */}
            {articleDetail.excerpt && (
              <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6">
                <h3 className="mb-2 text-sm font-medium text-zinc-500">摘要</h3>
                <p className="text-sm text-zinc-700">{articleDetail.excerpt}</p>
              </div>
            )}

            {/* AI Pre-review placeholder */}
            <div className="mb-6 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6">
              <h3 className="mb-2 text-sm font-medium text-zinc-500">AI 预审报告</h3>
              <p className="text-sm text-zinc-400">
                AI 预审功能开发中，将自动检测事实性错误、法律风险和优化建议。
              </p>
            </div>

            {/* Review actions */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <h3 className="mb-4 text-sm font-medium text-zinc-900">审核意见</h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="填写审核意见（退回修改时必须填写）..."
                className="w-full rounded-lg border border-zinc-200 p-3 text-sm focus:border-zinc-400 focus:outline-none"
                rows={4}
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => handleDecision('APPROVE')}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  审核通过
                </button>
                <button
                  onClick={() => handleDecision('REVISION')}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  退回修改
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
