'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TopicSourceDefinition } from '@cms-ng/shared';
import { useTranslations } from 'next-intl';
import { getTopicSources, getTopicSourceItems } from '@/lib/topic-api';
import { Button, PageHeader } from '@/components/ui';
import { HotBoardCard, type HotBoardState } from '@/components/hot-topics/hot-board-card';

type HotTab = 'hottest' | 'realtime';

/** 单卡条目数上限(与后端 MAX_ITEMS_PER_SOURCE 一致)。 */
const BOARD_LIMIT = 30;

/**
 * 实时热点:newsnow 源的卡片墙(交互参照 newsnow 首页,样式按 CMS 体系)。
 * - 「最热」= listType=hottest 的榜单源;「实时」= listType=realtime 的快讯源
 * - 卡片滚入视口才发起请求;已加载的卡片切标签后保留状态
 * - 报错 toast 由 axios 拦截器全局处理,这里只落本地状态
 */
export default function HotTopicsPage() {
  const t = useTranslations('hotTopics');
  const TABS: { key: HotTab; label: string }[] = useMemo(
    () => [
      { key: 'hottest', label: t('tabs.hottest') },
      { key: 'realtime', label: t('tabs.realtime') },
    ],
    [t],
  );
  const [sources, setSources] = useState<TopicSourceDefinition[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [tab, setTab] = useState<HotTab>('hottest');
  const [boards, setBoards] = useState<Record<string, HotBoardState>>({});
  // 60s 心跳驱动相对时间重渲染(newsnow timerAtom 对应物)
  const [, setNow] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const fetchBoard = useCallback(async (sourceId: string) => {
    setBoards((prev) => ({
      ...prev,
      [sourceId]: {
        items: prev[sourceId]?.items ?? [],
        status: prev[sourceId]?.status ?? 'available',
        warnings: prev[sourceId]?.warnings ?? [],
        fetchedAt: prev[sourceId]?.fetchedAt,
        loading: true,
        loaded: true,
      },
    }));
    try {
      const page = await getTopicSourceItems(sourceId, { limit: BOARD_LIMIT });
      setBoards((prev) => ({
        ...prev,
        [sourceId]: {
          items: page.items,
          status: page.status ?? 'available',
          warnings: page.warnings ?? [],
          fetchedAt: page.fetchedAt,
          loading: false,
          loaded: true,
        },
      }));
    } catch {
      setBoards((prev) => ({
        ...prev,
        [sourceId]: {
          items: prev[sourceId]?.items ?? [],
          status: 'unavailable',
          warnings: [t('card.unavailableRetry')],
          fetchedAt: prev[sourceId]?.fetchedAt,
          loading: false,
          loaded: true,
        },
      }));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    getTopicSources()
      .then((definitions) => {
        if (cancelled) return;
        setSources(
          definitions.filter(
            (d) => d.id.startsWith('newsnow-') && d.listType,
          ),
        );
      })
      .catch(() => {
        // 拦截器已 toast;页面按空态展示
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSources = useMemo(
    () => sources.filter((source) => source.listType === tab),
    [sources, tab],
  );
  const anyLoading = visibleSources.some((source) => boards[source.id]?.loading);

  const refreshAll = useCallback(() => {
    for (const source of visibleSources) {
      // 只刷新已加载过的卡片;未进入视口的保持懒加载
      if (boards[source.id]?.loaded) void fetchBoard(source.id);
    }
  }, [visibleSources, boards, fetchBoard]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button
            variant="secondary"
            loading={anyLoading}
            onClick={refreshAll}
          >
            {t('actions.refreshAll')}
          </Button>
        }
      />

      <div className="mb-5 flex gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              tab === key
                ? 'bg-cyan-500/15 font-semibold text-cyan-600'
                : 'border border-line bg-surface text-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {sourcesLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        </div>
      ) : !sources.length ? (
        <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
          <p className="text-sm text-muted">
            {t('list.noSources')}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {visibleSources.map((source) => (
            <HotBoardCard
              key={source.id}
              source={source}
              state={boards[source.id]}
              onVisible={fetchBoard}
              onRefresh={fetchBoard}
            />
          ))}
        </div>
      )}
    </div>
  );
}
