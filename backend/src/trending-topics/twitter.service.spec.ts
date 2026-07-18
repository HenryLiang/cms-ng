import { Test, TestingModule } from '@nestjs/testing';
import {
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwitterService } from './twitter.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BillingService } from '../billing/billing.service';

// Mock undici ProxyAgent (dynamic import in service)
jest.mock('undici', () => ({
  ProxyAgent: jest.fn(() => ({})),
}));

describe('TwitterService', () => {
  let service: TwitterService;
  let prisma: { twitterWatchAccount: any };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let billing: {
    isEnabled: jest.Mock;
    getConfig: jest.Mock;
    checkBalance: jest.Mock;
    deduct: jest.Mock;
  };
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    prisma = {
      twitterWatchAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    billing = {
      isEnabled: jest.fn().mockReturnValue(true),
      getConfig: jest.fn().mockResolvedValue({ unitPrice: 0.05 }),
      checkBalance: jest.fn().mockResolvedValue(true),
      deduct: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: BillingService, useValue: billing },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                TWITTERAPI_IO_API_KEY: 'test-key',
                TWITTERAPI_IO_BASE_URL: 'https://api.twitterapi.io',
                TWITTERAPI_IO_WOEIDS: '1,23424977',
                TWITTERAPI_IO_PROXY_ENABLED: 'false',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<TwitterService>(TwitterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getWoeids', () => {
    it('returns parsed WOEIDs with labels, falling back for unknown', () => {
      const result = service.getWoeids();
      expect(result).toEqual([
        { woeid: 1, label: '全球' },
        { woeid: 23424977, label: '美国' },
      ]);
    });
  });

  it('describes X sources and dispatches a generic source query', async () => {
    redis.get.mockResolvedValue(JSON.stringify([]));
    prisma.twitterWatchAccount.findMany.mockResolvedValue([
      { userName: 'openai', displayName: 'OpenAI' },
    ]);

    const definitions = await service.listDefinitions({
      userId: 'u1',
      includeParameterOptions: true,
    });
    const page = await service.fetch(
      'x-trends',
      { userId: 'u1' },
      { page: 2, limit: 5, params: { woeid: 23424977 } },
    );

    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'x-trends' }),
        expect.objectContaining({ id: 'x-accounts' }),
      ]),
    );
    expect(
      definitions.find((definition) => definition.id === 'x-accounts')
        ?.parameters?.[0],
    ).toEqual(
      expect.objectContaining({
        kind: 'combobox',
        options: [{ value: 'openai', label: '@openai · OpenAI' }],
      }),
    );
    expect(redis.get).toHaveBeenCalledWith('x:trends:23424977');
    expect(page).toEqual(expect.objectContaining({ page: 2, limit: 5 }));
  });

  describe('fetchTrends', () => {
    it('throws ServiceUnavailableException when API key missing', async () => {
      // Re-instantiate with no key
      const module = await Test.createTestingModule({
        providers: [
          TwitterService,
          { provide: PrismaService, useValue: prisma },
          { provide: RedisService, useValue: redis },
          { provide: BillingService, useValue: billing },
          { provide: ConfigService, useValue: { get: () => undefined } },
        ],
      }).compile();
      const noKeyService = module.get<TwitterService>(TwitterService);
      await expect(noKeyService.fetchTrends('u1', 1)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns cached trends without calling API or charging', async () => {
      const cached = [{ title: '#cached', source: 'x-trends' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.fetchTrends('u1', 1, 1, 10);

      expect(redis.get).toHaveBeenCalledWith('x:trends:1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(billing.deduct).not.toHaveBeenCalled();
      expect(result.items).toEqual(cached);
    });

    it('fetches, charges, normalizes and caches on cache miss', async () => {
      // Cache miss (default mock returns null)
      // twitterapi.io 真实结构：trends: [{ trend: { name, rank, ... } }]
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            trends: [
              {
                trend: {
                  name: '#AI',
                  rank: 1,
                  url: 'https://x.com/search?q=%23AI',
                },
              },
              { trend: { name: 'BreakingNews', rank: 5 } },
            ],
          }),
      });

      const result = await service.fetchTrends('u1', 1, 1, 10);

      // Charged once
      expect(billing.checkBalance).toHaveBeenCalledWith('u1', 0.05);
      expect(billing.deduct).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          idempotencyKey: expect.stringMatching(/^x_fetch:u1:trends:1:\d+$/),
        }),
      );
      // Fetched the API
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.twitterapi.io/twitter/trends?woeid=1',
        expect.objectContaining({ headers: { 'x-api-key': 'test-key' } }),
      );
      // Cached
      expect(redis.set).toHaveBeenCalledWith(
        'x:trends:1',
        expect.any(String),
        600,
      );
      // Normalized — rank-based heatScore: rank 1 → 99, rank 5 → 95
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        title: '#AI',
        source: 'x-trends',
        heatScore: 99,
      });
      expect(result.items[0].tags).toEqual(['#AI']); // hashtag → tag
      expect(result.items[0].articles[0].url).toBe(
        'https://x.com/search?q=%23AI',
      );
      expect(result.items[1].heatScore).toBe(95); // rank 5 → 95
      expect(result.items[1].tags).toEqual([]); // non-hashtag → no tags
    });

    it('does not charge when BILLING_ENABLED is false', async () => {
      billing.isEnabled.mockReturnValue(false);
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ trends: [] }),
      });

      await service.fetchTrends('u1', 1);

      expect(billing.checkBalance).not.toHaveBeenCalled();
      expect(billing.deduct).not.toHaveBeenCalled();
    });
  });

  describe('fetchAccountTweets', () => {
    it('filters replies and retweets, normalizes camelCase fields', async () => {
      // twitterapi.io /twitter/user/last_tweets 真实结构：{status, msg, data:{tweets:[...], pin_tweet}}
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            msg: 'success',
            data: {
              tweets: [
                {
                  id: '1',
                  text: 'Original post',
                  likeCount: 10,
                  retweetCount: 5,
                  replyCount: 2,
                  isReply: false,
                  type: 'tweet',
                },
                { id: '2', text: 'A reply', isReply: true },
                { id: '3', text: 'RT @someone: shared', type: 'retweet' },
                {
                  id: '4',
                  text: 'Second original',
                  likeCount: 0,
                  retweetCount: 0,
                  replyCount: 0,
                  isReply: false,
                },
              ],
            },
          }),
      });

      const items = await service.fetchAccountTweets('elonmusk', 5, 'u1', true);

      expect(items).toHaveLength(2); // reply + retweet filtered out, 2 originals remain
      expect(items[0].title).toBe('Original post');
      expect(items[0].heatScore).toBe(17); // 10+5+2
      expect(items[0].articles[0].url).toBe('https://x.com/elonmusk/status/1');
      // engagement 0 → fallback 50
      expect(items[1].heatScore).toBe(50);
      // charged
      expect(billing.deduct).toHaveBeenCalled();
    });

    it('also tolerates top-level tweets shape {tweets:[...]}', async () => {
      // 防御性：万一某端点把 tweets 放顶层（无 data 外壳），解包逻辑应回退到 raw
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            msg: 'success',
            tweets: [{ id: '9', text: 'x', isReply: false }],
          }),
      });
      const items = await service.fetchAccountTweets(
        'someacct',
        undefined,
        'u1',
        true,
      );
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('x');
    });

    it('returns empty array when account unavailable (suspended/protected)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            msg: 'success',
            data: {
              unavailable: true,
              message: 'User is suspended',
              unavailableReason: 'Suspended',
            },
          }),
      });
      const items = await service.fetchAccountTweets('someacct', 5, 'u1', true);
      expect(items).toEqual([]);
    });

    it('strips leading @ from userName and lowercases cache key', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            msg: 'success',
            data: { tweets: [] },
          }),
      });
      await service.fetchAccountTweets('@ElonMusk', 5, 'u1', true);
      expect(redis.set).toHaveBeenCalledWith(
        'x:acct:elonmusk',
        expect.any(String),
        300,
      );
    });

    it('throws BadRequestException for empty userName', async () => {
      await expect(service.fetchAccountTweets('   ', 5, 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('fetchAggregatedAccounts', () => {
    it('serial fetch — one account failing does not break the batch', async () => {
      prisma.twitterWatchAccount.findMany.mockResolvedValue([
        { userName: 'ok_account' },
        { userName: 'bad_account' },
      ]);
      // First account returns a tweet (data wrapper); second account's fetch rejects (suspended)
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              msg: 'success',
              data: { tweets: [{ id: '1', text: 'hi', isReply: false }] },
            }),
        })
        .mockRejectedValueOnce(new Error('account suspended'));

      const result = await service.fetchAggregatedAccounts('u1', 1, 20);

      expect(result.items).toHaveLength(1); // only the ok account
      expect(result.items[0].source).toBe('ok_account');
      // charged once at aggregate level (not per-account)
      expect(billing.deduct).toHaveBeenCalledTimes(1);
    });

    it('returns empty when no watched accounts', async () => {
      prisma.twitterWatchAccount.findMany.mockResolvedValue([]);
      const result = await service.fetchAggregatedAccounts('u1', 1, 20);
      expect(result.items).toEqual([]);
    });

    it('serves from aggregate cache without charging', async () => {
      const cached = [{ title: 'cached tweet', source: 'someacct' }];
      redis.get.mockResolvedValue(JSON.stringify(cached));
      const result = await service.fetchAggregatedAccounts('u1', 1, 20);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(billing.deduct).not.toHaveBeenCalled();
      expect(result.items).toEqual(cached);
    });
  });

  describe('addAccount', () => {
    it('validates handle via user/info then upserts', async () => {
      // user/info 真实结构：{status, msg, data:{userName,...}}
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            msg: 'success',
            data: { userName: 'elonmusk', id: '1' },
          }),
      });
      prisma.twitterWatchAccount.upsert.mockResolvedValue({
        id: '1',
        userName: 'elonmusk',
      });

      const result = await service.addAccount('@elonmusk', 'Elon');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.twitterapi.io/twitter/user/info?userName=elonmusk',
        expect.anything(),
      );
      expect(prisma.twitterWatchAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userName: 'elonmusk' },
          create: { userName: 'elonmusk', displayName: 'Elon' },
        }),
      );
      expect(result.userName).toBe('elonmusk');
    });

    it('throws BadRequestException when handle is unavailable/not found', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            msg: 'success',
            data: { unavailable: true, message: 'User not found' },
          }),
      });
      await expect(service.addAccount('nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when fetch itself fails', async () => {
      fetchMock.mockRejectedValue(new Error('404'));
      await expect(service.addAccount('nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
