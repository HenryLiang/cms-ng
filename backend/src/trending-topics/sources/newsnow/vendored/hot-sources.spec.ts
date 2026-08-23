/**
 * 国内热搜组 vendored 抓取器解析测试:mock HTTP 层,用最小结构 fixture
 * 验证各源的解析/过滤/映射逻辑(follow upstream 实现的真实分支)。
 */
jest.mock('../newsnow-http.client', () => ({
  myFetch: jest.fn(),
  fetchResponseCookies: jest.fn().mockResolvedValue(['SUB=mock-cookie']),
}));

import { myFetch, fetchResponseCookies } from '../newsnow-http.client';
import { fetchBaiduHot } from './baidu';
import { fetchDouyinHot } from './douyin';
import { fetchToutiaoHot } from './toutiao';
import { fetchTiebaHot } from './tieba';
import { fetchKuaishouHot } from './kuaishou';
import { fetchHupuHot } from './hupu';
import { fetchTencentHot } from './tencent';
import { fetchIfengNews } from './ifeng';
import { fetchKaopuHot } from './kaopu';
import { fetchThepaperHot } from './thepaper';

const mockMyFetch = myFetch as unknown as jest.Mock;

function givenByUrl(routes: Array<{ match: string; value: unknown }>): void {
  mockMyFetch.mockImplementation((url: string) => {
    for (const route of routes) {
      if (String(url).includes(route.match))
        return Promise.resolve(route.value);
    }
    return Promise.reject(new Error(`未预期的请求: ${url}`));
  });
}

beforeEach(() => {
  mockMyFetch.mockReset();
  (fetchResponseCookies as unknown as jest.Mock).mockClear();
});

describe('baidu 百度热搜', () => {
  it('从 HTML 内嵌 s-data 提取词榜并过滤置顶', async () => {
    givenByUrl([
      {
        match: 'top.baidu.com',
        value:
          '<html><body><!--s-data:{"data":{"cards":[{"content":[{"isTop":true,"word":"置顶词","rawUrl":"https://top.baidu.com/x","desc":""},{"word":"百度热搜一","rawUrl":"https://baijiahao.baidu.com/s?id=1","desc":"描述一"},{"word":"百度热搜二","rawUrl":"https://baijiahao.baidu.com/s?id=2","desc":"描述二"}]}]}}--></body></html>',
      },
    ]);

    const items = await fetchBaiduHot();

    expect(items.map((i) => i.title)).toEqual(['百度热搜一', '百度热搜二']);
    expect(items[0]).toMatchObject({
      id: 'https://baijiahao.baidu.com/s?id=1',
      url: 'https://baijiahao.baidu.com/s?id=1',
    });
    expect(items[0].extra?.hover).toBe('描述一');
  });
});

describe('douyin 抖音热点', () => {
  it('先取匿名 cookie 再请求词榜', async () => {
    givenByUrl([
      {
        match: 'douyin.com/aweme',
        value: {
          data: {
            word_list: [
              {
                sentence_id: 's1',
                word: '抖音热点一',
                event_time: '',
                hot_value: '1',
              },
            ],
          },
        },
      },
    ]);

    const items = await fetchDouyinHot();

    expect(fetchResponseCookies).toHaveBeenCalledWith(
      'https://login.douyin.com/',
    );
    expect(items).toEqual([
      {
        id: 's1',
        title: '抖音热点一',
        url: 'https://www.douyin.com/hot/s1',
      },
    ]);
  });
});

describe('toutiao 头条热榜', () => {
  it('映射 ClusterId 为 trending 链接', async () => {
    givenByUrl([
      {
        match: 'toutiao.com/hot-event',
        value: { data: [{ ClusterIdStr: 'c1', Title: '头条热榜一' }] },
      },
    ]);

    const items = await fetchToutiaoHot();

    expect(items[0]).toEqual({
      id: 'c1',
      title: '头条热榜一',
      url: 'https://www.toutiao.com/trending/c1/',
    });
  });
});

describe('tieba 贴吧热议', () => {
  it('映射 topic_list', async () => {
    givenByUrl([
      {
        match: 'tieba.baidu.com',
        value: {
          data: {
            bang_topic: {
              topic_list: [
                {
                  topic_id: 't1',
                  topic_name: '贴吧热议一',
                  create_time: 1,
                  topic_url:
                    'https://tieba.baidu.com/hottopic/browse/topicDetail?tid=t1',
                },
              ],
            },
          },
        },
      },
    ]);

    const items = await fetchTiebaHot();

    expect(items[0]).toMatchObject({
      id: 't1',
      title: '贴吧热议一',
      url: 'https://tieba.baidu.com/hottopic/browse/topicDetail?tid=t1',
    });
  });
});

