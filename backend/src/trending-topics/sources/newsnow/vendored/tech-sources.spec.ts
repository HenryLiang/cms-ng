/**
 * 科技/国际组 vendored 抓取器解析测试:mock HTTP 层,覆盖 cheerio 解析、
 * 广告过滤、类型分支、RSS 解析、多频道合并等关键分支。
 */
jest.mock('../newsnow-http.client', () => ({
  myFetch: jest.fn(),
  fetchResponseCookies: jest.fn().mockResolvedValue(['cookie=mock']),
}));

import { myFetch } from '../newsnow-http.client';
import { fetchAihot } from './aihot';
import { fetchIthomeNews } from './ithome';
import { fetchSspaiHot } from './sspai';
import { fetchJuejinHot } from './juejin';
import { fetchNowcoderHot } from './nowcoder';
import { fetchHackernews } from './hackernews';
import { fetchGithubTrending } from './github';
import { fetchSolidot } from './solidot';
import { fetchCankaoxiaoxi } from './cankaoxiaoxi';
import { fetchSputniknewsCn } from './sputniknewscn';

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
});

describe('aihot AI 热榜', () => {
  it('映射 API 条目,info 拼接来源与分类', async () => {
    givenByUrl([
      {
        match: 'aihot.virxact.com',
        value: {
          items: [
            {
              id: 'a1',
              title: 'AI 新闻一',
              url: 'https://example.com/1',
              source: 'TechCrunch',
              publishedAt: '2026-08-23T00:00:00Z',
              summary: '摘要',
              category: '模型',
            },
          ],
        },
      },
    ]);

    const items = await fetchAihot();

    expect(items[0]).toMatchObject({
      id: 'a1',
      title: 'AI 新闻一',
      url: 'https://example.com/1',
    });
    expect(items[0].extra?.info).toBe('TechCrunch · 模型');
  });

  it('空数据抛错(adapter fail-open 兜底)', async () => {
    givenByUrl([{ match: 'aihot.virxact.com', value: { items: [] } }]);
    await expect(fetchAihot()).rejects.toThrow('AI 热榜返回空数据');
  });
});

describe('ithome IT之家', () => {
  it('过滤广告(lapin 链接/促销关键词)并解析相对时间', async () => {
    givenByUrl([
      {
        match: 'ithome.com/list',
        value:
          '<div id="list"><div class="fl"><ul>' +
          '<li><a class="t" href="https://www.ithome.com/0/1.htm">正常新闻</a><i>10分钟前</i></li>' +
          '<li><a class="t" href="https://lapin.ithome.com/0/2.htm">广告位</a><i>5分钟前</i></li>' +
          '<li><a class="t" href="https://www.ithome.com/0/3.htm">京东神券大促</a><i>1分钟前</i></li>' +
          '</ul></div></div>',
      },
    ]);

    const items = await fetchIthomeNews();

    expect(items.map((i) => i.title)).toEqual(['正常新闻']);
    expect(items[0].pubDate).toBeGreaterThan(Date.now() - 600_000 - 5_000);
    expect(items[0].pubDate).toBeLessThan(Date.now() - 600_000 + 5_000);
  });
});

describe('sspai 少数派', () => {
  it('映射热门文章 id -> 文章链接', async () => {
    givenByUrl([
      {
        match: 'sspai.com/api',
        value: { data: [{ id: 80000, title: '少数派文章一' }] },
      },
    ]);

    const items = await fetchSspaiHot();

    expect(items[0]).toEqual({
      id: 80000,
      title: '少数派文章一',
      url: 'https://sspai.com/post/80000',
    });
  });
});

describe('juejin 掘金热榜', () => {
  it('映射 content 嵌套结构', async () => {
    givenByUrl([
      {
        match: 'juejin.cn',
        value: {
          data: [{ content: { title: '掘金文章一', content_id: 'j1' } }],
        },
      },
    ]);

    const items = await fetchJuejinHot();

    expect(items[0]).toEqual({
      id: 'j1',
      title: '掘金文章一',
      url: 'https://juejin.cn/post/j1',
    });
  });
});

