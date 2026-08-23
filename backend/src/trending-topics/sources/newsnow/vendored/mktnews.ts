/**
 * MKTNews 快讯 -- 移植自 newsnow server/sources/mktnews.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource Record 导出拆为单个具名 getter(mktnews-flash)。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Report {
  id: string;
  type: number;
  time: string;
  important: number;
  data: {
    content: string;
    pic: string;
    title: string;
  };
  remark: unknown[];
  hot: boolean;
  hot_start: string | null;
  hot_end: string | null;
  classify: {
    id: number;
    pid: number;
    name: string;
    parent: string;
  }[];
  impact: unknown[];
}

interface Res {
  status: number;
  data: Report[];
  message: string;
}

export async function fetchMktnewsFlash(): Promise<NewsItem[]> {
  const res: Res = await myFetch(
    'https://api.mktnews.net/api/flash?type=0&limit=50',
    {
      headers: {
        Origin: 'https://mktnews.net',
        Referer: 'https://mktnews.net/',
      },
    },
  );

  return res.data
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .map((item) => ({
      id: item.id,
      title:
        item.data.title ||
        item.data.content.match(/^【([^】]*)】(.*)$/)?.[1] ||
        item.data.content,
      pubDate: item.time,
      extra: {
        info: item.important === 1 ? 'Important' : undefined,
        hover: item.data.content,
      },
      url: `https://mktnews.net/flashDetail.html?id=${item.id}`,
    }));
}
