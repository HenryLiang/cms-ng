import DOMPurify from 'dompurify';

/**
 * 全站唯一允许配合 dangerouslySetInnerHTML 的 HTML 净化入口。
 * 任何富文本 HTML 在渲染或送入 TipTap 前必须经过这里。
 */
const ALLOWED_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'blockquote',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'code',
  'pre',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

const ALLOWED_ATTR = ['href'];

export function sanitizeHtml(dirty: string): string {
  // 预览组件仅在用户交互后挂载，SSR 阶段不会触达危险 sink；
  // DOMPurify 需要 DOM，服务端环境直接返回原文。
  if (typeof window === 'undefined') {
    return dirty;
  }
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
  });
}
