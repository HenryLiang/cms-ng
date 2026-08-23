/**
 * GitHub Trending -- 移植自 newsnow server/sources/github.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource Record 导出仅保留 github-trending-today getter。
 */
import * as cheerio from 'cheerio';
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

export async function fetchGithubTrending(): Promise<NewsItem[]> {
  const baseURL = 'https://github.com';
  const html: string = await myFetch(
    'https://github.com/trending?spoken_language_code=',
  );
  const $ = cheerio.load(html);
  const $main = $('main .Box div[data-hpc] > article');
  const news: NewsItem[] = [];
  $main.each((_, el) => {
    const a = $(el).find('>h2 a');
    const title = a.text().replace(/\n+/g, '').trim();
    const url = a.attr('href');
    const star = $(el)
      .find('[href$=stargazers]')
      .text()
      .replace(/\s+/g, '')
      .trim();
    const desc = $(el).find('>p').text().replace(/\n+/g, '').trim();
    if (url && title) {
      news.push({
        url: `${baseURL}${url}`,
        title,
        id: url,
        extra: {
          info: `✰ ${star}`,
          hover: desc,
        },
      });
    }
  });
  return news;
}
