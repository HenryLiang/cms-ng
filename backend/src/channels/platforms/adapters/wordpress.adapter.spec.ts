import { WordPressAdapter } from './wordpress.adapter';
import { Platform } from '@cms-ng/shared';

describe('WordPressAdapter', () => {
  let adapter: WordPressAdapter;

  beforeEach(() => {
    adapter = new WordPressAdapter();
  });

  describe('platform & metadata', () => {
    it('should have WORDPRESS platform', () => {
      expect(adapter.platform).toBe(Platform.WORDPRESS);
    });

    it('should have correct maxTitleLength', () => {
      expect(adapter.metadata.maxTitleLength).toBe(200);
    });

    it('should have correct maxContentLength', () => {
      expect(adapter.metadata.maxContentLength).toBe(50000);
    });
  });

  describe('getAdaptationPrompt', () => {
    it('should include SEO optimization requirements', () => {
      const prompt = adapter.getAdaptationPrompt({
        title: '测试文章',
        content: '测试内容',
        tags: ['AI', '新闻'],
      });
      expect(prompt).toContain('SEO');
      expect(prompt).toContain('测试文章');
      expect(prompt).toContain('AI, 新闻');
    });

    it('should include subtitle when provided', () => {
      const prompt = adapter.getAdaptationPrompt({
        title: '标题',
        subtitle: '副标题',
        content: '内容',
        tags: [],
      });
      expect(prompt).toContain('副标题');
    });

    it('should not include subtitle line when omitted', () => {
      const prompt = adapter.getAdaptationPrompt({
        title: '标题',
        content: '内容',
        tags: [],
      });
      expect(prompt).not.toContain('原文副标题');
    });

    it('should truncate content to 5000 chars', () => {
      const longContent = 'x'.repeat(10000);
      const prompt = adapter.getAdaptationPrompt({
        title: '标题',
        content: longContent,
        tags: [],
      });
      const contentInPrompt =
        prompt.split('正文：\n')[1]?.split('\n\n要求')[0] || '';
      expect(contentInPrompt.length).toBeLessThanOrEqual(5000);
    });
  });

  describe('postProcess', () => {
    it('should parse valid JSON output', () => {
      const raw = JSON.stringify({
        title: 'SEO标题',
        content: '<h2>正文</h2>',
        excerpt: '摘要',
        tags: ['标签1', '标签2'],
      });
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('SEO标题');
      expect(result.content).toBe('<h2>正文</h2>');
      expect(result.excerpt).toBe('摘要');
      expect(result.tags).toEqual(['标签1', '标签2']);
    });

    it('should handle missing fields in JSON', () => {
      const raw = JSON.stringify({ title: '标题' });
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('标题');
      expect(result.content).toBe('');
      expect(result.tags).toEqual([]);
    });

    it('should handle non-array tags in JSON', () => {
      const raw = JSON.stringify({
        title: '标题',
        content: '内容',
        tags: 'not-array',
      });
      const result = adapter.postProcess(raw);
      expect(result.tags).toEqual([]);
    });

    it('should fallback for non-JSON output', () => {
      const raw = '# 这是标题\n这是正文内容';
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('这是标题');
      expect(result.content).toContain('这是正文内容');
      expect(result.tags).toEqual([]);
    });

    it('should handle empty output', () => {
      const result = adapter.postProcess('');
      expect(result.title).toBe('');
      expect(result.content).toBe('');
    });
  });

  describe('validate', () => {
    it('should pass for valid content', () => {
      const result = adapter.validate({
        title: '有效标题',
        content: '有效内容',
        tags: [],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for empty title', () => {
      const result = adapter.validate({
        title: '',
        content: '内容',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题不能为空');
    });

    it('should fail for empty content', () => {
      const result = adapter.validate({
        title: '标题',
        content: '',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('正文不能为空');
    });

    it('should fail for title exceeding 200 chars', () => {
      const result = adapter.validate({
        title: 'x'.repeat(201),
        content: '内容',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题超过 200 字限制');
    });

    it('should pass for title at exactly 200 chars', () => {
      const result = adapter.validate({
        title: 'x'.repeat(200),
        content: '内容',
        tags: [],
      });
      expect(result.valid).toBe(true);
    });

    it('should return multiple errors', () => {
      const result = adapter.validate({
        title: '',
        content: '',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });
});
