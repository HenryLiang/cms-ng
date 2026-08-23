/**
 * 抖音热点 -- 移植自 newsnow server/sources/douyin.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:$fetch.raw 取 Set-Cookie 改为 fetchResponseCookies 助手。
 */
import { fetchResponseCookies, myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    word_list: {
      sentence_id: string;
      word: string;
      event_time: string;
      hot_value: string;
    }[];
  };
}

export async function fetchDouyinHot(): Promise<NewsItem[]> {
  const url =
    'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1';
  const cookie = await fetchResponseCookies('https://login.douyin.com/');
  const res: Res = await myFetch(url, {
    headers: {
      cookie: cookie.join('; '),
    },
  });
  return res.data.word_list.map((k) => {
    return {
      id: k.sentence_id,
      title: k.word,
      url: `https://www.douyin.com/hot/${k.sentence_id}`,
    };
  });
}
