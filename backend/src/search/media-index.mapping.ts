import type { MediaAsset } from '@prisma/client';
import { safeJsonParse } from '../common/json.utils';
import type { MediaSearchDoc } from './search.types';

/**
 * 媒体索引 mapping + 文档构建(纯函数/常量,无 Nest 依赖)。
 *
 * SearchService(运行时事件投影)与 scripts/reindex-media-search.ts(全量重建)
 * 共用此模块,保证 mapping 与序列化契约单一事实源、不漂移(PRD §4.2 / D7)。
 */

export const MEDIA_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
} as const;

/** IK 中文分词;tags/aiTags/fileName 带 keyword 子字段供精确 term 过滤 */
export const MEDIA_INDEX_MAPPINGS = {
  properties: {
    // _id 不参与排序/分页;独立 keyword 供 createdAt 并列时稳定 tiebreak
    id: { type: 'keyword' },
    fileName: {
      type: 'text',
      analyzer: 'ik_max_word',
      fields: { keyword: { type: 'keyword' } },
    },
    title: { type: 'text', analyzer: 'ik_max_word' },
    altText: { type: 'text', analyzer: 'ik_max_word' },
    description: { type: 'text', analyzer: 'ik_max_word' },
    prompt: { type: 'text', analyzer: 'ik_max_word' },
    tags: {
      type: 'text',
      analyzer: 'ik_max_word',
      fields: { keyword: { type: 'keyword' } },
    },
    aiTags: {
      type: 'text',
      analyzer: 'ik_max_word',
      fields: { keyword: { type: 'keyword' } },
    },
    ownerId: { type: 'keyword' },
    status: { type: 'keyword' },
    source: { type: 'keyword' },
    mimeType: { type: 'keyword' },
    createdAt: { type: 'date' },
  },
} as const;

/**
 * DB JSON string -> string[](容错:解析成功但非字符串数组 -> 空数组)。
 * 防止脏数据(`'{"a":1}'` / `'[1,2]'`)写入 ES 产生 keyword term 噪声。
 */
function toStrArray(json: string | null): string[] {
  const v = safeJsonParse<unknown>(json, []);
  return Array.isArray(v)
    ? v.filter((t): t is string => typeof t === 'string')
    : [];
}

/**
 * DB 行 -> ES 文档。tags/aiTags 由 JSON string 解析为数组(序列化契约):
 * 整串写入会导致 keyword term 查询永远 miss、text 分词出引号噪声。
 */
export function buildMediaSearchDoc(asset: MediaAsset): MediaSearchDoc {
  return {
    id: asset.id,
    fileName: asset.fileName,
    title: asset.title,
    altText: asset.altText,
    description: asset.description,
    prompt: asset.prompt,
    tags: toStrArray(asset.tags),
    aiTags: toStrArray(asset.aiTags),
    ownerId: asset.ownerId,
    status: asset.status,
    source: asset.source,
    mimeType: asset.mimeType,
    createdAt: asset.createdAt.toISOString(),
  };
}
