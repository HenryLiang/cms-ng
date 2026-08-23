import { describe, expect, it } from 'vitest';
import {
  filterUnadopted,
  formatImportedAt,
  paginateTopics,
  sortTopics,
  TOPIC_PAGE_SIZE,
} from '@/lib/topic-list-utils';
import type { TrendingTopic } from '@/lib/topic-api';

function makeTopic(overrides: Partial<TrendingTopic>): TrendingTopic {
  return {
    id: 'topic-x',
    title: '热点',
    heatScore: 50,
    tags: [],
    status: 'OPEN',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterUnadopted', () => {
  const topics = [
    makeTopic({ id: 'open', status: 'OPEN' }),
    makeTopic({ id: 'adopted', status: 'ADOPTED' }),
    makeTopic({ id: 'archived', status: 'ARCHIVED' }),
  ];

  it('开启后剔除 ADOPTED，保留 OPEN 和 ARCHIVED', () => {
    expect(filterUnadopted(topics, true).map((t) => t.id)).toEqual([
      'open',
      'archived',
    ]);
  });

  it('关闭时原样返回全部', () => {
    expect(filterUnadopted(topics, false)).toHaveLength(3);
  });
});

describe('sortTopics', () => {
  it('heat 模式按热度降序，同热度按录入时间降序', () => {
    const topics = [
      makeTopic({ id: 'low-new', heatScore: 30, createdAt: '2026-08-02T00:00:00.000Z' }),
      makeTopic({ id: 'high', heatScore: 90, createdAt: '2026-08-01T00:00:00.000Z' }),
      makeTopic({ id: 'low-old', heatScore: 30, createdAt: '2026-07-31T00:00:00.000Z' }),
    ];
    expect(sortTopics(topics, 'heat').map((t) => t.id)).toEqual([
      'high',
      'low-new',
      'low-old',
    ]);
  });

  it('recent 模式按录入时间降序，忽略热度', () => {
    const topics = [
      makeTopic({ id: 'old-hot', heatScore: 99, createdAt: '2026-07-01T00:00:00.000Z' }),
      makeTopic({ id: 'new-cold', heatScore: 1, createdAt: '2026-08-20T00:00:00.000Z' }),
    ];
    expect(sortTopics(topics, 'recent').map((t) => t.id)).toEqual([
      'new-cold',
      'old-hot',
    ]);
  });

  it('不改动原数组', () => {
    const topics = [
      makeTopic({ id: 'a', heatScore: 10 }),
      makeTopic({ id: 'b', heatScore: 20 }),
    ];
    const snapshot = [...topics];
    sortTopics(topics, 'heat');
    expect(topics).toEqual(snapshot);
  });
});

describe('paginateTopics', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('默认每页 10 条', () => {
    expect(TOPIC_PAGE_SIZE).toBe(10);
    const slice = paginateTopics(items, 1);
    expect(slice.items).toHaveLength(10);
    expect(slice.totalPages).toBe(3);
    expect(slice.total).toBe(25);
  });

  it('中间页切片正确', () => {
    const slice = paginateTopics(items, 2);
    expect(slice.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(slice.page).toBe(2);
  });

  it('末页返回剩余条目', () => {
    expect(paginateTopics(items, 3).items).toEqual([21, 22, 23, 24, 25]);
  });

  it('请求页超出范围时收敛到末页（删除条目后总页数缩小的场景）', () => {
    const slice = paginateTopics([1, 2, 3], 5);
    expect(slice.page).toBe(1);
    expect(slice.items).toEqual([1, 2, 3]);
  });

  it('请求页小于 1 时收敛到第 1 页', () => {
    expect(paginateTopics(items, 0).page).toBe(1);
  });

  it('空列表：1 页、空切片', () => {
    const slice = paginateTopics([], 1);
    expect(slice).toEqual({ items: [], page: 1, totalPages: 1, total: 0 });
  });
});

describe('formatImportedAt', () => {
  it('输出 YYYY-MM-DD HH:mm 本地时间格式', () => {
    const date = new Date(2026, 7, 23, 9, 5);
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `2026-08-23 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    expect(formatImportedAt(date.toISOString())).toBe(expected);
  });

  it('非法日期返回空字符串', () => {
    expect(formatImportedAt('not-a-date')).toBe('');
  });
});
