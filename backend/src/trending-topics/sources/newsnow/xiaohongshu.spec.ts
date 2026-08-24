/**
 * 小红书热榜(RSSHub tophub 路由)解析测试:mock myFetch,保留真实的
 * client 配置 seam,用最小 RSS fixture 验证 XML 解析/去重/热度透出/
 * URL 配置/非文本响应守卫。
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
import { fetchXiaohongshuHot } from './xiaohongshu';

const mockMyFetch = myFetch as unknown as jest.Mock;

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>小红书 ‧ 热榜</title><link>https://tophub.today/n/L4MdA5ldxD</link>
<item><title>用万能旅行拍照姿势美美出片</title><description>918.6w</description><link>https://www.xiaohongshu.com/search_result?keyword=a</link></item>
<item><title>耗时三年拍下古诗词里的中国</title><description>907w</description><link>https://www.xiaohongshu.com/search_result?keyword=b</link></item>
<item><title>重复条目</title><description>100w</description><link>https://www.xiaohongshu.com/search_result?keyword=b</link></item>
<item><title>无热度条目</title><description></description><link>https://www.xiaohongshu.com/search_result?keyword=c</link></item>
</channel></rss>`;

const EMPTY_FEED =
  '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>';

beforeEach(() => {
  mockMyFetch.mockReset();
  resetNewsnowClientForTest();
});

describe('xiaohongshu 小红书热榜', () => {
  it('解析 RSS item 为 NewsItem(标题/链接/热度),按链接去重,不混入 channel 级 link', async () => {
    mockMyFetch.mockResolvedValue(RSS_FIXTURE);

    const items = await fetchXiaohongshuHot();

    expect(items.map((i) => i.title)).toEqual([
      '用万能旅行拍照姿势美美出片',
      '耗时三年拍下古诗词里的中国',
      '无热度条目',
    ]);
    expect(items[0]).toMatchObject({
      id: 'https://www.xiaohongshu.com/search_result?keyword=a',
      url: 'https://www.xiaohongshu.com/search_result?keyword=a',
      extra: { hover: '热度 918.6w' },
    });
    // 无热度的条目不挂 extra,adapter 侧 description 回落为标题
    expect(items[2].extra).toBeUndefined();
    // channel 级 <link>(tophub 节点页)不得成为条目
    expect(items.some((i) => i.url.includes('tophub.today'))).toBe(false);
  });

  it('空 feed 返回空列表(不抛错,fail-open 由 adapter 兜底)', async () => {
    mockMyFetch.mockResolvedValue(EMPTY_FEED);

    await expect(fetchXiaohongshuHot()).resolves.toEqual([]);
  });

  it('默认请求 localhost RSSHub,responseType 钉死为 text', async () => {
    mockMyFetch.mockResolvedValue(EMPTY_FEED);

    await fetchXiaohongshuHot();

    expect(mockMyFetch).toHaveBeenCalledWith(
      'http://localhost:1200/tophub/L4MdA5ldxD',
      { responseType: 'text' },
    );
  });

  it('configureNewsnowClient 注入的 rssHubUrl 生效,尾部斜杠被归一化', async () => {
    configureNewsnowClient({ rssHubUrl: 'http://rsshub:1200/' });
    mockMyFetch.mockResolvedValue(EMPTY_FEED);

    await fetchXiaohongshuHot();

    expect(mockMyFetch).toHaveBeenCalledWith(
      'http://rsshub:1200/tophub/L4MdA5ldxD',
      { responseType: 'text' },
    );
  });

  it('非文本响应(如 Content-Type 嗅探返回 Blob)抛错走 fail-open', async () => {
    mockMyFetch.mockResolvedValue(new Blob([RSS_FIXTURE]));

    await expect(fetchXiaohongshuHot()).rejects.toThrow('非文本响应');
  });
});
