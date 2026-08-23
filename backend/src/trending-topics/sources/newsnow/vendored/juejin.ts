/**
 * 掘金热榜 -- 移植自 newsnow server/sources/juejin.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    content: {
      title: string;
      content_id: string;
    };
  }[];
}

export async function fetchJuejinHot(): Promise<NewsItem[]> {
  const url = `https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot&spider=0`;
  const res: Res = await myFetch(url);
  return res.data.map((k) => {
    const url = `https://juejin.cn/post/${k.content.content_id}`;
    return {
      id: k.content.content_id,
      title: k.content.title,
      url,
    };
  });
}
