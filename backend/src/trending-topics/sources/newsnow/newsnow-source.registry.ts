/**
 * newsnow 源注册表 -- 把 vendored 抓取器映射为 CMS 的 TopicSourceDefinition。
 *
 * 一个 entry 对应选题页数据源面板里的一个可选项(id 统一加 `newsnow-`
 * 前缀,避免与 RSS/RSSHub 源冲突)。cacheTtlSeconds 参考上游各源的刷新
 * 间隔(Realtime 2min / Fast 5min / Default 10min / Common 30min)分档:
 * 快讯类 120s、热搜榜类 300s、文章列表类 1800s。
 */
import type {
  TopicSourceCategory,
  TopicSourceDefinition,
} from '../topic-source.types';
import type { NewsItemGetter } from './newsnow.types';
import { fetchAihot } from './vendored/aihot';
import { fetchBaiduHot } from './vendored/baidu';
import { fetchClsDepth, fetchClsHot, fetchClsTelegraph } from './vendored/cls';
import { fetchCankaoxiaoxi } from './vendored/cankaoxiaoxi';
import { fetchDouyinHot } from './vendored/douyin';
import { fetchGithubTrending } from './vendored/github';
import { fetchGelonghuiNews } from './vendored/gelonghui';
import { fetchHackernews } from './vendored/hackernews';
import { fetchHupuHot } from './vendored/hupu';
import { fetchIfengNews } from './vendored/ifeng';
import { fetchIthomeNews } from './vendored/ithome';
import { fetchJin10Flash } from './vendored/jin10';
import { fetchJuejinHot } from './vendored/juejin';
import { fetchKaopuHot } from './vendored/kaopu';
import { fetchKuaishouHot } from './vendored/kuaishou';
import { fetchMktnewsFlash } from './vendored/mktnews';
import { fetchNowcoderHot } from './vendored/nowcoder';
import { fetchSolidot } from './vendored/solidot';
import { fetchSputniknewsCn } from './vendored/sputniknewscn';
import { fetchSspaiHot } from './vendored/sspai';
import { fetchTencentHot } from './vendored/tencent';
import { fetchThepaperHot } from './vendored/thepaper';
import { fetchTiebaHot } from './vendored/tieba';
import { fetchToutiaoHot } from './vendored/toutiao';
import {
  fetchWallstreetcnHot,
  fetchWallstreetcnNews,
  fetchWallstreetcnQuick,
} from './vendored/wallstreetcn';
import { fetchXueqiuHotStock } from './vendored/xueqiu';

export interface NewsnowSourceEntry {
  /** CMS 数据源 id(带 newsnow- 前缀)。 */
  id: string;
  label: string;
  category: TopicSourceCategory;
  icon: TopicSourceDefinition['icon'];
  getter: NewsItemGetter;
  cacheTtlSeconds: number;
}

const FLASH_TTL = 120;
const BOARD_TTL = 300;
const LIST_TTL = 1800;
const FEED_TTL = 600;

