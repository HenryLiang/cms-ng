/**
 * newsnow 数据项类型 -- 移植自 https://github.com/ourongxing/newsnow
 * (shared/types.ts, MIT License, Copyright (c) ourongxing)。
 *
 * 每个 vendored 抓取器统一返回 `NewsItem[]`,由 adapter 统一映射为
 * TopicCandidate。类型保持与上游一致(含 extra 信息),便于后续 diff 同步。
 */
export interface NewsItem {
  id: string | number; // unique
  title: string;
  url: string;
  mobileUrl?: string;
  pubDate?: number | string;
  extra?: {
    hover?: string;
    date?: number | string;
    info?: false | string;
    diff?: number;
    icon?:
      | false
      | string
      | {
          url: string;
          scale: number;
        };
  };
}

export type NewsItemGetter = () => Promise<NewsItem[]>;
