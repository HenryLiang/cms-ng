import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  BillingService,
  InsufficientBalanceException,
} from '../billing/billing.service';
import { TransactionType, BillingCategory } from '@cms-ng/shared';
import { TopicSourceAdapter } from './sources/topic-source.adapter';
import {
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from './sources/topic-source.types';

/** twitterapi.io 趋势榜原始条目(trend 是对象;兼容平铺形态) */
interface TwitterTrendRaw {
  trend?: {
    name?: string;
    rank?: number;
    tweet_volume?: number;
    tweetVolume?: number;
    url?: string;
  };
  name?: string;
  rank?: number;
  tweet_volume?: number;
  tweetVolume?: number;
  url?: string;
}

/** twitterapi.io 用户推文原始条目 */
interface TwitterTweetRaw {
  id?: string;
  text?: string;
  likeCount?: number;
  isReply?: boolean;
  type?: string;
  url?: string;
}

/** twitterapi.io 响应体(trends 端点顶层放 trends;user/tweets 端点用 {status,msg,data}) */
interface TwitterApiResponse {
  status?: string;
  msg?: string;
  message?: string;
  trends?: TwitterTrendRaw[];
  data?: {
    tweets?: TwitterTweetRaw[];
    unavailable?: boolean;
    message?: string;
    unavailableReason?: string;
  };
  tweets?: TwitterTweetRaw[];
  unavailable?: boolean;
  message?: string;
  unavailableReason?: string;
}

/** normalize 后的通用选题条目 */
interface NormalizedTopicItem {
  title: string;
  description: string;
  source: string;
  heatScore: number;
  tags: string[];
  articles: { title: string; source: string; snippet: string; url: string }[];
}

/**
 * X (Twitter) 数据源服务 — 基于 twitterapi.io REST API。
 *
 * 两类选题数据：
 *   1. 趋势榜单（Trends）—— 按 WOEID 拉取地域趋势榜。
 *   2. 热门账号最新推文 —— watch 清单聚合 + 自由输入单账号。
 *
 * 关键设计：
 *   - 归一化到 trending-topics 通用条目形状 `{title, description, source, heatScore, tags, articles[]}`，
 *     前端 NewsSourcePanel 零改动渲染。
 *   - Redis 缓存（趋势 600s / 账号 300s / 聚合 300s）—— twitterapi.io 按次付费，缓存命中不扣费。
 *   - 计费：仅缓存未命中、实际打到 twitterapi.io 时扣费；幂等键按 TTL 桶防同用户同数据窗口内重复扣费；
 *     余额不足拉取前抛 InsufficientBalanceException。BILLING_ENABLED=false 时全跳过。
 *   - 代理：Node 18-23 原生 fetch 不读 HTTP_PROXY，TWITTERAPI_IO_PROXY_ENABLED=true 时显式传 undici ProxyAgent。
 *   - 鲁棒：聚合拉取用 Promise.allSettled 隔离单账号失败。
 */
@Injectable()
export class TwitterService implements TopicSourceAdapter {
  private readonly logger = new Logger(TwitterService.name);

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly woeids: number[];
  private readonly proxyEnabled: boolean;
  private readonly proxyUrl: string | undefined;

  // twitterapi.io 按 WOEID 返回地域趋势榜；内置常用 label 映射，未命中回退 WOEID-{n}
  private static readonly WOEID_LABELS: Record<number, string> = {
    1: '全球',
    23424977: '美国',
    23424975: '英国',
    44418: '伦敦',
    23424856: '日本',
    1105779: '东京',
    23424768: '巴西',
    23424868: '墨西哥',
    23424775: '澳大利亚',
    1118108: '孟买',
    2348597: '香港',
  };

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly billing: BillingService,
  ) {
    this.apiKey = this.config.get<string>('TWITTERAPI_IO_API_KEY');
    this.baseUrl = (
      this.config.get<string>('TWITTERAPI_IO_BASE_URL') ||
      'https://api.twitterapi.io'
    ).replace(/\/$/, '');
    this.woeids = (this.config.get<string>('TWITTERAPI_IO_WOEIDS') || '1')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (this.woeids.length === 0) this.woeids = [1];
    this.proxyEnabled =
      (
        this.config.get<string>('TWITTERAPI_IO_PROXY_ENABLED') || ''
      ).toLowerCase() === 'true';
    this.proxyUrl =
      this.config.get<string>('HTTP_PROXY') ||
      this.config.get<string>('http_proxy') ||
      undefined;
  }

  // ─── 公共 API ───

  async listDefinitions(
    context: TopicSourceContext,
  ): Promise<TopicSourceDefinition[]> {
    void context;
    const watchedAccounts = context.includeParameterOptions
      ? ((await this.prisma.twitterWatchAccount.findMany({
          orderBy: { createdAt: 'asc' },
        })) ?? [])
      : [];
    return [
      {
        id: 'x-trends',
        label: 'X 趋势',
        category: 'social',
        icon: 'social',
        aggregate: false,
        parameters: [
          {
            key: 'woeid',
            label: '地域',
            kind: 'select',
            defaultValue: this.woeids[0] || 1,
            options: this.getWoeids().map((item) => ({
              value: item.woeid,
              label: item.label,
            })),
          },
        ],
      },
      {
        id: 'x-accounts',
        label: 'X 热门账号',
        category: 'social',
        icon: 'social',
        aggregate: false,
        autoFetch: false,
        parameters: [
          {
            key: 'account',
            label: '账号',
            kind: 'combobox',
            placeholder: '@username',
            options: watchedAccounts.map((account) => ({
              value: account.userName,
              label: `@${account.userName}${account.displayName ? ` · ${account.displayName}` : ''}`,
            })),
          },
        ],
      },
    ];
  }

  async fetch(
    sourceId: string,
    context: TopicSourceContext,
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage> {
    if (!context.userId) {
      throw new BadRequestException('拉取 X 数据源需要登录用户');
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? (sourceId === 'x-accounts' ? 20 : 10);
    let result: TopicSourcePage;
    if (sourceId === 'x-trends') {
      const woeid = Number(query.params?.woeid || this.woeids[0] || 1);
      result = await this.fetchTrends(context.userId, woeid, page, limit);
    } else if (sourceId === 'x-accounts') {
      const account = String(query.params?.account || '').trim();
      result = account
        ? this.paginate(
            await this.fetchAccountTweets(
              account,
              undefined,
              context.userId,
              true,
            ),
            page,
            limit,
          )
        : await this.fetchAggregatedAccounts(context.userId, page, limit);
    } else {
      throw new BadRequestException(`未知的 X 数据源: ${sourceId}`);
    }
    return {
      ...result,
      status: 'available',
      fetchedAt: new Date().toISOString(),
    };
  }

  /** 可切换的地域列表（供前端 WOEID 切换器） */
  getWoeids(): Array<{ woeid: number; label: string }> {
    return this.woeids.map((w) => ({
      woeid: w,
      label: TwitterService.WOEID_LABELS[w] || `WOEID-${w}`,
    }));
  }

  /** 拉取 X 趋势榜（按 WOEID） */
  async fetchTrends(
    userId: string,
    woeid: number,
    page = 1,
    limit = 10,
  ): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.requireApiKey();
    const cacheKey = `x:trends:${woeid}`;
    const cached = await this.redis.get(cacheKey);
    let items: NormalizedTopicItem[];
    if (cached) {
      items = JSON.parse(cached) as NormalizedTopicItem[];
    } else {
      // 缓存未命中 → 计费 + 实打 API
      await this.checkAndCharge(userId, 'trends', String(woeid), 600);
      const raw = await this.callTwitterApi(`/twitter/trends?woeid=${woeid}`);
      items = this.normalizeTrends(raw);
      await this.redis.set(cacheKey, JSON.stringify(items), 600);
    }
    return this.paginate(items, page, limit);
  }

  /** 聚合全部 watch 账号最新 5 条推文 */
  async fetchAggregatedAccounts(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.requireApiKey();
    const cacheKey = 'x:accounts:all';
    const cached = await this.redis.get(cacheKey);
    let items: NormalizedTopicItem[];
    if (cached) {
      items = JSON.parse(cached) as NormalizedTopicItem[];
    } else {
      // 聚合层一次扣费（非每账号扣费）
      await this.checkAndCharge(userId, 'accounts-all', 'all', 300);
      const accounts = await this.prisma.twitterWatchAccount.findMany({
        orderBy: { createdAt: 'asc' },
      });
      if (accounts.length === 0) {
        this.logger.warn(
          'X watch 清单为空 — 聚合账号无数据。请用 POST /trending-topics/x-watch 添加账号，或运行 seed-twitter-accounts.ts。',
        );
        items = [];
      } else {
        // 串行拉取 + 间隔：twitterapi.io free-tier 限制 5s/次，并发会全部被限流。
        // 单账号失败（suspended/私有/限流）不阻断整批。
        items = [];
        for (const a of accounts) {
          try {
            const acctItems = await this.fetchAccountTweets(
              a.userName,
              5,
              undefined,
              false,
            );
            items.push(...acctItems);
          } catch (err) {
            this.logger.warn(
              `Failed to fetch tweets for @${a.userName}: ${(err as Error).message}`,
            );
          }
          // 间隔 1.2s 拉取（避开 free-tier 5s/次的 QPS；命中缓存则免等待）
          const cachedHit = await this.redis.get(
            `x:acct:${a.userName.toLowerCase()}`,
          );
          if (!cachedHit && accounts.indexOf(a) < accounts.length - 1) {
            await new Promise((r) => setTimeout(r, 1200));
          }
        }
      }
      await this.redis.set(cacheKey, JSON.stringify(items), 300);
    }
    return this.paginate(items, page, limit);
  }

  /**
   * 自由输入单账号最新推文。
   * charge=true 时扣费（用户主动拉取）；聚合调用传 false（聚合层已扣费）。
   */
  async fetchAccountTweets(
    userName: string,
    limit?: number,
    userId?: string,
    charge = true,
  ): Promise<NormalizedTopicItem[]> {
    this.requireApiKey();
    const handle = userName.replace(/^@/, '').trim();
    if (!handle) throw new BadRequestException('userName 不能为空');

    const cacheKey = `x:acct:${handle.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    let items: NormalizedTopicItem[];
    if (cached) {
      items = JSON.parse(cached) as NormalizedTopicItem[];
    } else {
      if (charge && userId) {
        await this.checkAndCharge(userId, 'acct', handle.toLowerCase(), 300);
      }
      // 用 /twitter/user/last_tweets（专为取最新推文设计，includeReplies=false 由 API 侧过滤回复）
      const raw = await this.callTwitterApi(
        `/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}&includeReplies=false`,
      );
      items = this.normalizeTweets(raw, handle);
      await this.redis.set(cacheKey, JSON.stringify(items), 300);
    }
    // 不传 limit 则返回 API 一次返回的全部推文；传了才切片（聚合调用用）
    return typeof limit === 'number' && limit > 0
      ? items.slice(0, limit)
      : items;
  }

  // ─── watch 清单 CRUD（管理员态） ───

  async listAccounts() {
    return this.prisma.twitterWatchAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async addAccount(userName: string, displayName?: string, category?: string) {
    const handle = userName.replace(/^@/, '').trim();
    if (!handle) throw new BadRequestException('userName 不能为空');

    // 校验 handle 存在（调用 user/info）；user/info 返回 {status,msg,data:{userName,...}}
    try {
      const raw = await this.callTwitterApi(
        `/twitter/user/info?userName=${encodeURIComponent(handle)}`,
      );
      const data =
        raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw;
      if (!data || data.unavailable || !data.userName) {
        throw new BadRequestException(`X 账号 @${handle} 不存在或不可访问`);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `X 账号 @${handle} 校验失败: ${(err as Error).message}`,
      );
    }

    return this.prisma.twitterWatchAccount.upsert({
      where: { userName: handle },
      create: { userName: handle, displayName, category },
      update: { displayName, category },
    });
  }

  async removeAccount(id: string) {
    const existing = await this.prisma.twitterWatchAccount.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('账号不存在');
    await this.prisma.twitterWatchAccount.delete({ where: { id } });
    return { id };
  }

  // ─── 内部实现 ───

  private requireApiKey() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('未配置 TWITTERAPI_IO_API_KEY');
    }
  }

  /** 余额检查 + 扣费（缓存未命中分支内调用）。bucketSeconds 与对应缓存 TTL 对齐。 */
  private async checkAndCharge(
    userId: string,
    kind: string,
    dataKey: string,
    bucketSeconds: number,
  ): Promise<void> {
    if (!this.billing.isEnabled()) return;

    let unitPrice = 0.05;
    try {
      const cfg = await this.billing.getConfig('x_trending_fetch');
      unitPrice = Number(cfg?.unitPrice ?? unitPrice);
    } catch {
      // 配置未播种时用默认价
    }
    if (unitPrice <= 0) return;

    // 余额不足 → 阻断拉取，提示充值
    const sufficient = await this.billing.checkBalance(userId, unitPrice);
    if (!sufficient) {
      throw new InsufficientBalanceException(unitPrice, 0);
    }

    // 幂等键按 TTL 桶：同用户同数据在窗口内重复拉取（缓存被清/多实例）不重复扣费
    const bucket = Math.floor(Date.now() / 1000 / bucketSeconds);
    const idempotencyKey = `x_fetch:${userId}:${kind}:${dataKey}:${bucket}`;
    try {
      await this.billing.deduct({
        userId,
        type: TransactionType.DATA_FETCH,
        category: BillingCategory.OTHER,
        amount: unitPrice,
        description: 'X 数据源拉取',
        quantity: 1,
        unitPrice,
        idempotencyKey,
      });
    } catch (err) {
      // 扣费失败不阻断拉取（best-effort，与 AI/publish 一致）
      this.logger.warn(
        `X fetch billing failed (non-blocking): ${(err as Error).message}`,
      );
    }
  }

  /** 调用 twitterapi.io REST API。按需挂代理。返回解包后的 payload（剥掉 {status,msg,data} 外壳）。 */
  private async callTwitterApi(path: string): Promise<TwitterApiResponse> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit & { dispatcher?: unknown } = {
      method: 'GET',
      headers: { 'x-api-key': this.apiKey! },
      signal: AbortSignal.timeout(15000),
    };
    if (this.proxyEnabled && this.proxyUrl) {
      // undici 随 Node 20+ 内置；原生 fetch 不读 HTTP_PROXY，须显式 dispatcher
      const { ProxyAgent } = await import('undici');
      init.dispatcher = new ProxyAgent(this.proxyUrl);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`twitterapi.io ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as TwitterApiResponse;
    // twitterapi.io 多数端点返回 {status, msg, data:{...}}；trends 端点直接在顶层放 trends。
    // 这里返回整个 json，由各 normalize 方法自行解包；同时把 HTTP 层错误信息抛出。
    if (
      json &&
      json.status &&
      json.status !== 'success' &&
      json.status !== 'ok'
    ) {
      throw new Error(
        `twitterapi.io: ${json.msg || json.message || json.status}`,
      );
    }
    return json;
  }

  /**
   * 归一化趋势榜响应到通用条目形状。
   * twitterapi.io 真实结构：{ trends: [{ trend: { name, rank, ... } }] }
   * （trend 是对象，不是字符串；返回 rank 排名而非 tweet_volume）
   * 兼容顶层平铺的 {name, tweet_volume, url} 形态作回退。
   */
  private normalizeTrends(raw: TwitterApiResponse): NormalizedTopicItem[] {
    const trends = raw?.trends || [];
    if (trends.length > 0) {
      this.logger.debug(
        `normalizeTrends first item shape: ${JSON.stringify(trends[0]).slice(0, 300)}`,
      );
    }
    return trends.map((t) => {
      // twitterapi.io: t.trend 是 {name, rank, ...}；也兼容平铺形态
      const inner: TwitterTrendRaw =
        t.trend && typeof t.trend === 'object' ? t.trend : t;
      const name = String(inner.name ?? '');
      const rank = typeof inner.rank === 'number' ? inner.rank : undefined;
      const volume =
        inner.tweet_volume ?? inner.tweetVolume ?? t.tweet_volume ?? undefined;
      // heatScore：优先 volume，否则 rank 越小越热（rank 1 → 99），否则 50
      let heatScore = 50;
      if (typeof volume === 'number' && volume > 0) {
        heatScore = Math.min(99, Math.max(10, Math.round(volume / 1000)));
      } else if (rank) {
        heatScore = Math.max(10, Math.min(99, 100 - rank));
      }
      const url =
        inner.url ||
        t.url ||
        `https://x.com/search?q=${encodeURIComponent(name)}`;
      return {
        title: name,
        description: name,
        source: 'x-trends',
        heatScore,
        tags: name.startsWith('#') ? [name] : [],
        articles: [{ title: name, source: 'x-trends', snippet: name, url }],
      };
    });
  }

  /**
   * 归一化用户推文响应到通用条目形状（camelCase 字段，过滤回复与转推）。
   * twitterapi.io 结构：{status, msg, data:{tweets:[{id,text,likeCount,...}]}}
   * 账号被冻结/私有/不可用时 data 为 {unavailable:true, message} → 返回空数组 + 日志。
   */
  private normalizeTweets(
    raw: TwitterApiResponse,
    handle: string,
  ): NormalizedTopicItem[] {
    // 解包 data 外壳（user/tweets 用 {status,msg,data:{...}}；兼容顶层平铺）
    const payload =
      raw &&
      typeof raw === 'object' &&
      'data' in raw &&
      raw.data &&
      typeof raw.data === 'object'
        ? raw.data
        : raw;
    // 账号不可用（suspended/protected）→ 优雅返回空
    if (payload?.unavailable) {
      this.logger.warn(
        `X account @${handle} unavailable: ${payload.message || payload.unavailableReason || 'unknown'}`,
      );
      return [];
    }
    const tweets = payload?.tweets || [];
    return tweets
      .filter((tw) => {
        // 剔除回复（回复不适合做选题）
        if (tw.isReply === true) return false;
        // 剔除转推
        if (tw.type === 'retweet') return false;
        if (typeof tw.text === 'string' && tw.text.startsWith('RT @'))
          return false;
        return true;
      })
      .map((tw) => {
        const text = typeof tw.text === 'string' ? tw.text : '';
        const engagement =
          (Number(tw.likeCount) || 0) +
          (Number(tw.retweetCount) || 0) +
          (Number(tw.replyCount) || 0);
        const tweetId = String(tw.id ?? '');
        return {
          title: text.slice(0, 80),
          description: text,
          source: handle,
          heatScore: engagement || 50,
          tags: [],
          articles: [
            {
              title: text.slice(0, 80),
              source: `@${handle}`,
              snippet: text,
              url: tw.url || `https://x.com/${handle}/status/${tweetId}`,
            },
          ],
        };
      });
  }

  private paginate(items: any[], page: number, limit: number) {
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      items: items.slice(start, end),
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit) || 1,
    };
  }
}
