import { InstagramAdapter } from './instagram.adapter';
import { Platform } from '@cms-ng/shared';

describe('InstagramAdapter', () => {
  const adapter = new InstagramAdapter();

  const mockArticle = {
    title: 'IG Test',
    subtitle: undefined,
    content: 'Content '.repeat(30),
    excerpt: 'Excerpt',
    tags: ['tag1'],
  };

  describe('metadata', () => {
    it('should have correct platform', () => {
      expect(adapter.platform).toBe(Platform.INSTAGRAM);
    });

    it('should have correct metadata', () => {
      expect(adapter.metadata.maxTitleLength).toBe(60);
      expect(adapter.metadata.maxContentLength).toBe(800);
      expect(adapter.metadata.aspectRatios).toEqual(['1:1', '4:5', '9:16']);
    });
  });

  describe('getAdaptationPrompt', () => {
    it('should include Instagram-specific requirements', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('Instagram');
      expect(prompt).toContain('极简风格');
      expect(prompt).toContain('hashtag');
      expect(prompt).toContain('800字以内');
    });

    it('should truncate content to 1000 chars', () => {
      const longContent = 'A'.repeat(3000);
      const prompt = adapter.getAdaptationPrompt({
        ...mockArticle,
        content: longContent,
      });
      const match = prompt.match(/正文前1000字：\n([\s\S]+?)\n\nInstagram/);
      expect(match![1].length).toBeLessThanOrEqual(1000);
    });
  });

  describe('validate', () => {
    it('should reject title exceeding 60 chars', () => {
      const result = adapter.validate({
        title: 'A'.repeat(70),
        content: 'C',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题超过 60 字限制');
    });

    it('should reject content exceeding 800 chars', () => {
      const result = adapter.validate({
        title: 'T',
        content: 'A'.repeat(900),
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('正文超过 800 字限制');
    });
  });
});
