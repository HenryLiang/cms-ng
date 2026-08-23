/**
 * Hacker News -- 移植自 newsnow server/sources/hackernews.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import * as cheerio from 'cheerio';
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

export async function fetchHackernews(): Promise<NewsItem[]> {
  const baseURL = 'https://news.ycombinator.com';
  const html: string = await myFetch(baseURL);
  const $ = cheerio.load(html);
  const $main = $('.athing');
  const news: NewsItem[] = [];
  $main.each((_, el) => {
    const a = $(el).find('.titleline a').first();
    const title = a.text();
    const id = $(el).attr('id');
    const score = $(`#score_${id}`).text();
    const url = `${baseURL}/item?id=${id}`;
    if (url && id && title) {
      news.push({
        url,
        title,
        id,
        extra: {
          info: score,
        },
      });
    }
  });
  return news;
}
