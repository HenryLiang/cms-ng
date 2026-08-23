/**
 * 腾讯热点(综合早报)-- 移植自 newsnow server/sources/tencent.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:上游同文件还导出 tencent 多频道结构,这里仅保留实际使用的
 * tencent-hot(综合早报)getter,具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface WapRes {
  ret: number;
  msg: string;
  data: {
    tabs: {
      articleList: {
        id: string;
        title: string;
        desc?: string;
        link_info: {
          url: string;
        };
      }[];
    }[];
  };
}

/** 综合早报 */
export async function fetchTencentHot(): Promise<NewsItem[]> {
  const url =
    'https://i.news.qq.com/web_backend/v2/getTagInfo?tagId=aEWqxLtdgmQ%3D';
  const res: WapRes = await myFetch<WapRes>(url, {
    headers: {
      Referer: 'https://news.qq.com/',
    },
  });
  return res.data.tabs[0].articleList.map((news) => ({
    id: news.id,
    title: news.title,
    url: news.link_info.url,
    extra: {
      hover: news.desc,
    },
  }));
}
