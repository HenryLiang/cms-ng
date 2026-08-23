import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TopicCandidate, TopicSourceDefinition } from '@cms-ng/shared';
import { HotBoardCard, type HotBoardState } from './hot-board-card';

const HOT_SOURCE: TopicSourceDefinition = {
  id: 'newsnow-toutiao',
  label: '头条热榜',
  category: 'trending',
  icon: 'flame',
  listType: 'hottest',
};

const REALTIME_SOURCE: TopicSourceDefinition = {
  id: 'newsnow-cls-telegraph',
  label: '财联社电报',
  category: 'news',
  icon: 'newspaper',
  listType: 'realtime',
};

function candidate(
  title: string,
  overrides: Partial<TopicCandidate> = {},
): TopicCandidate {
  return {
    title,
    description: `${title} 摘要`,
    source: 'newsnow-toutiao',
    heatScore: 90,
    tags: [],
    articles: [{ title, source: 'newsnow-toutiao', snippet: '', url: `https://example.com/${title}` }],
    ...overrides,
  };
}

function loadedState(items: TopicCandidate[]): HotBoardState {
  return {
    items,
    status: 'available',
    warnings: [],
    fetchedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    loading: false,
    loaded: true,
  };
}

describe('HotBoardCard', () => {
  it('未加载时显示加载态,进入视口触发 onVisible(jsdom 无 IO 走降级)', () => {
    const onVisible = vi.fn();
    render(
      <HotBoardCard
        source={HOT_SOURCE}
        state={undefined}
        onVisible={onVisible}
        onRefresh={vi.fn()}
      />,
    );
    expect(onVisible).toHaveBeenCalledWith('newsnow-toutiao');
  });

  it('hottest:名次 + 标题 + 热度 + 外链 + 悬浮摘要', () => {
    render(
      <HotBoardCard
        source={HOT_SOURCE}
        state={loadedState([
          candidate('第一条', { heatScore: 98 }),
          candidate('第二条', { heatScore: 90 }),
        ])}
        onVisible={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    const link = screen.getByText('第一条').closest('a');
    expect(link).toHaveAttribute('href', 'https://example.com/第一条');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('title', '第一条 摘要');
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('98')).toBeInTheDocument();
    // 卡片头部显示相对更新时间
    expect(screen.getByText('5分钟前更新')).toBeInTheDocument();
  });

  it('realtime:显示条目相对发布时间', () => {
    const publishedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    render(
      <HotBoardCard
        source={REALTIME_SOURCE}
        state={loadedState([candidate('快讯一', { publishedAt })])}
        onVisible={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('10分钟前')).toBeInTheDocument();
    expect(screen.getByText('快讯一')).toBeInTheDocument();
  });

  it('unavailable:显示警告与重试,点击重试触发 onRefresh', () => {
    const onRefresh = vi.fn();
    render(
      <HotBoardCard
        source={HOT_SOURCE}
        state={{
          items: [],
          status: 'unavailable',
          warnings: ['头条热榜 暂时不可用: timeout'],
          loading: false,
          loaded: true,
        }}
        onVisible={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByText(/暂时不可用/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('重试'));
    expect(onRefresh).toHaveBeenCalledWith('newsnow-toutiao');
  });

  it('榜单刷新后显示排名变化徽标(上升红 +N)', () => {
    const first = [candidate('甲'), candidate('乙'), candidate('丙')];
    const { rerender } = render(
      <HotBoardCard
        source={HOT_SOURCE}
        state={loadedState(first)}
        onVisible={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    // 乙从第 2 升到第 1:diff=+1;甲降到第 2:diff=-1
    const second = [candidate('乙'), candidate('甲'), candidate('丙')];
    rerender(
      <HotBoardCard
        source={HOT_SOURCE}
        state={loadedState(second)}
        onVisible={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
  });
});