export const NEWSNOW_SOURCE_ENTRIES: NewsnowSourceEntry[] = [
  // ── 国内热搜榜 ──
  {
    id: 'newsnow-baidu',
    label: '百度热搜',
    category: 'trending',
    icon: 'flame',
    getter: fetchBaiduHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-douyin',
    label: '抖音热点',
    category: 'trending',
    icon: 'flame',
    getter: fetchDouyinHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-toutiao',
    label: '头条热榜',
    category: 'trending',
    icon: 'flame',
    getter: fetchToutiaoHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-tieba',
    label: '贴吧热议',
    category: 'trending',
    icon: 'social',
    getter: fetchTiebaHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-kuaishou',
    label: '快手热榜',
    category: 'trending',
    icon: 'video',
    getter: fetchKuaishouHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-hupu',
    label: '虎扑步行街',
    category: 'trending',
    icon: 'social',
    getter: fetchHupuHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-tencent-hot',
    label: '腾讯热点',
    category: 'trending',
    icon: 'flame',
    getter: fetchTencentHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-kaopu',
    label: '靠谱热搜',
    category: 'trending',
    icon: 'trending',
    getter: fetchKaopuHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-thepaper',
    label: '澎湃热榜',
    category: 'news',
    icon: 'newspaper',
    getter: fetchThepaperHot,
    cacheTtlSeconds: BOARD_TTL,
  },
  {
    id: 'newsnow-ifeng',
    label: '凤凰网',
    category: 'news',
    icon: 'newspaper',
    getter: fetchIfengNews,
    cacheTtlSeconds: FEED_TTL,
  },

  // ── 财经 ──
  {
    id: 'newsnow-cls-telegraph',
    label: '财联社电报',
    category: 'news',
    icon: 'newspaper',
    getter: fetchClsTelegraph,
    cacheTtlSeconds: FLASH_TTL,
  },
  {
    id: 'newsnow-cls-hot',
    label: '财联社热门',
    category: 'news',
    icon: 'newspaper',
    getter: fetchClsHot,
    cacheTtlSeconds: LIST_TTL,
  },
  {
    id: 'newsnow-cls-depth',
    label: '财联社深度',
    category: 'news',
    icon: 'newspaper',
    getter: fetchClsDepth,
    cacheTtlSeconds: LIST_TTL,
  },
  {
    id: 'newsnow-wallstreetcn-quick',
    label: '华尔街见闻快讯',
    category: 'news',
    icon: 'newspaper',
    getter: fetchWallstreetcnQuick,
    cacheTtlSeconds: FLASH_TTL,
  },
  {
    id: 'newsnow-wallstreetcn-news',
    label: '华尔街见闻要闻',
    category: 'news',
    icon: 'newspaper',
    getter: fetchWallstreetcnNews,
    cacheTtlSeconds: LIST_TTL,
  },
  {
    id: 'newsnow-wallstreetcn-hot',
    label: '华尔街见闻最热',
    category: 'news',
    icon: 'newspaper',
    getter: fetchWallstreetcnHot,
    cacheTtlSeconds: LIST_TTL,
  },
  {
    id: 'newsnow-jin10',
    label: '金十快讯',
    category: 'news',
    icon: 'newspaper',
    getter: fetchJin10Flash,
    cacheTtlSeconds: FLASH_TTL,
  },
  {
    id: 'newsnow-gelonghui',
    label: '格隆汇要闻',
    category: 'news',
    icon: 'newspaper',
    getter: fetchGelonghuiNews,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-mktnews-flash',
    label: 'MKT快讯',
    category: 'news',
    icon: 'newspaper',
    getter: fetchMktnewsFlash,
    cacheTtlSeconds: FLASH_TTL,
  },
  {
    id: 'newsnow-xueqiu-hotstock',
    label: '雪球热股',
    category: 'trending',
    icon: 'trending',
    getter: fetchXueqiuHotStock,
    cacheTtlSeconds: BOARD_TTL,
  },

  // ── 科技/开发者 ──
  {
    id: 'newsnow-aihot',
    label: 'AI 热榜',
    category: 'news',
    icon: 'newspaper',
    getter: fetchAihot,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-ithome',
    label: 'IT之家',
    category: 'news',
    icon: 'newspaper',
    getter: fetchIthomeNews,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-sspai',
    label: '少数派热文',
    category: 'news',
    icon: 'newspaper',
    getter: fetchSspaiHot,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-juejin',
    label: '掘金热榜',
    category: 'social',
    icon: 'social',
    getter: fetchJuejinHot,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-nowcoder',
    label: '牛客热搜',
    category: 'social',
    icon: 'social',
    getter: fetchNowcoderHot,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-hackernews',
    label: 'Hacker News',
    category: 'social',
    icon: 'social',
    getter: fetchHackernews,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-github-trending',
    label: 'GitHub Trending',
    category: 'social',
    icon: 'social',
    getter: fetchGithubTrending,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-solidot',
    label: 'Solidot',
    category: 'news',
    icon: 'newspaper',
    getter: fetchSolidot,
    cacheTtlSeconds: FEED_TTL,
  },

  // ── 国际中文媒体 ──
  {
    id: 'newsnow-cankaoxiaoxi',
    label: '参考消息',
    category: 'news',
    icon: 'newspaper',
    getter: fetchCankaoxiaoxi,
    cacheTtlSeconds: FEED_TTL,
  },
  {
    id: 'newsnow-sputniknewscn',
    label: '卫星通讯社',
    category: 'news',
    icon: 'newspaper',
    getter: fetchSputniknewsCn,
    cacheTtlSeconds: FEED_TTL,
  },
];

export function findNewsnowEntry(
  sourceId: string,
): NewsnowSourceEntry | undefined {
  return NEWSNOW_SOURCE_ENTRIES.find((entry) => entry.id === sourceId);
}
