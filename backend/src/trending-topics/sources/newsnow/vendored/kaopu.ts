/**
 * 靠谱热搜(多平台聚合)-- 移植自 newsnow server/sources/kaopu.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:parseRelativeDate(上游 dayjs 通用实现)替换为本地
 * parseShanghaiRelativeDate;responseType 'text' 由 ofetch 自动处理。
 */
import * as cheerio from 'cheerio';
import { myFetch } from '../newsnow-http.client';
import { parseShanghaiRelativeDate } from '../newsnow-date.util';
import type { NewsItem } from '../newsnow.types';

export async function fetchKaopuHot(): Promise<NewsItem[]> {
  const baseURL = 'https://kaopu.news';
  // ofetch 按 Content-Type 自动识别 HTML -> 文本
  const html = await myFetch<string>(baseURL);
  const $ = cheerio.load(html);
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  $('article').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a[href^="/story/"]').first().attr('href');
    const title = $el.find('h2').first().text().trim();
    const description = $el.find('p').first().text().trim();
    const date = $el.find('.story-meta span').first().text().trim();
    const source = $el.find('.story-provenance').first().text().trim();
    if (!href || !title || seen.has(href)) return;
    seen.add(href);

    news.push({
      id: href,
      title,
      pubDate: date ? parseShanghaiRelativeDate(date) : undefined,
      extra: {
        hover: description,
        info: source,
      },
      url: new URL(href, baseURL).toString(),
    });
  });

  return news;
}
