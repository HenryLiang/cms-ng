/**
 * 财经组 vendored 抓取器解析测试:mock HTTP 层,覆盖财联社签名参数、
 * 广告过滤、标题提取(【】格式)、按时间排序等关键分支。
 */
jest.mock('../newsnow-http.client', () => ({
  myFetch: jest.fn(),
  fetchResponseCookies: jest.fn().mockResolvedValue(['xq_a_token=mock']),
}));

import { createHash } from 'node:crypto';
import { myFetch } from '../newsnow-http.client';
import { getClsSearchParams } from './cls-utils';
import { fetchClsDepth, fetchClsHot, fetchClsTelegraph } from './cls';
import {
  fetchWallstreetcnHot,
  fetchWallstreetcnNews,
  fetchWallstreetcnQuick,
} from './wallstreetcn';
import { fetchJin10Flash } from './jin10';
import { fetchGelonghuiNews } from './gelonghui';
import { fetchMktnewsFlash } from './mktnews';
import { fetchXueqiuHotStock } from './xueqiu';

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

describe('cls-utils 财联社签名', () => {
  it('参数排序后附 md5(sha1) 两层 sign', () => {
    const params = getClsSearchParams({ rn: 30 });
    const entries = Array.from(params.entries());

    expect(entries.map(([k]) => k)).toEqual([
      'appName',
      'os',
      'rn',
      'sv',
      'sign',
    ]);
    expect(params.get('sign')).toMatch(/^[0-9a-f]{32}$/);
    // sign = md5(sha1Hex(排序后(不含 sign)参数串)),与上游一致
    const inner = createHash('sha1')
      .update('appName=CailianpressWeb&os=web&rn=30&sv=7.7.5')
      .digest('hex');
    const expected = createHash('md5').update(inner).digest('hex');
    expect(params.get('sign')).toBe(expected);
  });
});

describe('cls 财联社', () => {
  it('telegraph 电报:过滤广告,title 回退 brief', async () => {
    givenByUrl([
      {
        match: 'cls.cn/v1/roll',
        value: {
          data: {
            roll_data: [
              {
                id: 1,
                title: '电报一',
                brief: '正文一',
                shareurl: 'https://m.cls.cn/1',
                ctime: 1700000000,
                is_ad: 0,
              },
              {
                id: 2,
                title: '',
                brief: '广告内容',
                shareurl: '',
                ctime: 1700000001,
                is_ad: 1,
              },
              {
                id: 3,
                title: '',
                brief: '无题电报',
                shareurl: 'https://m.cls.cn/3',
                ctime: 1700000002,
                is_ad: 0,
              },
            ],
          },
        },
      },
    ]);

    const items = await fetchClsTelegraph();

    expect(items.map((i) => i.title)).toEqual(['电报一', '无题电报']);
    expect(items[0].pubDate).toBe(1700000000 * 1000);
    expect(items[0].url).toBe('https://www.cls.cn/detail/1');
  });

  it('hot 热门:直接映射列表', async () => {
    givenByUrl([
      {
        match: 'cls.cn/v2/article/hot',
        value: {
          data: [{ id: 9, title: '热门一', brief: '', shareurl: '', ctime: 1 }],
        },
      },
    ]);
    const items = await fetchClsHot();
    expect(items[0]).toMatchObject({
      id: 9,
      title: '热门一',
      url: 'https://www.cls.cn/detail/9',
    });
  });

  it('depth 深度:按 ctime 倒序', async () => {
    givenByUrl([
      {
        match: 'cls.cn/v3/depth',
        value: {
          data: {
            top_article: [],
            depth_list: [
              { id: 1, title: '旧深度', brief: '', shareurl: '', ctime: 100 },
              { id: 2, title: '新深度', brief: '', shareurl: '', ctime: 200 },
            ],
          },
        },
      },
    ]);
    const items = await fetchClsDepth();
    expect(items.map((i) => i.title)).toEqual(['新深度', '旧深度']);
  });
});

