'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getArticles, type Article, type PaginatedMeta } from '@/lib/article-api';
import { FileText, ChevronRight } from 'lucide-react';
import LanguageBadge from '@/components/language-badge';
import { PageHeader, Card, StatusBadge } from '@/components/ui';

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArticles();
  }, []);

  async function loadArticles() {
    try {
      const { data, meta } = await getArticles();
      setArticles(data);
      setMeta(meta);
    } finally {
      setLoading(false);
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
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="稿件管理" subtitle="管理你创建的所有稿件" />

      <Card>
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
              <FileText className="h-5 w-5 text-subtle" />
            </div>
            <p className="text-sm font-medium">还没有稿件</p>
            <p className="mt-1 text-xs text-muted">从选题开始，创建你的第一篇稿件</p>
            <Link
              href="/dashboard/stories"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              前往选题中心 <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                  <th className="px-5 py-2.5 font-medium">标题</th>
                  <th className="px-5 py-2.5 font-medium">所属选题</th>
                  <th className="px-5 py-2.5 font-medium">状态</th>
                  <th className="px-5 py-2.5 font-medium">语言</th>
                  <th className="px-5 py-2.5 font-medium">更新时间</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {articles.map((article) => (
                  <tr key={article.id} className="transition hover:bg-surface-muted/50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/articles/${article.id}`}
                        className="flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-subtle" />
                        <span className="font-medium hover:text-brand">{article.title}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {article.story?.title ?? '-'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={article.status} />
                    </td>
                    <td className="px-5 py-3">
                      <LanguageBadge language={article.contentLanguage} />
                    </td>
                    <td className="px-5 py-3 tnum text-xs text-subtle">
                      {new Date(article.updatedAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/dashboard/articles/${article.id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-subtle transition hover:bg-surface-muted hover:text-foreground"
                        title="编辑"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && articles.length > 0 && (
          <div className="border-t border-line px-5 py-3 text-xs text-muted tnum">
            共 {meta.total} 篇 · 第 {meta.page} / {Math.max(meta.totalPages, 1)} 页
          </div>
        )}
      </Card>
    </div>
  );
}
