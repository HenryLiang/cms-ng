/**
 * 小红书热榜(RSSHub tophub 路由)解析测试:mock HTTP 层,用最小 RSS
 * fixture 验证 XML 解析/去重/热度透出逻辑。
 */
jest.mock('./newsnow-http.client', () => ({
  myFetch: jest.fn(),
  fetchResponseCookies: jest.fn().mockResolvedValue([]),
}));

import { myFetch } from './newsnow-http.client';
import { fetchXiaohongshuHot } from './xiaohongshu';

const mockMyFetch = myFetch as unknown as jest.Mock;

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>小红书 ‧ 热榜</title>
<item><title>用万能旅行拍照姿势美美出片</title><description>918.6w</description><link>https://www.xiaohongshu.com/search_result?keyword=a</link></item>
<item><title>耗时三年拍下古诗词里的中国</title><description>907w</description><link>https://www.xiaohongshu.com/search_result?keyword=b</link></item>
<item><title>重复条目</title><description>100w</description><link>https://www.xiaohongshu.com/search_result?keyword=b</link></item>
<item><title>无热度条目</title><description></description><link>https://www.xiaohongshu.com/search_result?keyword=c</link></item>
</channel></rss>`;

beforeEach(() => {
  mockMyFetch.mockReset();
});

describe('xiaohongshu 小红书热榜', () => {
  it('解析 RSS item 为 NewsItem(标题/链接/热度),按链接去重', async () => {
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
      extra: { hover: '918.6w' },
    });
    // 无热度的条目不挂 extra,adapter 侧 description 回落为标题
    expect(items[2].extra).toBeUndefined();
  });

  it('空 feed 返回空列表(不抛错,fail-open 由 adapter 兜底)', async () => {
    mockMyFetch.mockResolvedValue(
      '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>',
    );

    await expect(fetchXiaohongshuHot()).resolves.toEqual([]);
  });

  it('请求指向 RSSHub tophub 小红书节点', async () => {
    mockMyFetch.mockResolvedValue(
      '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>',
    );

    await fetchXiaohongshuHot();

    expect(mockMyFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/tophub\/L4MdA5ldxD$/),
    );
  });
});
