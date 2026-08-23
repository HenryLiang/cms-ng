/**
 * 俄罗斯卫星通讯社(中文)-- 移植自 newsnow server/sources/sputniknewscn.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:去掉上游 proxySource 包装(仅 Cloudflare Pages 生效,Node 环境
 * 本就走直连分支);defineSource 包装替换为具名导出。
 */
import * as cheerio from 'cheerio';
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

export async function fetchSputniknewsCn(): Promise<NewsItem[]> {
  const response: string = await myFetch(
    'https://sputniknews.cn/services/widget/lenta/',
  );
  const $ = cheerio.load(response);
  const $items = $('.lenta__item');
  const news: NewsItem[] = [];
  $items.each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a');
    const url = $a.attr('href');
    const title = $a.find('.lenta__item-text').text();
    const date = $a.find('.lenta__item-date').attr('data-unixtime');
    if (url && title && date) {
      news.push({
        url: `https://sputniknews.cn${url}`,
        title,
        id: url,
        extra: {
          date: new Date(Number(`${date}000`)).getTime(),
        },
      });
    }
  });
  return news;
}
