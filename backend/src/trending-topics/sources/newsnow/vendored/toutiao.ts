/**
 * 今日头条热榜 -- 移植自 newsnow server/sources/toutiao.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    ClusterIdStr: string;
    Title: string;
    HotValue: string;
    Image: {
      url: string;
    };
    LabelUri?: {
      url: string;
    };
  }[];
}

export async function fetchToutiaoHot(): Promise<NewsItem[]> {
  const url = 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc';
  const res: Res = await myFetch(url);
  return res.data.map((k) => {
    return {
      id: k.ClusterIdStr,
      title: k.Title,
      url: `https://www.toutiao.com/trending/${k.ClusterIdStr}/`,
    };
  });
}
