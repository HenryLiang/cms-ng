/**
 * 参考消息 -- 移植自 newsnow server/sources/cankaoxiaoxi.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:tranformToUTC(dayjs tz 插件)替换为本地 shanghaiDateTimeToTimestamp。
 */
import { myFetch } from '../newsnow-http.client';
import { shanghaiDateTimeToTimestamp } from '../newsnow-date.util';
import type { NewsItem } from '../newsnow.types';

interface Res {
  list: {
    data: {
      id: string;
      title: string;
      // 北京时间
      url: string;
      publishTime: string;
    };
  }[];
}

export async function fetchCankaoxiaoxi(): Promise<NewsItem[]> {
  const res = (await Promise.all(
    ['zhongguo', 'guandian', 'gj'].map((k) =>
      myFetch(`http://china.cankaoxiaoxi.com/json/channel/${k}/list.json`),
    ),
  )) as Res[];
  return res
    .map((k) => k.list)
    .flat()
    .map((k) => ({
      id: k.data.id,
      title: k.data.title,
      extra: {
        date: shanghaiDateTimeToTimestamp(k.data.publishTime),
      },
      url: k.data.url,
    }))
    .sort((m, n) => (m.extra.date < n.extra.date ? 1 : -1));
}
