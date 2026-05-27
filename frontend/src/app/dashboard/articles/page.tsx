'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getArticles, type Article } from '@/lib/article-api';
import { FileText, ArrowRight, Loader2 } from 'lucide-react';
import LanguageBadge from '@/components/language-badge';

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArticles();
  }, []);

  async function loadArticles() {
    try {
      const data = await getArticles();
      setArticles(data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

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

  return (
    <div className="h-full p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">我的稿件</h1>
        <p className="mt-1 text-sm text-zinc-500">管理你创建的所有稿件</p>
      </div>

      <div className="space-y-3">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/dashboard/articles/${article.id}`}
            className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <FileText className="h-5 w-5 text-zinc-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-900 truncate">
                  {article.title}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    article.status === 'PUBLISHED'
                      ? 'bg-emerald-50 text-emerald-700'
                      : article.status === 'PENDING_REVIEW'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {statusLabels[article.status] || article.status}
                </span>
                <LanguageBadge language={article.contentLanguage} />
              </div>
              {article.story && (
                <p className="mt-1 text-xs text-zinc-500">
                  所属选题：{article.story.title}
                </p>
              )}
            </div>
            <span className="text-xs text-zinc-400 shrink-0">
              {new Date(article.updatedAt).toLocaleDateString('zh-CN')}
            </span>
            <ArrowRight className="h-4 w-4 text-zinc-400 shrink-0" />
          </Link>
        ))}
        {articles.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-500">还没有稿件</p>
            <Link
              href="/dashboard"
              className="mt-2 inline-block text-sm font-medium text-zinc-900 hover:underline"
            >
              去工作台创建 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
