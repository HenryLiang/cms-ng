jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

jest.mock('rss-parser', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import Parser from 'rss-parser';

describe('TrendingTopicsService', () => {
  let service: TrendingTopicsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let aiService: { generateStorySuggestions: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    aiService = { generateStorySuggestions: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendingTopicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AIService, useValue: aiService },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get<TrendingTopicsService>(TrendingTopicsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockTopic = (override?: any) => ({
    id: 'topic-id',
    title: 'Test Topic',
    description: 'Desc',
    source: 'twitter',
    heatScore: 50,
    tags: '["tag1"]',
    status: 'OPEN',
    suggestedAngles: null,
    createdBy: 'user-id',
    adoptedStoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...override,
  });

  describe('create', () => {
    it('should create topic with serialized tags', async () => {
      prisma.trendingTopic.create.mockResolvedValue(mockTopic());

      const result = await service.create('user-id', {
        title: 'Test Topic',
        description: 'Desc',
        source: 'twitter',
        heatScore: 50,
        tags: ['tag1'],
        status: 'OPEN',
      } as any);

      expect(prisma.trendingTopic.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Topic',
          tags: '["tag1"]',
          heatScore: 50,
          status: 'OPEN',
          createdBy: 'user-id',
        }),
      });
      expect(result.tags).toEqual(['tag1']);
    });
  });

  describe('findAll', () => {
    it('should return topics ordered by heatScore', async () => {
      prisma.trendingTopic.findMany.mockResolvedValue([
        mockTopic({ id: 't1', heatScore: 90 }),
        mockTopic({ id: 't2', heatScore: 30 }),
      ]);

      const result = await service.findAll();

      expect(prisma.trendingTopic.findMany).toHaveBeenCalledWith({
        orderBy: [{ heatScore: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toHaveLength(2);
      expect(result[0].heatScore).toBe(90);
    });
  });

  describe('findOne', () => {
    it('should return topic', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());

      const result = await service.findOne('topic-id');

      expect(prisma.trendingTopic.findUnique).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
      });
      expect(result.id).toBe('topic-id');
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update topic and parse tags', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());
      prisma.trendingTopic.update.mockResolvedValue(mockTopic({ tags: '["updated"]' }));

      const result = await service.update('topic-id', { tags: ['updated'] } as any, 'user-id', 'REPORTER');

      expect(prisma.trendingTopic.update).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
        data: expect.objectContaining({ tags: '["updated"]' }),
      });
      expect(result.tags).toEqual(['updated']);
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', {}, 'user-id', 'REPORTER')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({ createdBy: 'other-user' }));

      await expect(service.update('topic-id', { title: 'Hacked' } as any, 'user-id', 'REPORTER')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete topic when found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic());
      prisma.trendingTopic.delete.mockResolvedValue(mockTopic());

      const result = await service.remove('topic-id', 'user-id', 'REPORTER');

      expect(prisma.trendingTopic.delete).toHaveBeenCalledWith({ where: { id: 'topic-id' } });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'user-id', 'REPORTER')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({ createdBy: 'other-user' }));

      await expect(service.remove('topic-id', 'user-id', 'REPORTER')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateAISuggestions', () => {
    it('should call AI service with user profile and recent topics', async () => {
      prisma.user.findUnique.mockResolvedValue({
        name: 'Test User',
        expertise: '["tech"]',
        department: 'News',
      });
      prisma.trendingTopic.findMany.mockResolvedValue([
        { title: 'Topic A' },
        { title: 'Topic B' },
      ]);
      aiService.generateStorySuggestions.mockResolvedValue([
        { title: 'Suggestion 1', description: 'Desc', suggestedAngle: 'Angle', reason: 'Reason' },
      ]);

      const result = await service.generateAISuggestions('user-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: { name: true, expertise: true, department: true },
      });
      expect(aiService.generateStorySuggestions).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({ name: 'Test User', expertise: ['tech'], department: 'News' }),
        ['Topic A', 'Topic B'],
      );
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.generateAISuggestions('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('adoptTopic', () => {
    it('should create story and mark topic as adopted', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({
        suggestedAngles: '["Angle 1", "Angle 2"]',
      }));
      prisma.story.create.mockResolvedValue({ id: 'story-id' });
      prisma.trendingTopic.update.mockResolvedValue(mockTopic());

      const result = await service.adoptTopic('topic-id', 'user-id');

      expect(prisma.story.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Topic',
          angle: 'Angle 1',
          status: 'DRAFT',
          priority: 1,
          reporterId: 'user-id',
        }),
      });
      expect(prisma.trendingTopic.update).toHaveBeenCalledWith({
        where: { id: 'topic-id' },
        data: { status: 'ADOPTED', adoptedStoryId: 'story-id' },
      });
      expect(result.storyId).toBe('story-id');
    });

    it('should throw NotFoundException when topic not found', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(null);

      await expect(service.adoptTopic('nonexistent', 'user-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when topic is already adopted', async () => {
      prisma.trendingTopic.findUnique.mockResolvedValue(mockTopic({ status: 'ADOPTED', adoptedStoryId: 'existing-story-id' }));

      await expect(service.adoptTopic('topic-id', 'user-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('fetchGoogleTrends', () => {
    const MockedParser = Parser as unknown as jest.Mock;

    beforeEach(() => {
      MockedParser.mockClear();
    });

    it('should parse merged-format news items and map to topics', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{
          title: 'Trend 1',
          contentSnippet: 'Snippet',
          'ht:approx_traffic': '50,000+',
          'ht:news_item': {
            'ht:news_item_title': ['News 1', 'News 2'],
            'ht:news_item_snippet': ['Snippet 1', 'Snippet 2'],
            'ht:news_item_url': ['http://a.com', 'http://b.com'],
            'ht:news_item_source': ['Source A', 'Source B'],
          },
        }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchGoogleTrends('HK', 'today');

      expect(mockParseURL).toHaveBeenCalledWith('https://trends.google.com/trending/rss?geo=HK');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Trend 1');
      expect(result.items[0].heatScore).toBe(98);
      expect(result.items[0].articles).toHaveLength(2);
      expect(result.items[0].articles[0].title).toBe('News 1');
    });

    it('should handle single news item format', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{
          title: 'Trend 2',
          'ht:approx_traffic': '5,000+',
          'ht:news_item': {
            'ht:news_item_title': 'Single News',
            'ht:news_item_snippet': 'Single Snippet',
            'ht:news_item_url': 'http://single.com',
            'ht:news_item_source': 'Single Source',
          },
        }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchGoogleTrends('US', 'week');

      expect(result.items[0].articles).toHaveLength(1);
      expect(result.items[0].articles[0].title).toBe('Single News');
      expect(result.items[0].heatScore).toBe(85);
    });

    it('should default geo to HK when empty', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({ items: [] });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      await service.fetchGoogleTrends('', 'today');

      expect(mockParseURL).toHaveBeenCalledWith('https://trends.google.com/trending/rss?geo=HK');
    });

    it('should return empty paginated result when feed has no items', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({ items: [] });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchGoogleTrends('HK', 'today');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1);
    });

    it('should throw error when RSS parser fails', async () => {
      const mockParseURL = jest.fn().mockRejectedValue(new Error('Network timeout'));
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      await expect(service.fetchGoogleTrends('HK', 'today')).rejects.toThrow('Google Trends 获取失败');
    });
  });

  describe('Bilibili data sources', () => {
    const MockedParser = Parser as unknown as jest.Mock;

    beforeEach(() => {
      MockedParser.mockClear();
    });

    it('fetchNewsBySource should parse bilibili-hot-search RSS', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          { title: 'B站热搜 1', contentSnippet: '描述 1', link: 'https://www.bilibili.com/video/BV1' },
          { title: 'B站热搜 2', contentSnippet: '描述 2', link: 'https://www.bilibili.com/video/BV2' },
        ],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchNewsBySource('bilibili-hot-search', 1, 10);

      expect(mockParseURL).toHaveBeenCalledWith(
        expect.stringMatching(/\/bilibili\/hot-search$/),
      );
      expect(result.items).toHaveLength(2);
      expect(result.items[0].source).toBe('bilibili-hot-search');
      expect(result.items[0].articles[0].url).toBe('https://www.bilibili.com/video/BV1');
    });

    it('fetchNewsBySource should parse bilibili-ranking RSS', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({ items: [] });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      await service.fetchNewsBySource('bilibili-ranking', 1, 10);

      // /bilibili/popular/all 综合热门（ranking API 被 B站 -352 风控，改用 popular/all）
      expect(mockParseURL).toHaveBeenCalledWith(
        expect.stringMatching(/\/bilibili\/popular\/all$/),
      );
    });

    it('fetchNewsBySource returns empty (not 500) when upstream RSSHub fails', async () => {
      // B站 -352 风控等上游失败 -> 容错返回空分页，不抛错（前端显示「暂无数据」）
      const mockParseURL = jest.fn().mockRejectedValue(new Error('-352 risk control'));
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchNewsBySource('bilibili-ranking', 1, 10);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('fetchBilibiliPartitionRanking retries on -352 then returns empty if all fail', async () => {
      // B站 -352 是概率性的，重试 3 次；全失败才返空（不抛 500）
      const mockParseURL = jest.fn().mockRejectedValue(new Error('-352 risk control'));
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchBilibiliPartitionRanking(36, 1, 10);

      expect(mockParseURL).toHaveBeenCalledTimes(3); // 重试 3 次
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('fetchBilibiliPartitionRanking succeeds on retry after initial -352', async () => {
      // 第 1 次 -352 失败，第 2 次成功 -> 返回数据（验证重试有效）
      const mockParseURL = jest
        .fn()
        .mockRejectedValueOnce(new Error('-352 risk control'))
        .mockResolvedValueOnce({
          items: [{ title: '知识区热门', contentSnippet: '描述', link: 'https://www.bilibili.com/video/BV9' }],
        });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchBilibiliPartitionRanking(36, 1, 10);

      expect(mockParseURL).toHaveBeenCalledTimes(2);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].source).toBe('bilibili-partion');
    });

    it('fetchBilibiliPartitionRanking should interpolate tid into the URL', async () => {
      // 用两个不同 tid 验证 tid 确实被插值（而非硬编码），单个 tid 无法区分二者。
      // 走 /bilibili/ranking/:rid（partion/ranking 路由当前失效）。
      for (const tid of [36, 122]) {
        const mockParseURL = jest.fn().mockResolvedValue({
          items: [{ title: `分区${tid}热门`, contentSnippet: '描述', link: `https://www.bilibili.com/video/BV${tid}` }],
        });
        MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

        const result = await service.fetchBilibiliPartitionRanking(tid, 1, 10);

        expect(mockParseURL).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`/bilibili/ranking/${tid}$`)),
        );
        expect(result.items).toHaveLength(1);
        expect(result.items[0].source).toBe('bilibili-partion');
      }
    });

    it('fetchAllTrendingNews aggregates sources, dedupes by title, and isolates feed failures', async () => {
      // 按 URL 区分返回内容：bilibili-hot-search 返回 2 条（其中 1 条与 bilibili-ranking 撞标题），
      // bilibili-ranking 返回 1 条，其余源 reject（验证 Promise.allSettled 不被单源失败拖垮）。
      const mockParseURL = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/bilibili/hot-search')) {
          return Promise.resolve({
            items: [
              { title: '撞标题的话题', contentSnippet: 'a', link: 'http://x/1' },
              { title: 'B站热搜独有', contentSnippet: 'b', link: 'http://x/2' },
            ],
          });
        }
        if (url.includes('/bilibili/popular/all')) {
          return Promise.resolve({
            items: [{ title: '撞标题的话题', contentSnippet: 'c', link: 'http://x/3' }],
          });
        }
        return Promise.reject(new Error('simulated feed failure'));
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchAllTrendingNews('HK', 1, 50);

      // 两个 B 站源都被实际拉取
      expect(mockParseURL).toHaveBeenCalledWith(expect.stringMatching(/\/bilibili\/hot-search$/));
      expect(mockParseURL).toHaveBeenCalledWith(expect.stringMatching(/\/bilibili\/popular\/all$/));
      // 撞标题的去重后只剩 1 条 -> 共 2 条
      const titles = result.items.map((i: any) => i.title);
      expect(titles).toContain('B站热搜独有');
      expect(titles.filter((t: string) => t === '撞标题的话题')).toHaveLength(1);
      // 单源失败不阻断聚合（其余源全 reject，但 B 站两条仍返回）
      expect(result.total).toBe(2);
    });
  });

  describe('Weibo / Zhihu hot search sources', () => {
    const MockedParser = Parser as unknown as jest.Mock;

    beforeEach(() => {
      MockedParser.mockClear();
    });

    it('fetchNewsBySource should parse weibo-hot RSS', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{ title: '微博热搜 1', contentSnippet: '描述', link: 'https://s.weibo.com/weibo?q=1' }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchNewsBySource('weibo-hot', 1, 10);

      expect(mockParseURL).toHaveBeenCalledWith(
        expect.stringMatching(/\/weibo\/search\/hot\?limit=50$/),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].source).toBe('weibo-hot');
    });

    it('fetchNewsBySource should parse zhihu-hot RSS', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{ title: '知乎热榜 1', contentSnippet: '描述', link: 'https://www.zhihu.com/question/1' }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchNewsBySource('zhihu-hot', 1, 10);

      expect(mockParseURL).toHaveBeenCalledWith(
        expect.stringMatching(/\/zhihu\/hot\?limit=50$/),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].source).toBe('zhihu-hot');
    });
  });

  describe('NHK news source', () => {
    const MockedParser = Parser as unknown as jest.Mock;

    beforeEach(() => {
      MockedParser.mockClear();
    });

    it('fetchNHKNews aggregates categories, dedupes by title, and paginates', async () => {
      // 按分类 URL 返回不同条目；cat0 与 cat1 撞一条标题验证去重
      const mockParseURL = jest.fn().mockImplementation((url: string) => {
        if (url.includes('cat0.xml')) {
          return Promise.resolve({ items: [{ title: '共通标题', contentSnippet: 'a', link: 'http://nhk/0' }] });
        }
        if (url.includes('cat1.xml')) {
          return Promise.resolve({
            items: [
              { title: '共通标题', contentSnippet: 'b', link: 'http://nhk/1' },
              { title: '社会新闻 1', contentSnippet: 'c', link: 'http://nhk/2' },
            ],
          });
        }
        return Promise.resolve({ items: [] });
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchNHKNews(1, 10);

      // 8 个分类都被拉取
      expect(mockParseURL).toHaveBeenCalledWith(expect.stringMatching(/\/rss\/news\/cat0\.xml$/));
      expect(mockParseURL).toHaveBeenCalledWith(expect.stringMatching(/\/rss\/news\/cat7\.xml$/));
      // 撞标题去重后剩 2 条（共通标题 + 社会新闻 1）
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].source).toBe('nhk');
    });

    it('fetchNHKNews serves page 2 from cache without re-fetching (within TTL)', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{ title: '缓存测试', contentSnippet: 'x', link: 'http://nhk/c' }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      await service.fetchNHKNews(1, 10);
      const callsAfterFirst = mockParseURL.mock.calls.length;
      await service.fetchNHKNews(2, 10); // 翻页 -> 走缓存，不重新拉 8 个源
      expect(mockParseURL.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  describe('Reuters news source', () => {
    const MockedParser = Parser as unknown as jest.Mock;

    beforeEach(() => {
      MockedParser.mockClear();
    });

    it('fetchNewsBySource should parse reuters RSS (via Google News)', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [{ title: 'Stripe offers to buy PayPal - Reuters', contentSnippet: 'desc', link: 'https://news.google.com/r/1' }],
      });
      MockedParser.mockImplementation(() => ({ parseURL: mockParseURL }));

      const result = await service.fetchNewsBySource('reuters', 1, 10);

      expect(mockParseURL).toHaveBeenCalledWith(
        expect.stringMatching(/news\.google\.com\/rss\/search\?q=site:reuters\.com/),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].source).toBe('reuters');
    });
  });

  describe('parseTrafficToScore (private)', () => {
    it('should return 50 for empty traffic', () => {
      expect((service as any).parseTrafficToScore('')).toBe(50);
    });

    it('should return 98 for 50,000+', () => {
      expect((service as any).parseTrafficToScore('50,000+')).toBe(98);
    });

    it('should return 95 for 20,000+', () => {
      expect((service as any).parseTrafficToScore('20,000+')).toBe(95);
    });

    it('should return 90 for 10,000+', () => {
      expect((service as any).parseTrafficToScore('10,000+')).toBe(90);
    });

    it('should return 85 for 5,000+', () => {
      expect((service as any).parseTrafficToScore('5,000+')).toBe(85);
    });

    it('should return 80 for 2,000+', () => {
      expect((service as any).parseTrafficToScore('2,000+')).toBe(80);
    });

    it('should return 75 for 1,000+', () => {
      expect((service as any).parseTrafficToScore('1,000+')).toBe(75);
    });

    it('should return 70 for 500+', () => {
      expect((service as any).parseTrafficToScore('500+')).toBe(70);
    });

    it('should return 65 for 200+', () => {
      expect((service as any).parseTrafficToScore('200+')).toBe(65);
    });

    it('should return 60 for 100+', () => {
      expect((service as any).parseTrafficToScore('100+')).toBe(60);
    });

    it('should return 50 for low traffic', () => {
      expect((service as any).parseTrafficToScore('50+')).toBe(50);
    });
  });

  describe('normalizeNewsItems (private)', () => {
    it('should return empty array for null input', () => {
      expect((service as any).normalizeNewsItems(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect((service as any).normalizeNewsItems(undefined)).toEqual([]);
    });

    it('should handle merged format with array properties', () => {
      const input = {
        'ht:news_item_title': ['Title 1', 'Title 2'],
        'ht:news_item_snippet': ['Snippet 1', 'Snippet 2'],
        'ht:news_item_url': ['http://a.com', 'http://b.com'],
        'ht:news_item_source': ['Source A', 'Source B'],
      };
      const result = (service as any).normalizeNewsItems(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Title 1',
        snippet: 'Snippet 1',
        url: 'http://a.com',
        source: 'Source A',
      });
    });

    it('should handle single object format', () => {
      const input = {
        'ht:news_item_title': 'Single Title',
        'ht:news_item_snippet': 'Single Snippet',
        'ht:news_item_url': 'http://single.com',
        'ht:news_item_source': 'Single Source',
      };
      const result = (service as any).normalizeNewsItems(input);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Single Title');
    });

    it('should use title as snippet fallback when snippet is empty', () => {
      const input = {
        'ht:news_item_title': 'Title Only',
        'ht:news_item_snippet': '',
        'ht:news_item_url': 'http://x.com',
        'ht:news_item_source': '',
      };
      const result = (service as any).normalizeNewsItems(input);
      expect(result[0].snippet).toBe('Title Only');
    });
  });
});
