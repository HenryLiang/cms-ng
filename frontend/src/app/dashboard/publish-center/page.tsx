'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  archiveArticle,
  getArticleStatusHistory,
  getArticles,
  publishArticle,
  republishArticle,
  type Article,
  type ArticleStatusAudit,
  type PaginatedMeta,
} from '@/lib/article-api';
import { reportApiError } from '@/lib/api-error-toast';
import { useToastStore } from '@/store/toast-store';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Send,
  X,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, Button } from '@/components/ui';

const PAGE_SIZE = 10;

type PublicationTab = 'ready' | 'live' | 'archived';

const TAB_STATUS: Record<PublicationTab, string> = {
  ready: 'APPROVED',
  live: 'PUBLISHED,AUTO_PUBLISHED',
  archived: 'ARCHIVED',
};

/**
 * 发布中心：统一管理待发布、已上线和已下架稿件，并展示发布状态审计记录。
 */
export default function PublishCenterPage() {
  const t = useTranslations('publishCenter');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const showToast = useToastStore((s) => s.show);

  const [tab, setTab] = useState<PublicationTab>('ready');
  const [articles, setArticles] = useState<Article[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    mode: 'archive' | 'republish';
    article: Article;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [historyArticle, setHistoryArticle] = useState<Article | null>(null);
  const [statusHistory, setStatusHistory] = useState<ArticleStatusAudit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
        status: TAB_STATUS[tab],
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
  }, [tab]);

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
    setActionId(article.id);
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
      setActionId(null);
    }
  };

  const openTransitionDialog = (
    mode: 'archive' | 'republish',
    article: Article,
  ) => {
    setReason('');
    setDialog({ mode, article });
  };

  const handleTransition = async () => {
    if (!dialog) return;
    const trimmedReason = reason.trim();
    if (dialog.mode === 'archive' && trimmedReason.length < 2) return;

    setActionId(dialog.article.id);
    try {
      if (dialog.mode === 'archive') {
        await archiveArticle(dialog.article.id, trimmedReason);
        showToast({ message: t('toast.archived'), type: 'success' });
      } else {
        await republishArticle(dialog.article.id, trimmedReason || undefined);
        showToast({ message: t('toast.republished'), type: 'success' });
      }
      setDialog(null);
      void loadPage(pageRef.current);
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      showToast({
        message:
          err?.response?.data?.message ||
          (dialog.mode === 'archive'
            ? t('toast.archiveFailed')
            : t('toast.republishFailed')),
        type: 'error',
      });
    } finally {
      setActionId(null);
    }
  };

  const handleShowHistory = async (article: Article) => {
    setHistoryArticle(article);
    setHistoryLoading(true);
    try {
      setStatusHistory(await getArticleStatusHistory(article.id));
    } catch {
      showToast({ message: t('toast.historyFailed'), type: 'error' });
      setHistoryArticle(null);
    } finally {
      setHistoryLoading(false);
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

      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-surface-muted p-1">
        {(['ready', 'live', 'archived'] as PublicationTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === item
                ? 'bg-surface text-default shadow-sm'
                : 'text-muted hover:text-default'
            }`}
            onClick={() => {
              setTab(item);
              setPage(1);
            }}
          >
            {t(`tabs.${item}`)}
          </button>
        ))}
      </div>

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
            <p className="text-sm font-medium">{t(`list.empty.${tab}`)}</p>
            <p className="mt-1 text-xs text-muted">
              {t(`list.emptyHint.${tab}`)}
            </p>
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
                  <th className="w-[14%] px-5 py-2.5 text-right">
                    {t('list.columns.actions')}
                  </th>
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
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {tab === 'ready' && (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={actionId === article.id}
                            disabled={actionId !== null}
                            onClick={() => void handlePublish(article)}
                          >
                            {actionId === article.id
                              ? t('actions.publishing')
                              : t('actions.publish')}
                          </Button>
                        )}
                        {tab === 'live' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actionId !== null}
                            onClick={() => openTransitionDialog('archive', article)}
                          >
                            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('actions.archive')}
                          </Button>
                        )}
                        {tab === 'archived' && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={actionId !== null}
                            onClick={() => openTransitionDialog('republish', article)}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('actions.republish')}
                          </Button>
                        )}
                        {tab !== 'ready' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={historyLoading}
                            aria-label={t('actions.history')}
                            onClick={() => void handleShowHistory(article)}
                          >
                            <History className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
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
                  disabled={page <= 1 || loading || actionId !== null}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {tCommon('pagination.prev')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= (meta.totalPages ?? 1) || loading || actionId !== null}
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

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publication-dialog-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="publication-dialog-title" className="text-base font-semibold">
                  {t(`dialogs.${dialog.mode}.title`)}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t(`dialogs.${dialog.mode}.description`, {
                    title: dialog.article.title,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tCommon('actions.close')}
                onClick={() => setDialog(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <label className="mt-5 block text-sm font-medium" htmlFor="publication-reason">
              {t(`dialogs.${dialog.mode}.reasonLabel`)}
            </label>
            <textarea
              id="publication-reason"
              className="mt-2 min-h-24 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={reason}
              maxLength={500}
              placeholder={t(`dialogs.${dialog.mode}.reasonPlaceholder`)}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button
                variant={dialog.mode === 'archive' ? 'danger' : 'primary'}
                loading={actionId === dialog.article.id}
                disabled={
                  actionId !== null ||
                  (dialog.mode === 'archive' && reason.trim().length < 2)
                }
                onClick={() => void handleTransition()}
              >
                {t(`dialogs.${dialog.mode}.confirm`)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {historyArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            className="w-full max-w-xl rounded-xl border border-line bg-surface p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-dialog-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="history-dialog-title" className="text-base font-semibold">
                  {t('history.title')}
                </h2>
                <p className="mt-1 truncate text-sm text-muted">{historyArticle.title}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tCommon('actions.close')}
                onClick={() => setHistoryArticle(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-5 max-h-96 space-y-3 overflow-y-auto">
              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                </div>
              ) : statusHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  {t('history.empty')}
                </p>
              ) : (
                statusHistory.map((item) => (
                  <div key={item.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.fromStatus} />
                        <ChevronRight className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                        <StatusBadge status={item.toStatus} />
                      </div>
                      <time className="text-xs text-subtle">
                        {new Date(item.createdAt).toLocaleString(locale)}
                      </time>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {item.operator?.name ?? t('history.system')}
                      {' · '}
                      {item.reason || t('history.noReason')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
