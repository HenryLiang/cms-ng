/**
 * 虎扑步行街热榜 -- 移植自 newsnow server/sources/hupu.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface HotItem {
  id: string;
  title: string;
  url: string;
  mobileUrl: string;
}

export async function fetchHupuHot(): Promise<NewsItem[]> {
  // 获取虎扑新热榜页面的HTML内容
  const html: string = await myFetch(`https://bbs.hupu.com/topic-daily-hot`);

  // 正则表达式匹配新的热榜项结构
  const regex =
    /<li class="bbs-sl-web-post-body">[\s\S]*?<a href="(\/[^"]+?\.html)"[^>]*?class="p-title"[^>]*>([^<]+)<\/a>/g;

  const result: HotItem[] = [];
  let match: RegExpExecArray | null;

  while (true) {
    match = regex.exec(html);
    if (!match) break;

    const [, path, title] = match;

    // 构建完整URL
    const url = `https://bbs.hupu.com${path}`;

    result.push({
      id: path,
      title: title.trim(),
      url,
      mobileUrl: url,
    });
  }

  return result;
}
