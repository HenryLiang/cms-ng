'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Flame,
  Newspaper,
  RefreshCw,
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TopicCandidate, TopicSourceDefinition } from '@cms-ng/shared';
import { formatRelativeTime } from '@/lib/relative-time';

/** 卡片数据状态(由页面层持有,按源 id 存取)。 */
export interface HotBoardState {
  items: TopicCandidate[];
  status: 'available' | 'degraded' | 'unavailable';
  warnings: string[];
  fetchedAt?: string;
  loading: boolean;
  /** 是否已发起过首次请求(滚入视口触发)。 */
  loaded: boolean;
}

const SOURCE_ICONS: Record<TopicSourceDefinition['icon'], LucideIcon> = {
  newspaper: Newspaper,
  trending: TrendingUp,
  flame: Flame,
  video: Video,
  social: Users,
  calendar: Calendar,
};

/** 排名变化徽标自动隐藏时长(newsnow 同款 5s)。 */
const DIFF_BADGE_TTL_MS = 5_000;

interface HotBoardCardProps {
  source: TopicSourceDefinition;
  state?: HotBoardState;
  /** 卡片滚入视口时调用(懒加载首次数据)。 */
  onVisible: (sourceId: string) => void;
  onRefresh: (sourceId: string) => void;
}

/**
 * 实时热点卡片:单个数据源的榜单/快讯列表。
 * 交互复刻 newsnow:滚入视口才请求、头部相对时间 + 单卡刷新、
 * 榜单行带名次与热度、快讯行带相对发布时间、刷新后排名变化 ±N 徽标 5s 消失。
 */
export function HotBoardCard({
  source,
  state,
  onVisible,
  onRefresh,
}: HotBoardCardProps) {
  const t = useTranslations('hotTopics');
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleFiredRef = useRef(false);
  const prevItemsRef = useRef<TopicCandidate[]>([]);
  const [diffs, setDiffs] = useState<Map<string, number>>(new Map());

  // 懒加载:首次进入视口时通知页面层取数
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visibleFiredRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      visibleFiredRef.current = true;
      onVisible(source.id);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          visibleFiredRef.current = true;
          observer.disconnect();
          onVisible(source.id);
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [source.id, onVisible]);

  // 排名变化:仅榜单卡片、且非首次加载时计算,5s 后自动隐藏
  const items = useMemo(() => state?.items ?? [], [state]);
  const listType = source.listType ?? 'hottest';
  const loading = state?.loading ?? false;
  useEffect(() => {
    if (listType !== 'hottest' || !state || state.loading) return;
    const prev = prevItemsRef.current;
    prevItemsRef.current = items;
    if (!prev.length || !items.length) return;
    const prevRank = new Map(prev.map((item, index) => [item.title, index]));
    const next = new Map<string, number>();
    items.forEach((item, index) => {
      const before = prevRank.get(item.title);
      if (before !== undefined && before !== index) {
        next.set(item.title, before - index);
      }
    });
    if (!next.size) return;
    setDiffs(next);
    const timer = setTimeout(() => setDiffs(new Map()), DIFF_BADGE_TTL_MS);
    return () => clearTimeout(timer);
  }, [items, listType, state]);

  const Icon = SOURCE_ICONS[source.icon] ?? Newspaper;
  const status = state?.status ?? 'available';
  const failed = state?.loaded && status === 'unavailable' && !items.length;

  return (
    <div
      ref={rootRef}
      className="flex h-[420px] flex-col rounded-xl border border-line bg-surface shadow-card"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-cyan-500" />
        <h3 className="truncate text-sm font-semibold text-foreground">
          {source.label}
        </h3>
        <span className="ml-auto shrink-0 text-xs text-subtle">
          {loading && !state?.loaded
            ? t('card.loading')
            : failed
              ? t('card.fetchFailed')
              : state?.fetchedAt
                ? t('card.updatedAt', { time: formatRelativeTime(state.fetchedAt) })
                : ''}
        </span>
        <button
          type="button"
          aria-label={t('card.refreshSource', { label: source.label })}
          disabled={loading}
          onClick={() => onRefresh(source.id)}
          className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!state?.loaded || (loading && !items.length) ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted">
              {state.warnings[0] ?? t('card.unavailable')}
            </p>
            <button
              type="button"
              onClick={() => onRefresh(source.id)}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-muted"
            >
              {t('card.retry')}
            </button>
          </div>
        ) : !items.length ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {t('card.emptyData')}
          </div>
        ) : (
          <>
            {status === 'degraded' && state.warnings.length > 0 && (
              <p className="mx-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                {state.warnings[0]}
              </p>
            )}
            {listType === 'realtime' ? (
              <RealtimeList items={items} />
            ) : (
              <HottestList items={items} diffs={diffs} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 名次榜单:序号 chip(前三 cyan 高亮)+ 标题 + 热度/排名变化徽标。 */
function HottestList({
  items,
  diffs,
}: {
  items: TopicCandidate[];
  diffs: Map<string, number>;
}) {
  return (
    <ol className="space-y-0.5">
      {items.map((item, index) => {
        const diff = diffs.get(item.title);
        return (
          <li key={`${item.title}-${index}`}>
            <a
              href={item.articles[0]?.url}
              target="_blank"
              rel="noreferrer"
              title={item.description}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
            >
              <span
                className={`tnum w-5 shrink-0 rounded text-center text-xs font-semibold leading-5 ${
                  index < 3
                    ? 'bg-cyan-500/15 text-cyan-600'
                    : 'bg-surface-muted text-subtle'
                }`}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground group-hover:text-cyan-600">
                {item.title}
              </span>
              {diff !== undefined && (
                <span
                  className={`tnum shrink-0 text-xs font-medium ${
                    diff > 0 ? 'text-rose-500' : 'text-emerald-500'
                  }`}
                >
                  {diff > 0 ? `+${diff}` : diff}
                </span>
              )}
              <span className="tnum shrink-0 text-xs text-subtle">
                {item.heatScore}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** 快讯时间线:相对发布时间 + 标题,左侧竖线串联。 */
function RealtimeList({ items }: { items: TopicCandidate[] }) {
  return (
    <ul className="ml-2 space-y-0.5 border-l border-line">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`}>
          <a
            href={item.articles[0]?.url}
            target="_blank"
            rel="noreferrer"
            title={item.description}
            className="group flex items-baseline gap-2 rounded-r-lg px-2 py-1.5 hover:bg-surface-muted"
          >
            <span className="tnum w-14 shrink-0 text-xs text-subtle">
              {item.publishedAt ? formatRelativeTime(item.publishedAt) : ''}
            </span>
            <span className="min-w-0 flex-1 text-sm leading-5 text-foreground group-hover:text-cyan-600">
              {item.title}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
