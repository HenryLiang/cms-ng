import { FacebookAdapter } from './facebook.adapter';
import { Platform } from '@cms-ng/shared';

describe('FacebookAdapter', () => {
  const adapter = new FacebookAdapter();

  const mockArticle = {
    title: '香港新聞測試',
    subtitle: '副標題',
    content: '這是測試內容。'.repeat(50),
    excerpt: '摘要',
    tags: ['tag1', 'tag2'],
  };

  describe('metadata', () => {
    it('should have correct platform', () => {
      expect(adapter.platform).toBe(Platform.FACEBOOK);
    });

    it('should have correct metadata', () => {
      expect(adapter.metadata.key).toBe(Platform.FACEBOOK);
      expect(adapter.metadata.name).toBe('Facebook');
      expect(adapter.metadata.maxTitleLength).toBe(80);
      expect(adapter.metadata.maxContentLength).toBe(2000);
    });
  });

  describe('getAdaptationPrompt', () => {
    it('should include article title and subtitle', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('香港新聞測試');
      expect(prompt).toContain('副標題');
    });

    it('should include Facebook-specific requirements', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('Facebook');
      expect(prompt).toContain('互动引导语');
      expect(prompt).toContain('80字以内');
    });

    it('should handle article without subtitle', () => {
      const prompt = adapter.getAdaptationPrompt({
        ...mockArticle,
        subtitle: undefined,
      });
      expect(prompt).not.toContain('原文副标题');
    });
  });

  describe('postProcess', () => {
    it('should parse valid JSON', () => {
      const raw = JSON.stringify({
        title: 'FB Title',
        content: 'FB Content',
        tags: ['#tag'],
      });
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('FB Title');
      expect(result.tags).toEqual(['#tag']);
    });
  });

  describe('validate', () => {
    it('should validate correct content', () => {
      const result = adapter.validate({ title: 'T', content: 'C', tags: [] });
      expect(result.valid).toBe(true);
    });

    it('should reject title exceeding 80 chars', () => {
      const result = adapter.validate({
        title: 'A'.repeat(100),
        content: 'C',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题超过 80 字限制');
    });

    it('should reject content exceeding 2000 chars', () => {
      const result = adapter.validate({
        title: 'T',
        content: 'A'.repeat(2500),
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('正文超过 2000 字限制');
    });
  });
});
