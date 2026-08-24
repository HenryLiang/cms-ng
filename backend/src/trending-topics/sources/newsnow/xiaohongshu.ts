/**
 * 小红书热榜 -- 本地扩展源(非 newsnow 上游移植,上游无对应文件)。
 *
 * 小红书官方 Web 接口需要 x-s/x-t 签名 + 登录态,无法直连。数据路径:
 * 后端 -> RSSHub 容器 /tophub/L4MdA5ldxD -> tophub.today 小红书热榜镜像。
 * 依赖级别与 weibo-hot/zhihu-hot 等 RSSHub 源一致:RSSHub 不可用时由
 * adapter fail-open 为 unavailable,不影响其他源。条目 description 为
 * 热度文本(如 "918.6w"),透出到 extra.hover(adapter 映射为
 * description)。
 */
import * as cheerio from 'cheerio';
import { myFetch } from './newsnow-http.client';
import type { NewsItem } from './newsnow.types';

const TOPHUB_XHS_NODE = 'L4MdA5ldxD';

export async function fetchXiaohongshuHot(): Promise<NewsItem[]> {
  const rssHubUrl = process.env.RSS_HUB_URL || 'http://localhost:1200';
  // ofetch 按 Content-Type 自动识别 RSS XML -> 文本
  const xml = await myFetch<string>(`${rssHubUrl}/tophub/${TOPHUB_XHS_NODE}`);
  const $ = cheerio.load(xml, { xml: true });
  const news: NewsItem[] = [];
  const seen = new Set<string>();

  $('item').each((_, el) => {
    const $el = $(el);
    const title = $el.find('title').first().text().trim();
    const link = $el.find('link').first().text().trim();
    const heat = $el.find('description').first().text().trim();
    if (!title || !link || seen.has(link)) return;
    seen.add(link);

    news.push({
      id: link,
      title,
      url: link,
      extra: heat ? { hover: heat } : undefined,
    });
  });

  return news;
}
