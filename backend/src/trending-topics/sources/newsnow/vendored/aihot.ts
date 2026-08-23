/**
 * AI 热榜 -- 移植自 newsnow server/sources/aihot.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:去掉上游的 RSS 兜底分支(defineRSSSource + fast-xml-parser 依赖);
 * API 失败时由 adapter 统一 fail-open(status:'degraded'),语义等价。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface AIHotItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt?: string | null;
  summary?: string | null;
  category?: string | null;
}

interface AIHotResponse {
  items?: AIHotItem[];
}

export async function fetchAihot(): Promise<NewsItem[]> {
  const response = await myFetch<AIHotResponse>(
    'https://aihot.virxact.com/api/public/items?mode=all&take=30',
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 aihot-skill/0.2.0 newsnow/0.0.40',
      },
    },
  );

  const items =
    response.items?.filter((item) => item.id && item.title && item.url) ?? [];
  if (!items.length) throw new Error('AI 热榜返回空数据');

  return items.map<NewsItem>((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    pubDate: item.publishedAt ?? undefined,
    extra: {
      hover: item.summary ?? undefined,
      info: item.category ? `${item.source} · ${item.category}` : item.source,
    },
  }));
}
