/**
 * IT之家 -- 移植自 newsnow server/sources/ithome.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:parseRelativeDate 替换为本地 parseShanghaiRelativeDate。
 */
import * as cheerio from 'cheerio';
import { myFetch } from '../newsnow-http.client';
import { parseShanghaiRelativeDate } from '../newsnow-date.util';
import type { NewsItem } from '../newsnow.types';

export async function fetchIthomeNews(): Promise<NewsItem[]> {
  const response: string = await myFetch('https://www.ithome.com/list/');
  const $ = cheerio.load(response);
  const $main = $('#list > div.fl > ul > li');
  const news: NewsItem[] = [];
  $main.each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a.t');
    const url = $a.attr('href');
    const title = $a.text();
    const date = $(el).find('i').text();
    if (url && title && date) {
      const isAd =
        url?.includes('lapin') ||
        ['神券', '优惠', '补贴', '京东'].find((k) => title.includes(k));
      if (!isAd) {
        news.push({
          url,
          title,
          id: url,
          pubDate: parseShanghaiRelativeDate(date),
        });
      }
    }
  });
  return news.sort((m, n) => (n.pubDate! < m.pubDate! ? -1 : 1));
}
