import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResearchKitPanel from './research-kit-panel';

describe('ResearchKitPanel', () => {
  const mockResearchKit = {
    timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source 1' }],
    people: [{ name: 'Person A', role: 'Role A', background: 'Background A' }],
    data: [{ label: 'Label 1', value: 'Value 1', source: 'Source 1' }],
    opinions: [{ source: 'Source A', viewpoint: 'Viewpoint A', stance: 'Stance A' }],
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
});
