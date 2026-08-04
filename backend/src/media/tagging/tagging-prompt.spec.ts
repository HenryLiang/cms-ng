import {
  normalizeTags,
  normalizeAltText,
  parseTaggingResult,
} from './tagging-prompt';

describe('tagging-prompt 归一化与内容级过滤', () => {
  describe('normalizeTags', () => {
    it('剔除非字符串与空串', () => {
      expect(
        normalizeTags([null, undefined, '', '  ', '有效', 123 as unknown]),
      ).toEqual(['有效']);
    });

    it('大小写去重', () => {
      expect(normalizeTags(['Spring', 'spring', 'SPRING'])).toEqual(['Spring']);
    });

    it('全半角归一后去重', () => {
      // 全角逗号归一为半角后,与半角写法视为相同
      expect(normalizeTags(['科技，AI', '科技,AI'])).toEqual(['科技,AI']);
    });

    it('限长 20 字符', () => {
      const long = '一'.repeat(30);
      const out = normalizeTags([long]);
      expect(out[0].length).toBe(20);
    });

    it('数量上限 10', () => {
      const out = normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`));
      expect(out.length).toBe(10);
    });

    it('拒绝 URL(内容级过滤)', () => {
      expect(normalizeTags(['https://spam.example', '正常'])).toEqual(['正常']);
    });

    it('拒绝 @ 与控制字符', () => {
      expect(normalizeTags(['@user', 'a\x00b', '正常'])).toEqual(['正常']);
    });

    it('拒绝不在允许字符集的标签', () => {
      expect(normalizeTags(['###', '正常'])).toEqual(['正常']);
    });
  });

  describe('normalizeAltText', () => {
    it('非字符串 -> null', () => {
      expect(normalizeAltText(null)).toBeNull();
      expect(normalizeAltText(123)).toBeNull();
    });

    it('剔控制字符 + 限长 80', () => {
      expect(normalizeAltText('a\x00b')).toBe('ab');
      const long = '一'.repeat(100);
      expect(normalizeAltText(long).length).toBe(80);
    });

    it('空串 -> null', () => {
      expect(normalizeAltText('   ')).toBeNull();
    });

    it('剔 URL 与 @(PRD §6.4,与 tags 一致)', () => {
      const r1 = normalizeAltText('见图 https://evil.com/x');
      expect(r1).toBe('见图');
      expect(r1).not.toMatch(/https?:\/\//i);
      const r2 = normalizeAltText('联系 @spam');
      expect(r2).not.toMatch(/@/);
      // 全 URL/全 @ 剥到空 -> null
      expect(normalizeAltText('https://only.url/x')).toBeNull();
    });
  });

  describe('parseTaggingResult', () => {
    it('合法 JSON -> 解析', () => {
      const r = parseTaggingResult('{"tags":["a"],"altText":"b"}');
      expect(r.tags).toEqual(['a']);
      expect(r.altText).toBe('b');
    });

    it('非法 JSON -> 抛错(由 worker 转 FAILED)', () => {
      expect(() => parseTaggingResult('not json')).toThrow();
    });

    it('形状不符(tags 非数组)-> 抛错', () => {
      expect(() => parseTaggingResult('{"tags":"x"}')).toThrow();
    });

    it('nullish 容忍:tags 含 null 元素被 zod 接受,归一化时剔除', () => {
      const r = parseTaggingResult('{"tags":["a",null,"b"],"altText":null}');
      expect(normalizeTags(r.tags)).toEqual(['a', 'b']);
      expect(normalizeAltText(r.altText)).toBeNull();
    });
  });
});
