import { WebsiteAdapter } from './website.adapter';
import { Platform } from '@cms-ng/shared';

describe('WebsiteAdapter', () => {
  const adapter = new WebsiteAdapter();

  const mockArticle = {
    title: 'Website Article',
    subtitle: 'Subtitle',
    content: '<p>HTML content</p>'.repeat(50),
    excerpt: 'Excerpt',
    tags: ['news', 'hongkong'],
  };

  describe('metadata', () => {
    it('should have correct platform', () => {
      expect(adapter.platform).toBe(Platform.WEBSITE);
    });

    it('should have correct metadata', () => {
      expect(adapter.metadata.name).toBe('官网/APP');
      expect(adapter.metadata.supportsImages).toBe(true);
      expect(adapter.metadata.supportsVideo).toBe(true);
    });
  });

  describe('getAdaptationPrompt', () => {
    it('should include all article fields', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('Website Article');
      expect(prompt).toContain('Subtitle');
      expect(prompt).toContain('news');
      expect(prompt).toContain('hongkong');
    });

    it('should handle missing subtitle', () => {
      const prompt = adapter.getAdaptationPrompt({
        ...mockArticle,
        subtitle: undefined,
      });
      expect(prompt).not.toContain('原文副标题');
    });

    it('should truncate content to 3000 chars', () => {
      const longContent = 'A'.repeat(5000);
      const prompt = adapter.getAdaptationPrompt({
        ...mockArticle,
        content: longContent,
      });
      const contentMatch = prompt.match(/正文：\n([\s\S]+?)\n\n要求/);
      expect(contentMatch![1].length).toBeLessThanOrEqual(3000);
    });
  });

  describe('postProcess', () => {
    it('should parse valid JSON with HTML content', () => {
      const raw = JSON.stringify({
        title: 'Website Title',
        content: '<p>HTML paragraph</p>',
        excerpt: 'Summary',
        tags: ['news'],
      });
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('Website Title');
      expect(result.content).toBe('<p>HTML paragraph</p>');
    });
  });

  describe('validate', () => {
    it('should validate with only title and content', () => {
      const result = adapter.validate({ title: 'T', content: 'C', tags: [] });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should not enforce length limits', () => {
      const result = adapter.validate({
        title: 'A'.repeat(200),
        content: 'A'.repeat(10000),
        tags: [],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject empty title', () => {
      const result = adapter.validate({ title: '', content: 'C', tags: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题不能为空');
    });

    it('should reject empty content', () => {
      const result = adapter.validate({ title: 'T', content: '', tags: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('正文不能为空');
    });
  });
});
