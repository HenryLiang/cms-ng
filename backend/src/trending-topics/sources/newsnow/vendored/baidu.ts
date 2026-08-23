/**
 * 百度热搜 -- 移植自 newsnow server/sources/baidu.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装与 unimport 全局替换为显式 import + 具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    cards: {
      content: {
        isTop?: boolean;
        word: string;
        rawUrl: string;
        desc?: string;
      }[];
    }[];
  };
}

export async function fetchBaiduHot(): Promise<NewsItem[]> {
  const rawData: string = await myFetch(
    'https://top.baidu.com/board?tab=realtime',
  );
  const jsonStr = rawData.match(/<!--s-data:(.*?)-->/s);
  const data = JSON.parse(jsonStr![1]) as Res;

  return data.data.cards[0].content
    .filter((k) => !k.isTop)
    .map((k) => {
      return {
        id: k.rawUrl,
        title: k.word,
        url: k.rawUrl,
        extra: {
          hover: k.desc,
        },
      };
    });
}