describe('wallstreetcn 华尔街见闻', () => {
  it('quick 快讯:title 回退 content_text,date 毫秒', async () => {
    givenByUrl([
      {
        match: 'content/lives',
        value: {
          data: {
            items: [
              {
                id: 1,
                title: '',
                content_text: '无题快讯正文',
                uri: 'https://wallstreetcn.com/1',
                display_time: 1700000000,
              },
              {
                id: 2,
                title: '快讯二',
                content_text: 'x',
                uri: 'https://wallstreetcn.com/2',
                display_time: 1700000001,
              },
            ],
          },
        },
      },
    ]);

    const items = await fetchWallstreetcnQuick();

    expect(items.map((i) => i.title)).toEqual(['无题快讯正文', '快讯二']);
    expect(items[0].extra?.date).toBe(1700000000 * 1000);
  });

  it('news 要闻:过滤 theme/ad/live 与无 uri 条目', async () => {
    const item = (id: number, uri: string, type = 'article') => ({
      id,
      title: `要闻${id}`,
      content_short: '',
      uri,
      display_time: 1,
      type,
    });
    givenByUrl([
      {
        match: 'information-flow',
        value: {
          data: {
            items: [
              {
                resource_type: 'article',
                resource: item(1, 'https://wscn.com/1'),
              },
              {
                resource_type: 'theme',
                resource: item(2, 'https://wscn.com/2'),
              },
              { resource_type: 'ad', resource: item(3, 'https://wscn.com/3') },
              { resource_type: 'article', resource: item(4, '', 'live') },
            ],
          },
        },
      },
    ]);

    const items = await fetchWallstreetcnNews();

    expect(items.map((i) => i.id)).toEqual([1]);
  });

  it('hot 最热:映射 day_items', async () => {
    givenByUrl([
      {
        match: 'articles/hot',
        value: {
          data: {
            day_items: [{ id: 7, title: '最热一', uri: 'u7', display_time: 1 }],
          },
        },
      },
    ]);
    const items = await fetchWallstreetcnHot();
    expect(items[0]).toMatchObject({ id: 7, title: '最热一', url: 'u7' });
  });
});

describe('jin10 金十快讯', () => {
  it('解析 var newest JS 变量:【标题】内容拆分、过滤 channel 5', async () => {
    const raw =
      'var newest = [' +
      '{"id":"1","time":"2026-08-23 10:00:00","type":1,"important":1,"tags":[],"channel":[1],"remark":[],"data":{"title":"【金十标题】金十内容","content":"","pic":""}}' +
      ',{"id":"2","time":"2026-08-23 09:00:00","type":1,"important":0,"tags":[],"channel":[5],"remark":[],"data":{"title":"被过滤","content":""}}' +
      ',{"id":"3","time":"2026-08-23 08:00:00","type":1,"important":0,"tags":[],"channel":[],"remark":[],"data":{"title":"","content":"无括号<b>内容</b>"}}' +
      '];';

    givenByUrl([{ match: 'jin10.com/flash_newest', value: raw }]);

    const items = await fetchJin10Flash();

    expect(items.map((i) => i.title)).toEqual(['金十标题', '无括号内容']);
    expect(items[0].extra?.hover).toBe('金十内容');
    expect(items[0].extra?.info).toBe('✰');
    expect(items[0].pubDate).toBe(Date.parse('2026-08-23T10:00:00+08:00'));
  });
});

describe('gelonghui 格隆汇', () => {
  it('cheerio 提取要闻列表', async () => {
    givenByUrl([
      {
        match: 'gelonghui.com/news',
        value:
          '<div><div class="article-content">' +
          '<div class="detail-right"><a href="/news/1"><h2>格隆汇要闻一</h2></a></div>' +
          '<div class="time"><span>A股</span><span>·</span><span>2小时前</span></div>' +
          '</div></div>',
      },
    ]);

    const items = await fetchGelonghuiNews();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: '格隆汇要闻一',
      url: 'https://www.gelonghui.com/news/1',
    });
    expect(items[0].extra?.info).toBe('A股');
  });
});

describe('mktnews MKT快讯', () => {
  it('按时间倒序,标题回退 content 的【】提取,important 标记', async () => {
    givenByUrl([
      {
        match: 'api.mktnews.net',
        value: {
          status: 0,
          message: 'ok',
          data: [
            {
              id: '1',
              type: 0,
              time: '2026-08-23T09:00:00Z',
              important: 0,
              data: { title: '普通标题', content: '', pic: '' },
              remark: [],
              hot: false,
              hot_start: null,
              hot_end: null,
              classify: [],
              impact: [],
            },
            {
              id: '2',
              type: 0,
              time: '2026-08-23T10:00:00Z',
              important: 1,
              data: { title: '', content: '【重要快讯】内容正文', pic: '' },
              remark: [],
              hot: false,
              hot_start: null,
              hot_end: null,
              classify: [],
              impact: [],
            },
          ],
        },
      },
    ]);

    const items = await fetchMktnewsFlash();

    // 时间倒序:10 点在前
    expect(items.map((i) => i.id)).toEqual(['2', '1']);
    expect(items[0]).toMatchObject({ title: '重要快讯' });
    expect(items[0].extra?.info).toBe('Important');
    expect(items[1].extra?.info).toBeUndefined();
  });
});

describe('xueqiu 雪球热股', () => {
  it('先取 cookie,过滤广告位,拼接涨幅信息', async () => {
    givenByUrl([
      {
        match: 'stock.xueqiu.com',
        value: {
          data: {
            items: [
              {
                code: 'SH600000',
                name: '浦发银行',
                percent: 1.5,
                exchange: 'SH',
                ad: 0,
              },
              { code: 'AD001', name: '广告', percent: 0, exchange: '', ad: 1 },
            ],
          },
        },
      },
    ]);

    const items = await fetchXueqiuHotStock();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'SH600000',
      title: '浦发银行',
      url: 'https://xueqiu.com/s/SH600000',
    });
    expect(items[0].extra?.info).toBe('1.5% SH');
  });
});