describe('nowcoder 牛客热搜', () => {
  it('type 分支决定链接形态,未知 type 丢弃', async () => {
    givenByUrl([
      {
        match: 'nowcoder.com/api',
        value: {
          data: {
            result: [
              { id: 'd1', title: '讨论帖', type: 0, uuid: '' },
              { id: '', title: '动态帖', type: 74, uuid: 'u1' },
              { id: 'x', title: '未知类型', type: 99, uuid: '' },
            ],
          },
        },
      },
    ]);

    const items = await fetchNowcoderHot();

    expect(items).toEqual([
      { id: 'd1', title: '讨论帖', url: 'https://www.nowcoder.com/discuss/d1' },
      {
        id: 'u1',
        title: '动态帖',
        url: 'https://www.nowcoder.com/feed/main/detail/u1',
      },
    ]);
  });
});

describe('hackernews', () => {
  it('提取标题与分数', async () => {
    givenByUrl([
      {
        match: 'news.ycombinator.com',
        value:
          '<table><tr class="athing" id="100"><td><span class="titleline">' +
          '<a href="https://example.com">Show HN: 项目一</a></span></td></tr>' +
          '<tr><td><span id="score_100">501 points</span></td></tr></table>',
      },
    ]);

    const items = await fetchHackernews();

    expect(items[0]).toEqual({
      id: '100',
      title: 'Show HN: 项目一',
      url: 'https://news.ycombinator.com/item?id=100',
      extra: { info: '501 points' },
    });
  });
});

describe('github GitHub Trending', () => {
  it('提取仓库全名、star 数与描述', async () => {
    givenByUrl([
      {
        match: 'github.com/trending',
        value:
          '<main><div class="Box"><div data-hpc=""><article>' +
          '<h2><a href="/owner/repo">\n  owner / repo\n  </a></h2>' +
          '<p>一个仓库描述</p>' +
          '<a href="/owner/repo/stargazers">1,234</a>' +
          '</article></div></div></main>',
      },
    ]);

    const items = await fetchGithubTrending();

    expect(items[0]).toEqual({
      id: '/owner/repo',
      title: 'owner / repo',
      url: 'https://github.com/owner/repo',
      extra: { info: '✰ 1,234', hover: '一个仓库描述' },
    });
  });
});

describe('solidot', () => {
  it('解析 RSS 输出标题/链接/摘要', async () => {
    givenByUrl([
      {
        match: 'solidot.org',
        value:
          '<?xml version="1.0"?><rss version="2.0"><channel><title>Solidot</title>' +
          '<item><title>固态硬盘降价</title><link>https://www.solidot.org/story?sid=1</link>' +
          '<description>摘要内容</description></item></channel></rss>',
      },
    ]);

    const items = await fetchSolidot();

    expect(items[0]).toMatchObject({
      title: '固态硬盘降价',
      url: 'https://www.solidot.org/story?sid=1',
    });
  });
});

describe('cankaoxiaoxi 参考消息', () => {
  it('三个频道合并并按发布时间倒序', async () => {
    mockMyFetch.mockImplementation((url: string) => {
      const channel = String(url).match(/channel\/(\w+)\//)?.[1];
      const time =
        channel === 'zhongguo' ? '2026-08-23 10:00:00' : '2026-08-23 11:00:00';
      const title = channel === 'zhongguo' ? '国内要闻' : `${channel} 要闻`;
      return Promise.resolve({
        list: [
          {
            data: {
              id: channel,
              title,
              url: `http://example.com/${channel}`,
              publishTime: time,
            },
          },
        ],
      });
    });

    const items = await fetchCankaoxiaoxi();

    expect(items).toHaveLength(3);
    // 11:00 的两条在前,10:00 的在后
    expect(items[0].extra?.date).toBe(Date.parse('2026-08-23T11:00:00+08:00'));
    expect(items[2].extra?.date).toBe(Date.parse('2026-08-23T10:00:00+08:00'));
  });
});

describe('sputniknewscn 卫星通讯社', () => {
  it('提取条目标题与 unix 时间戳', async () => {
    givenByUrl([
      {
        match: 'sputniknews.cn',
        value:
          '<div class="lenta"><div class="lenta__item"><a href="/news/20260823-1.html">' +
          '<span class="lenta__item-text">卫星新闻一</span>' +
          '<span class="lenta__item-date" data-unixtime="1700000000"></span></a></div></div>',
      },
    ]);

    const items = await fetchSputniknewsCn();

    expect(items[0]).toEqual({
      id: '/news/20260823-1.html',
      title: '卫星新闻一',
      url: 'https://sputniknews.cn/news/20260823-1.html',
      extra: { date: 1700000000000 },
    });
  });
});
