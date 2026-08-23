import type { TrendingTopic } from './topic-api';

/** 已录入热点清单的排序方式：热度优先 / 最近录入 */
export type TopicSortMode = 'heat' | 'recent';

/** 已录入热点清单每页条数 */
export const TOPIC_PAGE_SIZE = 10;

/**
 * 「未采纳」筛选：enabled 时剔除已采纳（ADOPTED）条目，保留 OPEN / ARCHIVED；
 * disabled 时原样返回（同一引用，便于 useMemo 依赖比较）。
 */
export function filterUnadopted(
  topics: TrendingTopic[],
  enabled: boolean,
): TrendingTopic[] {
  return enabled ? topics.filter((t) => t.status !== 'ADOPTED') : topics;
}

/**
 * 已录入热点排序（不改动原数组）。
 * - heat:   heatScore 降序，同热度按录入时间降序（与后端 findAll 默认序一致）
 * - recent: 录入时间（createdAt）降序
 */
export function sortTopics(
  topics: TrendingTopic[],
  mode: TopicSortMode,
): TrendingTopic[] {
  const sorted = [...topics];
  if (mode === 'heat') {
    sorted.sort(
      (a, b) =>
        b.heatScore - a.heatScore ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  } else {
    sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  return sorted;
}

export interface TopicPageSlice<T> {
  items: T[];
  /** 收敛后的当前页（请求页越界时收敛到 [1, totalPages]） */
  page: number;
  totalPages: number;
  total: number;
}

/**
 * 客户端分页切片。页码在此收敛：删除条目导致总页数缩小、
 * 或请求页越界时，返回的 page 自动落到合法区间，调用方直接用返回值渲染即可。
 */
export function paginateTopics<T>(
  items: T[],
  page: number,
  pageSize: number = TOPIC_PAGE_SIZE,
): TopicPageSlice<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    page: currentPage,
    totalPages,
    total: items.length,
  };
}

/** 录入时间展示格式：YYYY-MM-DD HH:mm（本地时区） */
export function formatImportedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
