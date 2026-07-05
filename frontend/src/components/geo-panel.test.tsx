import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GEOPanel from './geo-panel';
import type { GEOResult } from '@/lib/article-api';

// window.confirm is called by the "应用到摘要" button before onApplySummary.
let confirmReturn = true;
beforeEach(() => {
  confirmReturn = true;
  vi.spyOn(window, 'confirm').mockImplementation(() => confirmReturn);
});

describe('GEOPanel', () => {
  const mockResult = (override?: Partial<GEOResult>): GEOResult => ({
    overallScore: 72,
    citationScore: 68,
    answerReadinessScore: 75,
    optimizedSummary: 'AI 可引用摘要片段',
    suggestedQuestions: [
      { question: 'H&M 为何重组大中华区', answerSnippet: '销售下滑' },
    ],
    keyStatements: [
      { statement: '关键陈述内容', reason: '易被引用' },
    ],
    entities: [
      { name: 'H&M', type: 'org' },
      { name: '中国', type: 'place' },
    ],
    suggestions: [
      { category: '事实密度', priority: 'high', suggestion: '补充数据' },
      { category: '结构化', priority: 'low', suggestion: '加小标题' },
    ],
    ...override,
  });

  it('should render three score cards with labels', () => {
    render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={vi.fn()} />);

    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('68')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('综合适答度')).toBeInTheDocument();
    expect(screen.getByText('可引用度')).toBeInTheDocument();
    expect(screen.getByText('答案就绪度')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<GEOPanel result={mockResult()} onClose={onClose} onApplySummary={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('score color rules', () => {
    it('should show violet when score >= 80', () => {
      const { container } = render(
        <GEOPanel result={mockResult({ overallScore: 80 })} onClose={vi.fn()} onApplySummary={vi.fn()} />,
      );
      expect(container.querySelector('.text-violet-600')).toBeInTheDocument();
    });

    it('should show amber when score >= 60 and < 80', () => {
      const { container } = render(
        <GEOPanel result={mockResult({ overallScore: 60 })} onClose={vi.fn()} onApplySummary={vi.fn()} />,
      );
      expect(container.querySelector('.text-amber-600')).toBeInTheDocument();
    });

    it('should show red when score < 60', () => {
      const { container } = render(
        <GEOPanel result={mockResult({ overallScore: 59 })} onClose={vi.fn()} onApplySummary={vi.fn()} />,
      );
      expect(container.querySelector('.text-red-600')).toBeInTheDocument();
    });
  });

  describe('AI-citable summary', () => {
    it('should render summary text and apply button', () => {
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.getByText('AI 可引用摘要')).toBeInTheDocument();
      expect(screen.getByText('AI 可引用摘要片段')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '应用到摘要' })).toBeInTheDocument();
    });

    it('should call onApplySummary with summary when confirm is true', () => {
      const onApplySummary = vi.fn();
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={onApplySummary} />);
      fireEvent.click(screen.getByRole('button', { name: '应用到摘要' }));
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(onApplySummary).toHaveBeenCalledWith('AI 可引用摘要片段');
    });

    it('should not call onApplySummary when confirm is false', () => {
      confirmReturn = false;
      const onApplySummary = vi.fn();
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={onApplySummary} />);
      fireEvent.click(screen.getByRole('button', { name: '应用到摘要' }));
      expect(onApplySummary).not.toHaveBeenCalled();
    });

    it('should not render summary section when empty', () => {
      render(<GEOPanel result={mockResult({ optimizedSummary: '' })} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.queryByRole('button', { name: '应用到摘要' })).not.toBeInTheDocument();
    });
  });

  describe('suggested questions', () => {
    it('should render questions with answer snippets', () => {
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.getByText('建议问答覆盖')).toBeInTheDocument();
      expect(screen.getByText(/H&M 为何重组大中华区/)).toBeInTheDocument();
      expect(screen.getByText(/销售下滑/)).toBeInTheDocument();
    });

    it('should not render section when empty', () => {
      render(<GEOPanel result={mockResult({ suggestedQuestions: [] })} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.queryByText('建议问答覆盖')).not.toBeInTheDocument();
    });
  });

  describe('key statements', () => {
    it('should render statements with reasons', () => {
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.getByText('可引用关键陈述')).toBeInTheDocument();
      expect(screen.getByText(/关键陈述内容/)).toBeInTheDocument();
      expect(screen.getByText(/易被引用/)).toBeInTheDocument();
    });

    it('should not render section when empty', () => {
      render(<GEOPanel result={mockResult({ keyStatements: [] })} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.queryByText('可引用关键陈述')).not.toBeInTheDocument();
    });
  });

  describe('entities', () => {
    it('should render entity tags with type labels', () => {
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.getByText('核心实体')).toBeInTheDocument();
      expect(screen.getByText('H&M')).toBeInTheDocument();
      expect(screen.getByText('中国')).toBeInTheDocument();
      expect(screen.getByText('机构')).toBeInTheDocument();
      expect(screen.getByText('地点')).toBeInTheDocument();
    });

    it('should not render section when empty', () => {
      render(<GEOPanel result={mockResult({ entities: [] })} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.queryByText('核心实体')).not.toBeInTheDocument();
    });
  });

  describe('suggestions', () => {
    it('should render suggestions with priority badges', () => {
      render(<GEOPanel result={mockResult()} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.getByText('优化建议')).toBeInTheDocument();
      expect(screen.getByText('高')).toBeInTheDocument();
      expect(screen.getByText('低')).toBeInTheDocument();
      expect(screen.getByText('补充数据')).toBeInTheDocument();
    });

    it('should not render section when empty', () => {
      render(<GEOPanel result={mockResult({ suggestions: [] })} onClose={vi.fn()} onApplySummary={vi.fn()} />);
      expect(screen.queryByText('优化建议')).not.toBeInTheDocument();
    });
  });
});
