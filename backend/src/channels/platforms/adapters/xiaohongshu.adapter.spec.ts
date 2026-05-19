import { XiaohongshuAdapter } from './xiaohongshu.adapter';
import { Platform } from '@cms-ng/shared';

describe('XiaohongshuAdapter', () => {
  const adapter = new XiaohongshuAdapter();

  const mockArticle = {
    title: '香港新聞報導測試標題',
    subtitle: '副標題內容',
    content: '這是一篇測試文章的內容。'.repeat(50),
    excerpt: '摘要內容',
    tags: ['香港', '新聞'],
  };

  describe('metadata', () => {
    it('should have correct platform', () => {
      expect(adapter.platform).toBe(Platform.XIAOHONGSHU);
    });

    it('should have correct metadata', () => {
      expect(adapter.metadata.key).toBe(Platform.XIAOHONGSHU);
      expect(adapter.metadata.name).toBe('小红书');
      expect(adapter.metadata.maxTitleLength).toBe(40);
      expect(adapter.metadata.maxContentLength).toBe(1000);
      expect(adapter.metadata.supportsImages).toBe(true);
    });
  });

  describe('getAdaptationPrompt', () => {
    it('should include article title', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('香港新聞報導測試標題');
    });

    it('should include platform-specific requirements', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('小红书');
      expect(prompt).toContain('种草风格');
      expect(prompt).toContain('emoji');
      expect(prompt).toContain('40字以内');
      expect(prompt).toContain('1000字以内');
    });

    it('should request JSON output format', () => {
      const prompt = adapter.getAdaptationPrompt(mockArticle);
      expect(prompt).toContain('输出格式为 JSON');
    });

    it('should truncate long content', () => {
      const longContent = 'A'.repeat(5000);
      const prompt = adapter.getAdaptationPrompt({ ...mockArticle, content: longContent });
      // Content should be truncated to ~1500 chars
      const contentMatch = prompt.match(/正文前1500字：\n([\s\S]+?)\n\n小红书笔记要求/);
      expect(contentMatch).not.toBeNull();
      expect(contentMatch![1].length).toBeLessThanOrEqual(1500);
    });
  });

  describe('postProcess', () => {
    it('should parse valid JSON response', () => {
      const raw = JSON.stringify({
        title: '✅ 測試標題',
        content: '💡 第一點\n✅ 第二點',
        excerpt: '簡短導語',
        tags: ['#香港', '#生活'],
      });
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('✅ 測試標題');
      expect(result.content).toBe('💡 第一點\n✅ 第二點');
      expect(result.excerpt).toBe('簡短導語');
      expect(result.tags).toEqual(['#香港', '#生活']);
    });

    it('should parse JSON from markdown code fence', () => {
      const raw = '```json\n{"title": "Test", "content": "Body", "tags": ["#tag"]}\n```';
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('Test');
      expect(result.tags).toEqual(['#tag']);
    });

    it('should fallback to line parsing for non-JSON', () => {
      const raw = '# Title Line\nContent line 1\nContent line 2';
      const result = adapter.postProcess(raw);
      expect(result.title).toBe('Title Line');
      expect(result.content).toBe('Content line 1\nContent line 2');
    });

    it('should handle empty response', () => {
      const result = adapter.postProcess('');
      expect(result.title).toBe('');
      expect(result.content).toBe('');
      expect(result.tags).toEqual([]);
    });

    it('should handle tags that are not array', () => {
      const raw = JSON.stringify({ title: 'Test', content: 'Body', tags: 'not-array' });
      const result = adapter.postProcess(raw);
      expect(result.tags).toEqual([]);
    });
  });

  describe('validate', () => {
    it('should validate correct content', () => {
      const result = adapter.validate({
        title: 'Valid Title',
        content: 'Valid content',
        tags: [],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty title', () => {
      const result = adapter.validate({ title: '', content: 'Body', tags: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题不能为空');
    });

    it('should reject empty content', () => {
      const result = adapter.validate({ title: 'Title', content: '', tags: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('正文不能为空');
    });

    it('should reject title exceeding max length', () => {
      const result = adapter.validate({
        title: 'A'.repeat(50),
        content: 'Body',
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('标题超过 40 字限制');
    });

    it('should reject content exceeding max length', () => {
      const result = adapter.validate({
        title: 'Title',
        content: 'A'.repeat(1500),
        tags: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('正文超过 1000 字限制');
    });

    it('should collect multiple errors', () => {
      const result = adapter.validate({ title: '', content: '', tags: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('标题不能为空');
      expect(result.errors).toContain('正文不能为空');
    });
  });
});
