/**
 * tophub 镜像榜(RSSHub /tophub/:id 路由)解析测试:mock myFetch,保留
 * 真实的 client 配置 seam,用最小 RSS fixture 验证 XML 解析/去重/热度
 * 透出/URL 配置/非文本响应守卫,以及 registry 全量注册完整性。
 */
jest.mock('./newsnow-http.client', () => {
  const actual = jest.requireActual('./newsnow-http.client');
  return { ...actual, myFetch: jest.fn() };
});

import {
  configureNewsnowClient,
  myFetch,
  resetNewsnowClientForTest,
} from './newsnow-http.client';
import {
  NEWSNOW_SOURCE_ENTRIES,
  findNewsnowEntry,
} from './newsnow-source.registry';
import { createTophubGetter } from './tophub';

const mockMyFetch = myFetch as unknown as jest.Mock;

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>小红书 ‧ 热榜</title><link>https://tophub.today/n/L4MdA5ldxD</link>
<item><title>用万能旅行拍照姿势美美出片</title><description>918.6w</description><link>https://www.xiaohongshu.com/search_result?keyword=a</link></item>
<item><title>豆瓣话题</title><description>714篇内容 · 47.4万次浏览</description><link>https://www.douban.com/?p=b</link></item>
<item><title>360在看</title><description>73643人在看</description><link>https://www.so.com/?p=v</link></item>
<item><title>重复条目</title><description>100w</description><link>https://www.douban.com/?p=b</link></item>
<item><title>无描述条目</title><description></description><link>https://www.xiaohongshu.com/search_result?keyword=c</link></item>
</channel></rss>`;

const EMPTY_FEED =
  '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>';

beforeEach(() => {
  mockMyFetch.mockReset();
  resetNewsnowClientForTest();
});

describe('tophub 镜像榜解析', () => {
  it('解析 RSS item 为 NewsItem,裸热度加前缀/信息文本原样,按链接去重,不混入 channel 级 link', async () => {
    mockMyFetch.mockResolvedValue(RSS_FIXTURE);

    const items = await createTophubGetter('L4MdA5ldxD')();

    expect(items.map((i) => i.title)).toEqual([
      '用万能旅行拍照姿势美美出片',
      '豆瓣话题',
      '360在看',
      '无描述条目',
    ]);
    // 裸热度数字 -> 「热度 」前缀,避免被当成正文
    expect(items[0].extra).toEqual({ hover: '热度 918.6w' });
    // 非纯数字的信息文本原样透出
    expect(items[1].extra).toEqual({
      hover: '714篇内容 · 47.4万次浏览',
    });
    // "N人在看" 式热度也加前缀(360 热榜实测格式)
    expect(items[2].extra).toEqual({ hover: '热度 73643人在看' });
    // 空描述不挂 extra,adapter 侧 description 回落为标题
    expect(items[3].extra).toBeUndefined();
    // channel 级 <link>(tophub 节点页)不得成为条目
    expect(items.some((i) => i.url.includes('tophub.today'))).toBe(false);
  });

  it('空 feed 返回空列表(不抛错,fail-open 由 adapter 兜底)', async () => {
    mockMyFetch.mockResolvedValue(EMPTY_FEED);

    await expect(createTophubGetter('X')()).resolves.toEqual([]);
  });

  it('默认请求 localhost RSSHub,节点 id 拼入路径,responseType 钉死为 text', async () => {
    mockMyFetch.mockResolvedValue(EMPTY_FEED);

    await createTophubGetter('WnBe01o371')();

    expect(mockMyFetch).toHaveBeenCalledWith(
      'http://localhost:1200/tophub/WnBe01o371',
      { responseType: 'text' },
    );
  });

  it('configureNewsnowClient 注入的 rssHubUrl 生效,尾部斜杠被归一化', async () => {
    configureNewsnowClient({ rssHubUrl: 'http://rsshub:1200/' });
    mockMyFetch.mockResolvedValue(EMPTY_FEED);

    await createTophubGetter('L4MdA5ldxD')();

    expect(mockMyFetch).toHaveBeenCalledWith(
      'http://rsshub:1200/tophub/L4MdA5ldxD',
      { responseType: 'text' },
    );
  });

  it('非文本响应(如 Content-Type 嗅探返回 Blob)抛错走 fail-open', async () => {
    mockMyFetch.mockResolvedValue(new Blob([RSS_FIXTURE]));

    await expect(createTophubGetter('L4MdA5ldxD')()).rejects.toThrow(
      '非文本响应',
    );
  });
});

describe('tophub registry 注册完整性', () => {
  const EXPECTED_TOPHUB_IDS = [
    'newsnow-xiaohongshu',
    'newsnow-wechat-hot',
    'newsnow-wechat-words',
    'newsnow-weibo-topics',
    'newsnow-douban-topics',
    'newsnow-quark',
    'newsnow-sogou',
    'newsnow-so360',
    'newsnow-ftchinese',
    'newsnow-guancha',
    'newsnow-chouti',
  ];

  it('11 个 tophub 源全部注册为 hottest 榜单,TTL 对齐 RSSHub 路由缓存', () => {
    for (const id of EXPECTED_TOPHUB_IDS) {
      const entry = findNewsnowEntry(id);
      expect(entry).toBeDefined();
      expect(entry?.listType).toBe('hottest');
      expect(entry?.cacheTtlSeconds).toBe(1800);
      expect(entry?.label).toBeTruthy();
    }
  });

  it('registry 内 id 无重复', () => {
    const ids = NEWSNOW_SOURCE_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
