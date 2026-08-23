/**
 * 金十数据快讯 -- 移植自 newsnow server/sources/jin10.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:tranformToUTC(dayjs tz 插件)替换为本地 shanghaiDateTimeToTimestamp。
 */
import { myFetch } from '../newsnow-http.client';
import { shanghaiDateTimeToTimestamp } from '../newsnow-date.util';
import type { NewsItem } from '../newsnow.types';

interface Jin10Item {
  id: string;
  time: string;
  type: number;
  data: {
    pic?: string;
    title?: string;
    source?: string;
    content?: string;
    source_link?: string;
    vip_title?: string;
    lock?: boolean;
    vip_level?: number;
    vip_desc?: string;
  };
  important: number;
  tags: string[];
  channel: number[];
  remark: unknown[];
}

export async function fetchJin10Flash(): Promise<NewsItem[]> {
  const timestamp = Date.now();
  const url = `https://www.jin10.com/flash_newest.js?t=${timestamp}`;

  const rawData: string = await myFetch(url);

  const jsonStr = rawData
    .replace(/^var\s+newest\s*=\s*/, '') // 移除开头的变量声明
    .replace(/;*$/, '') // 移除末尾可能存在的分号
    .trim(); // 移除首尾空白字符
  const data = JSON.parse(jsonStr) as Jin10Item[];

  return data
    .filter((k) => (k.data.title || k.data.content) && !k.channel?.includes(5))
    .map((k) => {
      const text = (k.data.title || k.data.content)!.replace(/<\/?b>/g, '');
      const [, title, desc] = text.match(/^【([^】]*)】(.*)$/) ?? [];
      return {
        id: k.id,
        title: title ?? text,
        pubDate: shanghaiDateTimeToTimestamp(k.time),
        url: `https://flash.jin10.com/detail/${k.id}`,
        extra: {
          hover: desc,
          info: !!k.important && '✰',
        },
      };
    });
}
