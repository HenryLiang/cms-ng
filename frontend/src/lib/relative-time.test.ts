import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from '@/lib/relative-time';

// 固定“现在”:2026-08-23 12:00:00 本地时间
const FIXED_NOW = new Date(2026, 7, 23, 12, 0, 0).getTime();

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('无效输入返回空串', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
    expect(formatRelativeTime(NaN)).toBe('');
  });

  it('1 分钟内为刚刚', () => {
    expect(formatRelativeTime(FIXED_NOW - 30_000)).toBe('刚刚');
  });

  it('未来时间归一为刚刚', () => {
    expect(formatRelativeTime(FIXED_NOW + 60_000)).toBe('刚刚');
  });

  it('N 分钟前', () => {
    expect(formatRelativeTime(FIXED_NOW - 5 * 60_000)).toBe('5分钟前');
    expect(formatRelativeTime(FIXED_NOW - 59 * 60_000)).toBe('59分钟前');
  });

  it('N 小时前', () => {
    expect(formatRelativeTime(FIXED_NOW - 60 * 60_000)).toBe('1小时前');
    expect(formatRelativeTime(FIXED_NOW - 23 * 3_600_000)).toBe('23小时前');
  });

  it('昨天带时分', () => {
    const yesterday = new Date(2026, 7, 22, 8, 5).getTime();
    expect(formatRelativeTime(yesterday)).toBe('昨天 08:05');
  });

  it('更早显示 M月D日', () => {
    const earlier = new Date(2026, 7, 20, 23, 59).getTime();
    expect(formatRelativeTime(earlier)).toBe('8月20日');
  });

  it('接受 ISO 字符串', () => {
    const iso = new Date(FIXED_NOW - 10 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('10分钟前');
  });
});
