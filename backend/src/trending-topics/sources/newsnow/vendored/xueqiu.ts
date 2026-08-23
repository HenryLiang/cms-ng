/**
 * 雪球热股 -- 移植自 newsnow server/sources/xueqiu.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:$fetch.raw 取 Set-Cookie 改为 fetchResponseCookies 助手;
 * 仅保留 xueqiu-hotstock getter。
 */
import { fetchResponseCookies, myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface StockRes {
  data: {
    items: {
      code: string;
      name: string;
      percent: number;
      exchange: string;
      // 1
      ad: number;
    }[];
  };
}

export async function fetchXueqiuHotStock(): Promise<NewsItem[]> {
  const url =
    'https://stock.xueqiu.com/v5/stock/hot_stock/list.json?size=30&_type=10&type=10';
  const cookie = await fetchResponseCookies('https://xueqiu.com/hq');
  const res: StockRes = await myFetch(url, {
    headers: {
      cookie: cookie.join('; '),
    },
  });
  return res.data.items
    .filter((k) => !k.ad)
    .map((k) => ({
      id: k.code,
      url: `https://xueqiu.com/s/${k.code}`,
      title: k.name,
      extra: {
        info: `${k.percent}% ${k.exchange}`,
      },
    }));
}
