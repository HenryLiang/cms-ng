'use client';

import { useState, useEffect } from 'react';
import { getReviewQueue, submitReview } from '@/lib/review-api';
import { getArticle } from '@/lib/article-api';
import { CheckCircle, XCircle, FileText, User, Clock } from 'lucide-react';
import type { Article } from '@/lib/article-api';
import { Button, Card, StatusBadge } from '@/components/ui';

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount:loadQueue 内 setLoading(true) 同步触发,React 19 规则对此过严
    loadQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, []);

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 左：稿件列表 */}
      <div className="w-80 shrink-0 overflow-y-auto border-r border-line bg-surface">
        <div className="border-b border-line p-4">
          <h1 className="text-base font-semibold">审核台</h1>
          <p className="mt-0.5 text-sm text-muted">
            待审核稿件 <span className="tnum">{articles.length}</span> 篇
          </p>
        </div>
        <div className="divide-y divide-line">
          {articles.map((article) => {
            const isSelected = selectedArticle?.id === article.id;
            return (
              <button
                key={article.id}
                onClick={() => handleSelect(article)}
                className={`relative w-full p-4 text-left transition-colors ${
                  isSelected ? 'bg-surface-muted' : 'hover:bg-surface-muted/60'
                }`}
              >
                {isSelected && (
                  <span className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
                )}
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-subtle" />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {article.title}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {article.author?.name || '未知作者'}
                  </span>
                  <StatusBadge status={article.status} />
                </div>
                {article.story && (
                  <p className="mt-1 truncate text-xs text-subtle">选题：{article.story.title}</p>
                )}
              </button>
            );
          })}
          {articles.length === 0 && (
            <div className="p-8 text-center text-sm text-muted">暂无待审核稿件</div>
          )}
        </div>
      </div>

      {/* 右：稿件详情 */}
      <div className="flex-1 overflow-y-auto bg-canvas p-6">
        {!selectedArticle && (
          <div className="flex h-full items-center justify-center text-sm text-subtle">
            请选择左侧稿件进行审核
          </div>
        )}

        {selectedArticle && detailLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          </div>
        )}

        {selectedArticle && articleDetail && !detailLoading && (
          <div className="mx-auto max-w-3xl space-y-5">
            {/* 头部 */}
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {articleDetail.title}
                  </h2>
                  {articleDetail.subtitle && (
                    <p className="mt-1 text-sm text-muted">{articleDetail.subtitle}</p>
                  )}
                </div>
                <StatusBadge status={articleDetail.status} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  作者：{articleDetail.author?.name ?? '-'}
                </span>
                <span className="flex items-center gap-1 tnum">
                  <Clock className="h-4 w-4" />v{articleDetail.version}
                </span>
                {articleDetail.story && <span>选题：{articleDetail.story.title}</span>}
              </div>
            </Card>

            {/* 正文 */}
            <Card className="p-6">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-subtle">
                正文内容
              </h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {articleDetail.content}
              </div>
            </Card>

            {/* 摘要 */}
            {articleDetail.excerpt && (
              <Card className="p-6">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">
                  摘要
                </h3>
                <p className="text-sm text-muted">{articleDetail.excerpt}</p>
              </Card>
            )}

            {/* AI 预审占位 */}
            <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted p-6">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">
                AI 预审报告
              </h3>
              <p className="text-sm text-subtle">
                AI 预审功能开发中，将自动检测事实性错误、法律风险和优化建议。
              </p>
            </div>

            {/* 审核操作 */}
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-semibold">审核意见</h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="填写审核意见（退回修改时必须填写）…"
                className="w-full rounded-lg border border-line bg-surface p-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                rows={4}
              />
              <div className="mt-4 flex gap-3">
                <Button
                  variant="success"
                  onClick={() => handleDecision('APPROVE')}
                  loading={submitting}
                >
                  <CheckCircle className="h-4 w-4" />
                  审核通过
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDecision('REVISION')}
                  loading={submitting}
                >
                  <XCircle className="h-4 w-4" />
                  退回修改
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
