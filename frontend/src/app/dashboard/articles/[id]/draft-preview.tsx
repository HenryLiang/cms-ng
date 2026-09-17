'use client';

import { sanitizeHtml } from '@/lib/sanitize-html';

/**
 * AI 草稿正文预览。content 来自 AI 接口响应，属于不可信输入，
 * 渲染前必须经 sanitizeHtml 净化——这是全站唯一的 HTML sink。
 */
export default function DraftPreview({ content }: { content: string }) {
  return (
    <div
      className="prose prose-slate max-w-none mt-1 rounded-lg border border-line bg-canvas p-4"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
    />
  );
}
