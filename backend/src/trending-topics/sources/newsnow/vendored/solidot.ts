/**
 * Solidot -- 移植自 newsnow server/sources/solidot.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:上游用 defineRSSSource(自研 rss2json + fast-xml-parser);
 * 这里改用 backend 已有的 rss-parser(RssTopicSourceAdapter 同款),少一个依赖。
 */
import Parser from 'rss-parser';
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface SolidotItem {
  title?: string;
  contentSnippet?: string;
  summary?: string;
  link?: string;
}

interface SolidotFeed {
  items?: SolidotItem[];
}

/**
 * rss-parser 的最小结构类型。仓库里 src/types/google-trends-api.d.ts 的
 * 局部 ambient 声明(非泛型类+方法级泛型)与包自带类型(类级泛型)并存,
 * 不同编译视图(tsc build / ts-node / eslint projectService)看到的签名
 * 不一致;通过 as unknown as 收敛到本地结构类型,任何视图下都类型安全。
 */
interface RssStringParser {
  parseString(xml: string): Promise<SolidotFeed>;
}

export async function fetchSolidot(): Promise<NewsItem[]> {
  const parser = new Parser() as unknown as RssStringParser;
  const xml: string = await myFetch('https://www.solidot.org/index.rss');
  const feed = await parser.parseString(xml);
  return (feed.items ?? []).map((item) => ({
    id: item.link ?? item.title ?? '',
    title: item.title ?? '',
    url: item.link ?? '',
    extra: {
      hover: item.contentSnippet || item.summary || undefined,
    },
  }));
}
