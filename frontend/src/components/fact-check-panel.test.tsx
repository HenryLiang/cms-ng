import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FactCheckPanel from './fact-check-panel';
import type { FactCheckResult } from '@/lib/article-api';

describe('FactCheckPanel', () => {
  const mockResult = (override?: Partial<FactCheckResult>): FactCheckResult => ({
    score: 85,
    summary: 'Overall assessment',
    findings: [],
    ...override,
  });

  const mockFinding = (
    type: FactCheckResult['findings'][0]['type'],
    severity: FactCheckResult['findings'][0]['severity'],
  ) => ({
    type,
    text: 'Sample text',
    message: 'Sample message',
    severity,
  });

  it('should render score and summary', () => {
    render(<FactCheckPanel result={mockResult()} onClose={vi.fn()} />);

    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('Overall assessment')).toBeInTheDocument();
    expect(screen.getByText('可信度评分 / 100')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<FactCheckPanel result={mockResult()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('score color rules', () => {
    it('should show green when score >= 80', () => {
      const { container } = render(<FactCheckPanel result={mockResult({ score: 80 })} onClose={vi.fn()} />);
      const scoreEl = container.querySelector('.text-2xl.font-bold.text-emerald-600');
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl).toHaveTextContent('80');
    });

    it('should show amber when score >= 50 and < 80', () => {
      const { container } = render(<FactCheckPanel result={mockResult({ score: 50 })} onClose={vi.fn()} />);
      const scoreEl = container.querySelector('.text-2xl.font-bold.text-amber-600');
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl).toHaveTextContent('50');
    });

    it('should show red when score < 50', () => {
      const { container } = render(<FactCheckPanel result={mockResult({ score: 49 })} onClose={vi.fn()} />);
      const scoreEl = container.querySelector('.text-2xl.font-bold.text-red-600');
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl).toHaveTextContent('49');
    });
  });

  describe('findings list', () => {
    it('should not render findings list when empty', () => {
      const { container } = render(<FactCheckPanel result={mockResult({ findings: [] })} onClose={vi.fn()} />);
      expect(container.querySelectorAll('.rounded-md.border').length).toBe(0);
    });

    it('should render findings when present', () => {
      render(<FactCheckPanel
        result={mockResult({
          findings: [mockFinding('fact', 'info')],
        })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('Sample text')).toBeInTheDocument();
      expect(screen.getByText('Sample message')).toBeInTheDocument();
    });
  });

  describe('severity badge colors', () => {
    it('should show red badge for critical severity', () => {
      const { container } = render(<FactCheckPanel
        result={mockResult({ findings: [mockFinding('fact', 'critical')] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('严重')).toBeInTheDocument();
      expect(container.querySelector('.bg-red-50.text-red-700')).toBeInTheDocument();
    });

    it('should show amber badge for warning severity', () => {
      const { container } = render(<FactCheckPanel
        result={mockResult({ findings: [mockFinding('fact', 'warning')] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('警告')).toBeInTheDocument();
      expect(container.querySelector('.bg-amber-50.text-amber-700')).toBeInTheDocument();
    });

    it('should show blue badge for info severity', () => {
      const { container } = render(<FactCheckPanel
        result={mockResult({ findings: [mockFinding('fact', 'info')] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText('提示')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-50.text-blue-700')).toBeInTheDocument();
    });
  });

  describe('type label translation', () => {
    it.each([
      ['fact', '事实'],
      ['inconsistency', '不一致'],
      ['dispute', '争议'],
      ['source_needed', '需核实'],
      ['risk', '风险'],
    ] as const)('should translate type "%s" to "%s"', (type, expected) => {
      render(<FactCheckPanel
        result={mockResult({ findings: [mockFinding(type, 'info')] })}
        onClose={vi.fn()}
      />);

      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });
});
