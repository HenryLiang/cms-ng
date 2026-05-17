import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReviewReportPanel from './review-report-panel';
import type { ReviewReportResult } from '@/lib/article-api';

describe('ReviewReportPanel', () => {
  const mockResult = (override?: Partial<ReviewReportResult>): ReviewReportResult => ({
    overallScore: 78,
    summary: 'Overall assessment summary',
    dimensions: [
      { name: 'Structure', score: 80, maxScore: 100, comment: 'Well structured' },
      { name: 'Language', score: 75, maxScore: 100, comment: 'Fluent' },
    ],
    suggestions: [
      { dimension: 'Structure', priority: 'high', suggestion: 'Add more background' },
      { dimension: 'Language', priority: 'medium', suggestion: 'Simplify sentences' },
    ],
    ...override,
  });

  it('should render overall score and summary', () => {
    render(<ReviewReportPanel result={mockResult()} onClose={vi.fn()} />);

    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Overall assessment summary')).toBeInTheDocument();
    expect(screen.getByText('综合评分 / 100')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ReviewReportPanel result={mockResult()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('score color rules', () => {
    it('should show green when score >= 80', () => {
      const { container } = render(<ReviewReportPanel result={mockResult({ overallScore: 80 })} onClose={vi.fn()} />);
      const scoreEl = container.querySelector('.text-4xl.font-bold.text-emerald-600');
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl).toHaveTextContent('80');
    });

    it('should show amber when score >= 60 and < 80', () => {
      const { container } = render(<ReviewReportPanel result={mockResult({ overallScore: 60 })} onClose={vi.fn()} />);
      const scoreEl = container.querySelector('.text-4xl.font-bold.text-amber-600');
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl).toHaveTextContent('60');
    });

    it('should show red when score < 60', () => {
      const { container } = render(<ReviewReportPanel result={mockResult({ overallScore: 59 })} onClose={vi.fn()} />);
      const scoreEl = container.querySelector('.text-4xl.font-bold.text-red-600');
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl).toHaveTextContent('59');
    });
  });

  describe('dimensions', () => {
    it('should render dimension list with progress bars', () => {
      const { container } = render(<ReviewReportPanel result={mockResult()} onClose={vi.fn()} />);

      expect(screen.getByText('维度评分')).toBeInTheDocument();
      expect(screen.getAllByText('Structure').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Language').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('80 / 100')).toBeInTheDocument();
      expect(screen.getByText('75 / 100')).toBeInTheDocument();
      expect(screen.getByText('Well structured')).toBeInTheDocument();
      expect(screen.getByText('Fluent')).toBeInTheDocument();
      expect(container.querySelector('.h-2.w-full.rounded-full.bg-zinc-100')).toBeInTheDocument();
    });

    it('should not render dimensions section when empty', () => {
      const { container } = render(<ReviewReportPanel result={mockResult({ dimensions: [] })} onClose={vi.fn()} />);

      expect(container.querySelectorAll('h4').length).toBe(1); // only "改进建议" header
    });
  });

  describe('suggestions', () => {
    it('should render suggestions with priority badges', () => {
      render(<ReviewReportPanel result={mockResult()} onClose={vi.fn()} />);

      expect(screen.getByText('改进建议')).toBeInTheDocument();
      expect(screen.getByText('高')).toBeInTheDocument();
      expect(screen.getByText('中')).toBeInTheDocument();
      expect(screen.getByText('Add more background')).toBeInTheDocument();
      expect(screen.getByText('Simplify sentences')).toBeInTheDocument();
    });

    it('should not render suggestions section when empty', () => {
      const { container } = render(<ReviewReportPanel result={mockResult({ suggestions: [] })} onClose={vi.fn()} />);

      const headers = container.querySelectorAll('h4');
      expect(headers.length).toBe(1); // only "维度评分" header
    });
  });

  describe('priority badge colors', () => {
    it('should show red badge for high priority', () => {
      const { container } = render(<ReviewReportPanel
        result={mockResult({ suggestions: [{ dimension: 'A', priority: 'high', suggestion: 'S1' }] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('高')).toBeInTheDocument();
      expect(container.querySelector('.text-red-600.bg-red-50')).toBeInTheDocument();
    });

    it('should show amber badge for medium priority', () => {
      const { container } = render(<ReviewReportPanel
        result={mockResult({ suggestions: [{ dimension: 'A', priority: 'medium', suggestion: 'S1' }] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('中')).toBeInTheDocument();
      expect(container.querySelector('.text-amber-600.bg-amber-50')).toBeInTheDocument();
    });

    it('should show gray badge for low priority', () => {
      const { container } = render(<ReviewReportPanel
        result={mockResult({ suggestions: [{ dimension: 'A', priority: 'low', suggestion: 'S1' }] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('低')).toBeInTheDocument();
      expect(container.querySelector('.text-zinc-600.bg-zinc-50')).toBeInTheDocument();
    });
  });
});
