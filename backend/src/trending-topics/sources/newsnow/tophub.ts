/**
 * tophub 镜像榜 -- 本地扩展源(非 newsnow 上游移植,上游无对应文件)。
 *
 * tophub.today 聚合并镜像全网热榜(含签名/登录墙后的小红书、公众号)，
 * 经 RSSHub `/tophub/:id` 路由转为标准 RSS。数据路径:
 * 后端 -> RSSHub 容器 /tophub/:id -> tophub.today 榜单镜像。
 * 依赖级别与 weibo-hot/zhihu-hot 等 RSSHub 源一致:RSSHub 不可用时由
 * adapter fail-open 为 unavailable,不影响其他源。
 *
 * RSSHub 地址走 configureNewsnowClient 注入的 rssHubUrl(adapter 从
 * ConfigService 读 RSS_HUB_URL),脚本侧需自行 configure 或接受
 * localhost:1200 默认值。注册的节点清单见 newsnow-source.registry.ts
 * 的 TOPHUB_BOARDS。
 */
import * as cheerio from 'cheerio';
import { getNewsnowRssHubUrl, myFetch } from './newsnow-http.client';
import type { NewsItem, NewsItemGetter } from './newsnow.types';

/** 裸热度数字(如 "10.0万"/"918.6w"),透出时加「热度 」前缀。 */
const BARE_HEAT_RE = /^[0-9][0-9.,]*\s*[万亿wW]?(人在看)?$/;

async function fetchTophubBoard(node: string): Promise<NewsItem[]> {
  // responseType 钉死为 text:ofetch 按 Content-Type 嗅探时,IANA 注册的
  // application/rss+xml 不落 text/json 分支会返回 Blob,cheerio 静默解析
  // 成空文档。类型守卫兜底:非文本响应当失败处理,走 adapter fail-open。
  const xml = await myFetch<string, 'text'>(
    `${getNewsnowRssHubUrl()}/tophub/${node}`,
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
    const rawDesc = $el.find('description').first().text().trim();
    if (!title || !link || seen.has(link)) return;
    seen.add(link);

    news.push({
      id: link,
      title,
      url: link,
      // tophub 的 description 多为热度(如 "918.6w"),裸数字加前缀避免被
      // 当成正文;其余信息文本(如豆瓣 "714篇内容 · 47.4万次浏览")原样
      // 透出到 extra.hover(adapter 映射为 description)
      extra: rawDesc
        ? {
            hover: BARE_HEAT_RE.test(rawDesc) ? `热度 ${rawDesc}` : rawDesc,
          }
        : undefined,
    });
  });

  return news;
}

/** 构造指定 tophub 节点的抓取器(registry entry 的 getter)。 */
export function createTophubGetter(node: string): NewsItemGetter {
  return () => fetchTophubBoard(node);
}
