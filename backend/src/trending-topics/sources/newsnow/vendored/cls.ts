/**
 * 财联社(电报/深度/热门)-- 移植自 newsnow server/sources/cls/index.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource Record 导出拆为三个具名 getter;签名工具移至 cls-utils.ts。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';
import { getClsSearchParams } from './cls-utils';

interface Item {
  id: number;
  title?: string;
  brief: string;
  shareurl: string;
  // need *1000
  ctime: number;
  // 1
  is_ad: number;
}

interface TelegraphRes {
  data: {
    roll_data: Item[];
  };
}

interface Depthes {
  data: {
    top_article: Item[];
    depth_list: Item[];
  };
}

interface Hot {
  data: Item[];
}

export async function fetchClsDepth(): Promise<NewsItem[]> {
  const apiUrl = `https://www.cls.cn/v3/depth/home/assembled/1000`;
  const res: Depthes = await myFetch(apiUrl, {
    query: Object.fromEntries(getClsSearchParams()),
  });
  return [...res.data.depth_list]
    .sort((m, n) => n.ctime - m.ctime)
    .map((k) => {
      return {
        id: k.id,
        title: k.title || k.brief,
        mobileUrl: k.shareurl,
        url: `https://www.cls.cn/detail/${k.id}`,
      };
    });
}

export async function fetchClsHot(): Promise<NewsItem[]> {
  const apiUrl = `https://www.cls.cn/v2/article/hot/list`;
  const res: Hot = await myFetch(apiUrl, {
    query: Object.fromEntries(getClsSearchParams()),
  });
  return res.data.map((k) => {
    return {
      id: k.id,
      title: k.title || k.brief,
      mobileUrl: k.shareurl,
      url: `https://www.cls.cn/detail/${k.id}`,
    };
  });
}

export async function fetchClsTelegraph(): Promise<NewsItem[]> {
  const apiUrl = `https://www.cls.cn/v1/roll/get_roll_list`;
  const res: TelegraphRes = await myFetch(apiUrl, {
    query: Object.fromEntries(
      getClsSearchParams({
        last_time: Math.floor(Date.now() / 1000),
        refresh_type: 1,
        rn: 30,
      }),
    ),
    headers: {
      Referer: 'https://www.cls.cn/telegraph',
    },
  });
  return res.data.roll_data
    .filter((k) => !k.is_ad)
    .map((k) => {
      return {
        id: k.id,
        title: k.title || k.brief,
        mobileUrl: k.shareurl,
        pubDate: k.ctime * 1000,
        url: `https://www.cls.cn/detail/${k.id}`,
      };
    });
}
