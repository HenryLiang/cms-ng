import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResearchKitPanel from './research-kit-panel';
import type { ResearchKitResult } from '@/lib/story-api';

describe('ResearchKitPanel', () => {
  const mockResult = (override?: Partial<ResearchKitResult>): ResearchKitResult => ({
    timeline: [],
    people: [],
    data: [],
    opinions: [],
    ...override,
  });

  it('should render loading state with spinner and text', () => {
    render(<ResearchKitPanel researchKit={null} loading onGenerate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('AI 正在搜集整理资料...')).toBeInTheDocument();
  });

  it('should render empty state when no data', () => {
    render(<ResearchKitPanel researchKit={null} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('暂无资料，点击上方按钮生成')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ResearchKitPanel researchKit={null} loading={false} onGenerate={vi.fn()} onClose={onClose} />);

    const closeBtn = screen.getAllByRole('button').find((b) => b.querySelector('svg'));
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onGenerate when generate button clicked', () => {
    const onGenerate = vi.fn();
    render(<ResearchKitPanel researchKit={null} loading={false} onGenerate={onGenerate} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('生成资料包'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('should show "重新生成" button text when researchKit exists', () => {
    render(<ResearchKitPanel researchKit={mockResult()} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('重新生成')).toBeInTheDocument();
  });

  it('should show "生成资料包" button text when researchKit is null', () => {
    render(<ResearchKitPanel researchKit={null} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('生成资料包')).toBeInTheDocument();
  });

  describe('tab switching', () => {
    const fullResult = mockResult({
      timeline: [{ date: '2024-01-01', event: 'Event 1', source: 'Source A' }],
      people: [{ name: 'Alice', role: 'CEO', background: 'Tech industry' }],
      data: [{ label: 'Revenue', value: '$1M', source: 'Report' }],
      opinions: [{ source: 'Analyst', viewpoint: 'Positive', stance: 'Bullish' }],
    });

    it('should default to timeline tab', () => {
      render(<ResearchKitPanel researchKit={fullResult} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByText('Event 1')).toBeInTheDocument();
      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
    });

    it('should switch to people tab', () => {
      render(<ResearchKitPanel researchKit={fullResult} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('关键人物'));
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('CEO')).toBeInTheDocument();
      expect(screen.getByText('Tech industry')).toBeInTheDocument();
    });

    it('should switch to data tab', () => {
      render(<ResearchKitPanel researchKit={fullResult} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('核心数据'));
      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('$1M')).toBeInTheDocument();
      expect(screen.getByText('来源：Report')).toBeInTheDocument();
    });

    it('should switch to opinions tab', () => {
      render(<ResearchKitPanel researchKit={fullResult} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('各方观点'));
      expect(screen.getByText('Analyst')).toBeInTheDocument();
      expect(screen.getByText('Positive')).toBeInTheDocument();
      expect(screen.getByText('Bullish')).toBeInTheDocument();
    });
  });

  describe('timeline rendering', () => {
    it('should render timeline items with dots and vertical lines', () => {
      const result = mockResult({
        timeline: [
          { date: '2024-01-01', event: 'First event', source: 'News' },
          { date: '2024-02-01', event: 'Second event' },
        ],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByText('First event')).toBeInTheDocument();
      expect(screen.getByText('Second event')).toBeInTheDocument();
      expect(screen.getByText('来源：News')).toBeInTheDocument();
    });

    it('should show empty message when timeline is empty', () => {
      const result = mockResult({
        timeline: [],
        people: [{ name: 'P1', role: 'R1' }],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('事件时间线'));
      expect(screen.getByText('暂无时间线数据')).toBeInTheDocument();
    });
  });

  describe('people rendering', () => {
    it('should render people in grid cards', () => {
      const result = mockResult({
        people: [
          { name: 'Bob', role: 'Engineer' },
          { name: 'Carol', role: 'Designer', background: 'UX expert' },
        ],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('关键人物'));
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Engineer')).toBeInTheDocument();
      expect(screen.getByText('Carol')).toBeInTheDocument();
      expect(screen.getByText('Designer')).toBeInTheDocument();
      expect(screen.getByText('UX expert')).toBeInTheDocument();
    });

    it('should show empty message when people is empty', () => {
      const result = mockResult({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        people: [],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('关键人物'));
      expect(screen.getByText('暂无人物数据')).toBeInTheDocument();
    });
  });

  describe('data rendering', () => {
    it('should render data items with label, value and source', () => {
      const result = mockResult({
        data: [{ label: 'Users', value: '10K', source: 'Analytics' }],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('核心数据'));
      expect(screen.getByText('Users')).toBeInTheDocument();
      expect(screen.getByText('10K')).toBeInTheDocument();
      expect(screen.getByText('来源：Analytics')).toBeInTheDocument();
    });

    it('should show empty message when data is empty', () => {
      const result = mockResult({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        data: [],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('核心数据'));
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });

  describe('opinions rendering', () => {
    it('should render opinions with source badge, stance and viewpoint', () => {
      const result = mockResult({
        opinions: [
          { source: 'Expert A', viewpoint: 'Market will grow', stance: 'Optimistic' },
          { source: 'Expert B', viewpoint: 'Stay cautious' },
        ],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('各方观点'));
      expect(screen.getByText('Expert A')).toBeInTheDocument();
      expect(screen.getByText('Optimistic')).toBeInTheDocument();
      expect(screen.getByText('Market will grow')).toBeInTheDocument();
      expect(screen.getByText('Expert B')).toBeInTheDocument();
      expect(screen.getByText('Stay cautious')).toBeInTheDocument();
    });

    it('should show empty message when opinions is empty', () => {
      const result = mockResult({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        opinions: [],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(screen.getByText('各方观点'));
      expect(screen.getByText('暂无观点数据')).toBeInTheDocument();
    });
  });

  describe('tab counts', () => {
    it('should show correct counts on tab badges', () => {
      const result = mockResult({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        people: [{ name: 'P1', role: 'R1' }],
        data: [{ label: 'L1', value: 'V1' }],
        opinions: [{ source: 'S1', viewpoint: 'V1' }],
      });
      render(<ResearchKitPanel researchKit={result} loading={false} onGenerate={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getAllByText('1')).toHaveLength(4);
    });
  });
});
