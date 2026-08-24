/**
 * 小红书热榜 -- 本地扩展源(非 newsnow 上游移植,上游无对应文件)。
 *
 * 小红书官方 Web 接口需要 x-s/x-t 签名 + 登录态,无法直连。数据路径:
 * 后端 -> RSSHub 容器 /tophub/L4MdA5ldxD -> tophub.today 小红书热榜镜像。
 * 依赖级别与 weibo-hot/zhihu-hot 等 RSSHub 源一致:RSSHub 不可用时由
 * adapter fail-open 为 unavailable,不影响其他源。
 *
 * RSSHub 地址走 configureNewsnowClient 注入的 rssHubUrl(adapter 从
 * ConfigService 读 RSS_HUB_URL),脚本侧需自行 configure 或接受
 * localhost:1200 默认值。
 */
import * as cheerio from 'cheerio';
import { getNewsnowRssHubUrl, myFetch } from './newsnow-http.client';
import type { NewsItem } from './newsnow.types';

const TOPHUB_XHS_NODE = 'L4MdA5ldxD';

export async function fetchXiaohongshuHot(): Promise<NewsItem[]> {
  // responseType 钉死为 text:ofetch 按 Content-Type 嗅探时,IANA 注册的
  // application/rss+xml 不落 text/json 分支会返回 Blob,cheerio 静默解析
  // 成空文档。类型守卫兜底:非文本响应当失败处理,走 adapter fail-open。
  const xml = await myFetch<string, 'text'>(
    `${getNewsnowRssHubUrl()}/tophub/${TOPHUB_XHS_NODE}`,
    { responseType: 'text' },
  );
  if (typeof xml !== 'string') {
    throw new Error('RSSHub 返回了非文本响应');
  }
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
      // tophub 的 description 是热度文本(如 "918.6w"),加前缀后透出到
      // extra.hover(adapter 映射为 description),避免裸数字被当成正文
      extra: heat ? { hover: `热度 ${heat}` } : undefined,
    });
  });

  return news;
}
