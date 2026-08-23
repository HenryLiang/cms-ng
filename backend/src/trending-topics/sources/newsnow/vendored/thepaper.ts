/**
 * 澎湃热榜 -- 移植自 newsnow server/sources/thepaper.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    hotNews: {
      contId: string;
      name: string;
      pubTimeLong: string;
    }[];
  };
}

export async function fetchThepaperHot(): Promise<NewsItem[]> {
  const url = 'https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar';
  const res: Res = await myFetch(url);
  return res.data.hotNews.map((k) => {
    return {
      id: k.contId,
      title: k.name,
      url: `https://www.thepaper.cn/newsDetail_forward_${k.contId}`,
      mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${k.contId}`,
    };
  });
}
