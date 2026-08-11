import type { Article } from '@prisma/client';
import type { ArticleSearchDoc } from './search.types';
import { safeJsonParse } from '../common/json.utils';

/** 稿件索引与媒体索引分离，便于独立回填和 mapping 演进。 */
export const ARTICLE_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
} as const;

/** 标题和正文使用 IK 中文分词；其余字段用于权限过滤与稳定排序。 */
export const ARTICLE_INDEX_MAPPINGS = {
  properties: {
    id: { type: 'keyword' },
    title: { type: 'text', analyzer: 'ik_max_word' },
    content: { type: 'text', analyzer: 'ik_max_word' },
    tags: {
      type: 'text',
      analyzer: 'ik_max_word',
      fields: { keyword: { type: 'keyword', ignore_above: 100 } },
    },
    authorId: { type: 'keyword' },
    editorId: { type: 'keyword' },
    status: { type: 'keyword' },
    storyId: { type: 'keyword' },
    updatedAt: { type: 'date' },
  },
} as const;

/** TipTap HTML -> 可检索纯文本；这里只做索引归一化，不作为安全过滤器。 */
function toSearchableText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** DB 稿件行 -> ES 检索投影。 */
export function buildArticleSearchDoc(article: Article): ArticleSearchDoc {
  const parsedTags = safeJsonParse<unknown>(article.tags, []);
  const tags = Array.isArray(parsedTags)
    ? parsedTags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  return {
    id: article.id,
    title: article.title,
    content: toSearchableText(article.content),
    tags,
    authorId: article.authorId,
    editorId: article.editorId,
    status: article.status,
    storyId: article.storyId,
    updatedAt: article.updatedAt.toISOString(),
  };
}

/** ES external version：阻止历史回填或旧投影覆盖更新后的稿件。 */
export function getArticleSearchVersion(article: Pick<Article, 'updatedAt'>) {
  return article.updatedAt.getTime();
}

/**
 * 回填允许同一数据库版本覆盖，以便补充新 mapping 字段；版本更高的实时文档仍受保护。
 */
export function buildArticleSearchBackfillAction(
  index: string,
  article: Article,
) {
  return {
    index: {
      _index: index,
      _id: article.id,
      version: getArticleSearchVersion(article),
      version_type: 'external_gte' as const,
    },
  };
}
