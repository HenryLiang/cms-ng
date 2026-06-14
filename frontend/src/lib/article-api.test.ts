import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import { aiFactCheck, aiReviewReport, type FactCheckResult, type ReviewReportResult } from './article-api';

vi.mock('./api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('article-api', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('aiFactCheck', () => {
    it('should call POST /articles/:id/ai-fact-check and return result', async () => {
      const mockResult: FactCheckResult = {
        score: 85,
        summary: 'Good quality',
        findings: [
          { type: 'fact', text: 'Fact A', message: 'Verified', severity: 'info' },
        ],
      };
      vi.mocked(api.post).mockResolvedValue({ data: mockResult });

      const result = await aiFactCheck('article-1');

      expect(api.post).toHaveBeenCalledWith(
        '/articles/article-1/ai-fact-check',
        { language: undefined },
      );
      expect(result.score).toBe(85);
      expect(result.summary).toBe('Good quality');
      expect(result.findings).toHaveLength(1);
    });

    it('should propagate API errors', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      await expect(aiFactCheck('article-1')).rejects.toThrow('Network error');
    });
  });

  describe('aiReviewReport', () => {
    it('should call POST /articles/:id/ai-review and return result', async () => {
      const mockResult: ReviewReportResult = {
        overallScore: 78,
        summary: 'Good structure and language',
        dimensions: [
          { name: 'Structure', score: 80, maxScore: 100, comment: 'Well organized' },
          { name: 'Language', score: 75, maxScore: 100, comment: 'Fluent' },
        ],
        suggestions: [
          { dimension: 'Structure', priority: 'high', suggestion: 'Add background' },
        ],
      };
      vi.mocked(api.post).mockResolvedValue({ data: mockResult });

      const result = await aiReviewReport('article-1');

      expect(api.post).toHaveBeenCalledWith(
        '/articles/article-1/ai-review',
        { language: undefined },
      );
      expect(result.overallScore).toBe(78);
      expect(result.summary).toBe('Good structure and language');
      expect(result.dimensions).toHaveLength(2);
      expect(result.suggestions).toHaveLength(1);
    });

    it('should propagate API errors', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      await expect(aiReviewReport('article-1')).rejects.toThrow('Network error');
    });
  });
});
