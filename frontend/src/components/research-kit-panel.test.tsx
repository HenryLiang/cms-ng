import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResearchKitPanel from './research-kit-panel';

describe('ResearchKitPanel', () => {
  const mockResearchKit = {
    timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
    people: [{ name: 'Person A', role: 'Role A', background: 'Background A' }],
    data: [{ label: 'Label 1', value: 'Value 1', source: 'Source 1' }],
    opinions: [{ source: 'Source A', viewpoint: 'Viewpoint A', stance: 'Stance A' }],
    wikipedia: [] as any[],
    wikipediaStatus: 'no_results' as const,
  };

  it('should render loading state', () => {
    render(
      <ResearchKitPanel
        researchKit={null}
        loading={true}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('AI 正在搜集整理资料...')).toBeInTheDocument();
  });

  it('should render empty state', () => {
    render(
      <ResearchKitPanel
        researchKit={{ timeline: [], people: [], data: [], opinions: [] }}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('暂无资料，点击上方按钮生成')).toBeInTheDocument();
  });

  it('should render tabs with data counts', () => {
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    expect(screen.getByText('事件时间线')).toBeInTheDocument();
    expect(screen.getByText('关键人物')).toBeInTheDocument();
    expect(screen.getByText('核心数据')).toBeInTheDocument();
    expect(screen.getByText('各方观点')).toBeInTheDocument();
  });

  it('should show generate draft button when has data and onGenerateDraft provided', () => {
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    expect(screen.getByText('基於資料生成初稿')).toBeInTheDocument();
  });

  it('should not show generate draft button when onGenerateDraft not provided', () => {
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('基於資料生成初稿')).not.toBeInTheDocument();
  });

  it('should call onGenerateDraft when button clicked', () => {
    const onGenerateDraft = vi.fn();
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={onGenerateDraft}
      />,
    );
    fireEvent.click(screen.getByText('基於資料生成初稿'));
    expect(onGenerateDraft).toHaveBeenCalledTimes(1);
  });

  it('should disable generate draft button when draftLoading', () => {
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
        draftLoading={true}
      />,
    );
    const button = screen.getByRole('button', { name: /撰寫中/ });
    expect(button).toBeDisabled();
  });

  it('should switch tabs and render corresponding content', () => {
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    // Default tab is timeline
    expect(screen.getByText('Event 1')).toBeInTheDocument();

    // Switch to people tab
    fireEvent.click(screen.getByText('关键人物'));
    expect(screen.getByText('Person A')).toBeInTheDocument();
    expect(screen.getByText('Role A')).toBeInTheDocument();

    // Switch to data tab
    fireEvent.click(screen.getByText('核心数据'));
    expect(screen.getByText('Label 1')).toBeInTheDocument();
    expect(screen.getByText('Value 1')).toBeInTheDocument();

    // Switch to opinions tab
    fireEvent.click(screen.getByText('各方观点'));
    expect(screen.getByText('Viewpoint A')).toBeInTheDocument();
    expect(screen.getByText('Source A')).toBeInTheDocument();
  });

  it('should render empty tab message when section has no data', () => {
    render(
      <ResearchKitPanel
        researchKit={{
          timeline: [],
          people: [],
          data: [],
          opinions: [],
        }}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    // Even with empty sections, panel shows as "no data" overall
    expect(screen.getByText('暂无资料，点击上方按钮生成')).toBeInTheDocument();
  });

  // ===== Wikipedia tab tests =====

  it('should render Wikipedia tab when wikipedia data exists', () => {
    const withWiki = {
      ...mockResearchKit,
      wikipedia: [
        {
          title: '香港房屋政策',
          extract: '香港房屋政策是指香港特區政府...',
          url: 'https://zh.wikipedia.org/wiki/香港房屋政策',
          language: 'zh' as const,
        },
      ],
    };
    render(
      <ResearchKitPanel
        researchKit={withWiki}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
    // Wikipedia tab button should contain count badge "1"
    const wikiTab = screen.getByText('Wikipedia').closest('button');
    expect(wikiTab).toHaveTextContent('1');
  });

  it('should render Wikipedia tab even when no wikipedia data (tab always visible)', () => {
    render(
      <ResearchKitPanel
        researchKit={mockResearchKit}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
  });

  it('should render Wikipedia entry details when tab clicked', () => {
    const withWiki = {
      timeline: [],
      people: [],
      data: [],
      opinions: [],
      wikipedia: [
        {
          title: '香港房屋政策',
          extract: '香港房屋政策是指香港特區政府制定的房屋相關政策。',
          url: 'https://zh.wikipedia.org/wiki/香港房屋政策',
          language: 'zh' as const,
        },
      ],
    };
    render(
      <ResearchKitPanel
        researchKit={withWiki}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Wikipedia'));
    expect(screen.getByText('香港房屋政策')).toBeInTheDocument();
    expect(screen.getByText('中文')).toBeInTheDocument();
    expect(screen.getByText('香港房屋政策是指香港特區政府制定的房屋相關政策。')).toBeInTheDocument();
    expect(screen.getByText('查看原文 →')).toHaveAttribute('href', 'https://zh.wikipedia.org/wiki/香港房屋政策');
  });

  it('should render English Wikipedia entry with correct label', () => {
    const withWiki = {
      timeline: [],
      people: [],
      data: [],
      opinions: [],
      wikipedia: [
        {
          title: 'Housing in Hong Kong',
          extract: 'Housing in Hong Kong varies...',
          url: 'https://en.wikipedia.org/wiki/Housing_in_Hong_Kong',
          language: 'en' as const,
        },
      ],
    };
    render(
      <ResearchKitPanel
        researchKit={withWiki}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Wikipedia'));
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('should treat wikipedia-only data as having data (not empty)', () => {
    const wikiOnly = {
      timeline: [],
      people: [],
      data: [],
      opinions: [],
      wikipedia: [
        {
          title: 'Test',
          extract: 'Test extract',
          url: 'https://zh.wikipedia.org/wiki/Test',
          language: 'zh' as const,
        },
      ],
    };
    render(
      <ResearchKitPanel
        researchKit={wikiOnly}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    // Should NOT show empty state
    expect(screen.queryByText('暂无资料，点击上方按钮生成')).not.toBeInTheDocument();
    // Should show Wikipedia tab
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
    // Should show generate draft button
    expect(screen.getByText('基於資料生成初稿')).toBeInTheDocument();
  });

  it('should render Wikipedia tab even when no wikipedia data (always visible)', () => {
    const withEmptyWiki = {
      timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
      people: [],
      data: [],
      opinions: [],
      wikipedia: [],
      wikipediaStatus: 'no_results' as const,
    };
    render(
      <ResearchKitPanel
        researchKit={withEmptyWiki}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    // Wikipedia tab should appear even when empty (to show status)
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
    // Click the tab to see the message
    fireEvent.click(screen.getByText('Wikipedia'));
    expect(screen.getByText('Wikipedia 未找到相关词条')).toBeInTheDocument();
  });

  it('should show Wikipedia API error with warning label when wikipediaStatus is api_error', () => {
    const withApiError = {
      timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
      people: [],
      data: [],
      opinions: [],
      wikipedia: [],
      wikipediaStatus: 'api_error' as const,
    };
    render(
      <ResearchKitPanel
        researchKit={withApiError}
        loading={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
        onGenerateDraft={vi.fn()}
      />,
    );
    // Wikipedia tab should show warning indicator
    expect(screen.getByText('Wikipedia ⚠️')).toBeInTheDocument();
    // Click the tab to see the error message
    fireEvent.click(screen.getByText('Wikipedia ⚠️'));
    expect(screen.getByText('Wikipedia 获取失败')).toBeInTheDocument();
    expect(screen.getByText(/代理未开启|网络不通|Wikipedia 限流/)).toBeInTheDocument();
  });
});
