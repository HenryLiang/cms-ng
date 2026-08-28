'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  getArticles,
  publishArticle,
  type Article,
  type PaginatedMeta,
} from '@/lib/article-api';
import { reportApiError } from '@/lib/api-error-toast';
import { useToastStore } from '@/store/toast-store';
import { FileText, Send, ChevronRight, ChevronLeft } from 'lucide-react';
import { PageHeader, Card, StatusBadge, Button } from '@/components/ui';

const PAGE_SIZE = 10;

/**
 * 发布中心：列出已审核通过(APPROVED)的待发布稿件，分页展示，
 * 单篇可一键发布（APPROVED → PUBLISHED），发布后 newsweb 读者站即时可见。
 */
export default function PublishCenterPage() {
  const t = useTranslations('publishCenter');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const showToast = useToastStore((s) => s.show);

  const [articles, setArticles] = useState<Article[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // 请求序号：快速翻页时丢弃乱序返回的过期响应，避免渲染与 page 状态不符的数据。
  const loadSeqRef = useRef(0);
  // 最新 page 引用：异步回调用 ref 而非闭包，避免发布成功后读到点击时的过期页码。
  // 渲染期直接写 ref 违反 react-hooks/refs 规则，改用 effect 同步最新已提交页码。
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const loadPage = useCallback(async (targetPage: number) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const { data, meta } = await getArticles({
        status: 'APPROVED',
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      if (seq !== loadSeqRef.current) return; // 已有更新的请求发出，丢弃过期响应
      if (data.length === 0 && targetPage > 1) {
        // 发布末页最后一条后本页变空：保持 loading，回退一页由 effect 重新拉取，
        // 避免空态闪烁，也不额外触发第二次手动请求。
        setPage(targetPage - 1);
        return;
      }
      setArticles(data);
      setMeta(meta);
      setLoadFailed(false);
      setLoading(false);
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      reportApiError(error);
      setLoadFailed(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch initial page on mount
    void loadPage(page);
  }, [loadPage, page]);

  const handlePublish = async (article: Article) => {
    if (
      !window.confirm(t('actions.publishConfirm', { title: article.title }))
    ) {
      return;
    }
    setPublishingId(article.id);
    try {
      await publishArticle(article.id);
      showToast({ message: t('toast.published', { title: article.title }), type: 'success' });
      // 用最新页码刷新当前页（发布期间仍可翻页，避免回退到点击时的过期页）。
      void loadPage(pageRef.current);
    } catch (error) {
      const err = error as {
        response?: { status?: number; data?: { message?: string } };
      };
      // 401 由 api.ts 拦截器跳转登录页，此处不提示；其余失败展示发布失败提示，
      // 后端返回了具体原因时优先展示该原因。
      if (err?.response?.status === 401) return;
      showToast({
        message: err?.response?.data?.message || t('toast.publishFailed'),
        type: 'error',
      });
    } finally {
      setPublishingId(null);
    }
  };

  const handleRetry = () => {
    setLoadFailed(false);
    void loadPage(pageRef.current);
  };

  if (loading && !meta) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <Card>
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
              <FileText className="h-5 w-5 text-subtle" />
            </div>
            <p className="text-sm font-medium">{t('list.loadError')}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={handleRetry}
            >
              {tCommon('actions.retry')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card>
        {loading ? (
          <div className="flex items-center justify-center px-5 py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
              <Send className="h-5 w-5 text-subtle" />
            </div>
            <p className="text-sm font-medium">{t('list.empty')}</p>
            <p className="mt-1 text-xs text-muted">{t('list.emptyHint')}</p>
            <Link
              href="/dashboard/articles"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              {t('list.goToArticles')} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          // table-fixed 固定列宽，保证超长标题/标签被截断而非撑破布局
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                  <th className="w-[36%] px-5 py-2.5 font-medium">{t('list.columns.title')}</th>
                  <th className="w-[15%] px-5 py-2.5 font-medium">{t('list.columns.story')}</th>
                  <th className="w-[11%] px-5 py-2.5 font-medium">{t('list.columns.author')}</th>
                  <th className="w-[18%] px-5 py-2.5 font-medium">{t('list.columns.tags')}</th>
                  <th className="w-[11%] px-5 py-2.5 font-medium">{t('list.columns.updatedAt')}</th>
                  <th className="w-[9%] px-5 py-2.5 text-right">{t('actions.publish')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {articles.map((article) => (
                  <tr key={article.id} className="transition hover:bg-surface-muted/50">
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dashboard/articles/${article.id}`}
                            className="block line-clamp-2 font-medium hover:text-brand"
                            title={article.title}
                          >
                            {article.title}
                          </Link>
                          <div className="mt-0.5">
                            <StatusBadge status={article.status} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <div className="truncate">{article.story?.title ?? '-'}</div>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <div className="truncate">{article.author?.name ?? '-'}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(article.tags ?? []).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 tnum text-xs text-subtle">
                      {new Date(article.updatedAt).toLocaleDateString(locale)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={publishingId === article.id}
                        disabled={publishingId !== null}
                        onClick={() => void handlePublish(article)}
                      >
                        {publishingId === article.id ? t('actions.publishing') : t('actions.publish')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && articles.length > 0 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <span className="text-xs text-muted tnum">
              {t('list.summary', {
                total: meta.total,
                page: meta.page,
                totalPages: Math.max(meta.totalPages, 1),
              })}
            </span>
            {meta.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || loading || publishingId !== null}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {tCommon('pagination.prev')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= (meta.totalPages ?? 1) || loading || publishingId !== null}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                >
                  {tCommon('pagination.next')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
