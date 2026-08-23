/**
 * 格隆汇要闻 -- 移植自 newsnow server/sources/gelonghui.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:parseRelativeDate 替换为本地 parseShanghaiRelativeDate。
 */
import * as cheerio from 'cheerio';
import { myFetch } from '../newsnow-http.client';
import { parseShanghaiRelativeDate } from '../newsnow-date.util';
import type { NewsItem } from '../newsnow.types';

export async function fetchGelonghuiNews(): Promise<NewsItem[]> {
  const baseURL = 'https://www.gelonghui.com';
  const html: string = await myFetch('https://www.gelonghui.com/news/');
  const $ = cheerio.load(html);
  const $main = $('.article-content');
  const news: NewsItem[] = [];
  $main.each((_, el) => {
    const a = $(el).find('.detail-right>a');
    const url = a.attr('href');
    const title = a.find('h2').text();
    const info = $(el).find('.time > span:nth-child(1)').text();
    // 第三个 p
    const relatieveTime = $(el).find('.time > span:nth-child(3)').text();
    if (url && title && relatieveTime) {
      news.push({
        url: baseURL + url,
        title,
        id: url,
        extra: {
          date: parseShanghaiRelativeDate(relatieveTime),
          info,
        },
      });
    }
  });
  return news;
}
