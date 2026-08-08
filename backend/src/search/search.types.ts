/**
 * 媒体资产 ES 文档。
 *
 * 序列化契约(PRD §4.2):tags/aiTags 在 DB 是 JSON string,写入 ES 前必须
 * `safeJsonParse` 为数组——整串写入会导致 keyword term 查询永远 miss、
 * text 分词出引号噪声。status/source 与 DB 同步(MySQL 为唯一事实源)。
 */
export interface MediaSearchDoc {
  id: string;
  fileName: string;
  title: string | null;
  altText: string | null;
  description: string | null;
  prompt: string | null;
  tags: string[];
  aiTags: string[];
  ownerId: string;
  status: string;
  source: string;
  mimeType: string;
  createdAt: string; // ISO 8601
}

/** searchMedia 入参(与 QueryMediaDto 对齐,后端侧已解析分页) */
export interface MediaSearchQuery {
  ownerId: string;
  status: string;
  search?: string;
  tag?: string;
  source?: string;
  /** MIME 大类过滤('image'|'video'|'audio',prefix 匹配 mimeType keyword) */
  mimePrefix?: string;
  page: number;
  pageSize: number;
}

/** searchMedia 返回:匹配 id 列表(本页,按相关性/createdAt desc)+ ES 侧命中总数 */
export interface MediaSearchResult {
  ids: string[];
  total: number;
}