describe('kuaishou 快手热榜', () => {
  it('从 __APOLLO_STATE__ 提取热榜并过滤置顶', async () => {
    const apollo = {
      defaultClient: {
        ROOT_QUERY: {
          'visionHotRank({"page":"home"})': {
            type: 'VisionHotRank',
            id: 'VisionHotRank:1',
          },
        },
        'VisionHotRank:1': {
          result: 1,
          items: [
            { type: 'item', id: 'VisionHotRankItem:0' },
            { type: 'item', id: 'VisionHotRankItem:1' },
          ],
        },
        'VisionHotRankItem:0': { name: '置顶词条', tagType: '置顶' },
        'VisionHotRankItem:1': { name: '快手热榜一', iconUrl: '' },
      },
    };
    givenByUrl([
      {
        match: 'kuaishou.com',
        value: `<script>window.__APOLLO_STATE__ = ${JSON.stringify(apollo)};</script>`,
      },
    ]);

    const items = await fetchKuaishouHot();

    expect(items.map((i) => i.title)).toEqual(['快手热榜一']);
    expect(items[0].url).toContain(
      `searchKey=${encodeURIComponent('快手热榜一')}`,
    );
  });

  it('APOLLO_STATE 缺失时抛错(fail-open 由 adapter 兜底)', async () => {
    givenByUrl([{ match: 'kuaishou.com', value: '<html></html>' }]);
    await expect(fetchKuaishouHot()).rejects.toThrow('无法获取快手热榜数据');
  });
});

describe('hupu 虎扑步行街', () => {
  it('正则提取帖子标题与链接', async () => {
    givenByUrl([
      {
        match: 'bbs.hupu.com',
        value:
          '<ul><li class="bbs-sl-web-post-body"><div><a href="/post-1.html" class="p-title">虎扑帖一 </a></div></li>' +
          '<li class="bbs-sl-web-post-body"><div><a href="/post-2.html" class="p-title">虎扑帖二</a></div></li></ul>',
      },
    ]);

    const items = await fetchHupuHot();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: '虎扑帖一',
      url: 'https://bbs.hupu.com/post-1.html',
    });
  });
});

describe('tencent 腾讯热点', () => {
  it('映射 tabs[0] 的 articleList', async () => {
    givenByUrl([
      {
        match: 'i.news.qq.com',
        value: {
          ret: 0,
          data: {
            tabs: [
              {
                articleList: [
                  {
                    id: '1',
                    title: '腾讯热点一',
                    desc: '摘要',
                    link_info: { url: 'https://new.qq.com/rain/a/1' },
                  },
                ],
              },
            ],
          },
        },
      },
    ]);

    const items = await fetchTencentHot();

    expect(items[0]).toMatchObject({
      title: '腾讯热点一',
      url: 'https://new.qq.com/rain/a/1',
    });
    expect(items[0].extra?.hover).toBe('摘要');
  });
});

describe('ifeng 凤凰网', () => {
  it('从 allData 内嵌 JSON 提取 hotNews1', async () => {
    givenByUrl([
      {
        match: 'ifeng.com',
        value:
          '<script>var allData = {"hotNews1":[{"url":"https://news.ifeng.com/c/1","title":"凤凰新闻一","newsTime":"2026-08-23 11:00:00"}]};</script>',
      },
    ]);

    const items = await fetchIfengNews();

    expect(items[0]).toMatchObject({
      title: '凤凰新闻一',
      url: 'https://news.ifeng.com/c/1',
    });
  });

  it('无 allData 时返回空列表(不抛错)', async () => {
    givenByUrl([
      { match: 'ifeng.com', value: '<html><body>空页面</body></html>' },
    ]);
    const items = await fetchIfengNews();
    expect(items).toEqual([]);
  });
});

describe('kaopu 靠谱热搜', () => {
  it('cheerio 提取聚合条目(标题/描述/来源/相对时间)', async () => {
    givenByUrl([
      {
        match: 'kaopu.news',
        value:
          '<main><article><a href="/story/abc"><h2>靠谱热搜一</h2></a>' +
          '<p>多平台聚合描述</p>' +
          '<div class="story-meta"><span>3小时前</span></div>' +
          '<div class="story-provenance">微博</div></article></main>',
      },
    ]);

    const items = await fetchKaopuHot();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: '靠谱热搜一',
      url: 'https://kaopu.news/story/abc',
    });
    expect(items[0].extra?.hover).toBe('多平台聚合描述');
    expect(items[0].extra?.info).toBe('微博');
    // 3小时前 -> 相对当前时间回退 3h
    expect(items[0].pubDate).toBeGreaterThan(
      Date.now() - 3 * 3_600_000 - 5_000,
    );
    expect(items[0].pubDate).toBeLessThan(Date.now() - 3 * 3_600_000 + 5_000);
  });
});

describe('thepaper 澎湃热榜', () => {
  it('映射 hotNews 列表', async () => {
    givenByUrl([
      {
        match: 'thepaper.cn',
        value: {
          data: {
            hotNews: [{ contId: '1', name: '澎湃热榜一', pubTimeLong: '1' }],
          },
        },
      },
    ]);

    const items = await fetchThepaperHot();

    expect(items[0]).toMatchObject({
      id: '1',
      title: '澎湃热榜一',
      url: 'https://www.thepaper.cn/newsDetail_forward_1',
    });
  });
});
