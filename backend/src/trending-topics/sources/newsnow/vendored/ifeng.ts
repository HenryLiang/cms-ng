/**
 * 凤凰网 -- 移植自 newsnow server/sources/ifeng.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

export async function fetchIfengNews(): Promise<NewsItem[]> {
  const html: string = await myFetch('https://www.ifeng.com/');
  const regex = /var\s+allData\s*=\s*(\{[\s\S]*?\});/;
  const match = regex.exec(html);
  const news: NewsItem[] = [];
  if (match) {
    const realData = JSON.parse(match[1]) as {
      hotNews1?: { url: string; title: string; newsTime: string }[];
    };
    const rawNews = realData.hotNews1 ?? [];
    rawNews.forEach((hotNews) => {
      news.push({
        id: hotNews.url,
        url: hotNews.url,
        title: hotNews.title,
        extra: {
          date: hotNews.newsTime,
        },
      });
    });
  }
  return news;
}
