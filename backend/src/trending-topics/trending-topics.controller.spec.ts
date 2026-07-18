import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TrendingTopicsController } from './trending-topics.controller';
import { TrendingTopicsService } from './trending-topics.service';
import { TwitterService } from './twitter.service';
import { WikipediaService } from './wikipedia.service';
import { SourcePaginationDto } from './dto/source-pagination.dto';
import { TopicSourceCatalog } from './sources/topic-source.catalog';

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

describe('TrendingTopicsController', () => {
  let controller: TrendingTopicsController;
  let topicsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    generateAISuggestions: jest.Mock;
    fetchNewsBySource: jest.Mock;
    fetchBilibiliPartitionRanking: jest.Mock;
    fetchNHKNews: jest.Mock;
    importFromGoogleTrends: jest.Mock;
    importTopic: jest.Mock;
    adoptTopic: jest.Mock;
  };
  let twitterService: {
    getWoeids: jest.Mock;
    fetchTrends: jest.Mock;
    fetchAggregatedAccounts: jest.Mock;
    fetchAccountTweets: jest.Mock;
    listAccounts: jest.Mock;
    addAccount: jest.Mock;
    removeAccount: jest.Mock;
  };
  let wikipediaService: {
    fetchOnThisDay: jest.Mock;
  };
  let sourceCatalog: {
    listSources: jest.Mock;
    fetch: jest.Mock;
  };

  beforeEach(async () => {
    topicsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      generateAISuggestions: jest.fn(),
      fetchNewsBySource: jest.fn(),
      fetchBilibiliPartitionRanking: jest.fn(),
      fetchNHKNews: jest.fn(),
      importFromGoogleTrends: jest.fn(),
      importTopic: jest.fn(),
      adoptTopic: jest.fn(),
    };
    twitterService = {
      getWoeids: jest.fn(),
      fetchTrends: jest.fn(),
      fetchAggregatedAccounts: jest.fn(),
      fetchAccountTweets: jest.fn(),
      listAccounts: jest.fn(),
      addAccount: jest.fn(),
      removeAccount: jest.fn(),
    };
    wikipediaService = {
      fetchOnThisDay: jest.fn(),
    };
    sourceCatalog = {
      listSources: jest.fn(),
      fetch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrendingTopicsController],
      providers: [
        { provide: TrendingTopicsService, useValue: topicsService },
        { provide: TwitterService, useValue: twitterService },
        { provide: WikipediaService, useValue: wikipediaService },
        { provide: TopicSourceCatalog, useValue: sourceCatalog },
      ],
    }).compile();

    controller = module.get<TrendingTopicsController>(TrendingTopicsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generic source interface', () => {
    it('lists sources and fetches any source through the catalog', async () => {
      sourceCatalog.listSources.mockResolvedValue([
        { id: 'bbc', label: 'BBC' },
      ]);
      sourceCatalog.fetch.mockResolvedValue({
        items: [],
        total: 0,
        page: 2,
        limit: 5,
        totalPages: 1,
      });

      await expect(controller.listSources('user-id')).resolves.toEqual({
        success: true,
        data: [expect.objectContaining({ id: 'bbc' })],
      });
      await expect(
        controller.fetchSource('user-id', 'bbc', {
          page: 2,
          limit: 5,
          geo: 'US',
        }),
      ).resolves.toEqual({
        success: true,
        data: expect.objectContaining({ page: 2 }),
      });
      expect(sourceCatalog.fetch).toHaveBeenCalledWith(
        'bbc',
        { userId: 'user-id' },
        { page: 2, limit: 5, params: { geo: 'US' } },
      );
    });
  });

  describe('create', () => {
    it('should call topicsService.create', async () => {
      topicsService.create.mockResolvedValue({ id: 't1', title: 'Topic' });

      const result = await controller.create('user-id', {
        title: 'Topic',
      });

      expect(topicsService.create).toHaveBeenCalledWith('user-id', {
        title: 'Topic',
      });
      expect(result.id).toBe('t1');
    });
  });

  describe('findAll', () => {
    it('should return all topics', async () => {
      topicsService.findAll.mockResolvedValue([{ id: 't1' }]);

      const result = await controller.findAll();

      expect(topicsService.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return topic by id', async () => {
      topicsService.findOne.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      const result = await controller.findOne(
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(topicsService.findOne).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw BadRequestException for unknown source names', () => {
      expect(() => controller.findOne('nonexistent')).toThrow(
        BadRequestException,
      );
      expect(() => controller.findOne('nonexistent')).toThrow(
        'Unknown data source: nonexistent',
      );
    });
  });

  describe('update', () => {
    it('should call topicsService.update with user info', async () => {
      topicsService.update.mockResolvedValue({ id: 't1', title: 'Updated' });

      const result = await controller.update('user-id', 'REPORTER', 't1', {
        title: 'Updated',
      });

      expect(topicsService.update).toHaveBeenCalledWith(
        't1',
        { title: 'Updated' },
        'user-id',
        'REPORTER',
      );
      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should call topicsService.remove with user info', async () => {
      topicsService.remove.mockResolvedValue({ success: true });

      const result = await controller.remove('user-id', 'REPORTER', 't1');

      expect(topicsService.remove).toHaveBeenCalledWith(
        't1',
        'user-id',
        'REPORTER',
      );
      expect(result.success).toBe(true);
    });
  });

  describe('generateSuggestions', () => {
    it('should call generateAISuggestions', async () => {
      topicsService.generateAISuggestions.mockResolvedValue([
        { title: 'Suggestion' },
      ]);

      const result = await controller.generateSuggestions('user-id');

      expect(topicsService.generateAISuggestions).toHaveBeenCalledWith(
        'user-id',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('importGoogleTrend', () => {
    it('should call importFromGoogleTrends', async () => {
      topicsService.importFromGoogleTrends.mockResolvedValue({ id: 't1' });

      const result = await controller.importGoogleTrend('user-id', {
        title: 'Trend',
      });

      expect(topicsService.importFromGoogleTrends).toHaveBeenCalledWith(
        'user-id',
        { title: 'Trend' },
      );
      expect(result.id).toBe('t1');
    });
  });

  describe('importTopic', () => {
    it('should call topicsService.importTopic with source', async () => {
      topicsService.importTopic.mockResolvedValue({ id: 't2' });

      const result = await controller.importTopic('user-id', {
        title: 'X',
        source: 'x-trends',
      });

      expect(topicsService.importTopic).toHaveBeenCalledWith('user-id', {
        title: 'X',
        source: 'x-trends',
      });
      expect(result.id).toBe('t2');
    });
  });

  describe('Bilibili endpoints', () => {
    it('fetchBilibiliHotSearch delegates to topicsService.fetchNewsBySource', async () => {
      topicsService.fetchNewsBySource.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchBilibiliHotSearch({
        page: '1',
        limit: '10',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchNewsBySource).toHaveBeenCalledWith(
        'bilibili-hot-search',
        1,
        10,
      );
    });

    it('fetchBilibiliRanking delegates to topicsService.fetchNewsBySource', async () => {
      topicsService.fetchNewsBySource.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchBilibiliRanking({
        page: '2',
        limit: '5',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchNewsBySource).toHaveBeenCalledWith(
        'bilibili-ranking',
        2,
        5,
      );
    });

    it('fetchBilibiliPartitionRanking delegates to topicsService.fetchBilibiliPartitionRanking', async () => {
      topicsService.fetchBilibiliPartitionRanking.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchBilibiliPartitionRanking('36', {
        page: '1',
        limit: '10',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchBilibiliPartitionRanking).toHaveBeenCalledWith(
        36,
        1,
        10,
      );
    });

    it('fetchBilibiliPartitionRanking throws for invalid tid', () => {
      expect(() =>
        controller.fetchBilibiliPartitionRanking('abc', {
          page: '1',
          limit: '10',
        } as unknown as SourcePaginationDto),
      ).toThrow(BadRequestException);
      expect(() =>
        controller.fetchBilibiliPartitionRanking('0', {
          page: '1',
          limit: '10',
        } as unknown as SourcePaginationDto),
      ).toThrow('分区 ID tid 必须是正整数');
    });
  });

  describe('Weibo / Zhihu endpoints', () => {
    it('fetchWeiboHot delegates to topicsService.fetchNewsBySource', async () => {
      topicsService.fetchNewsBySource.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchWeiboHot({
        page: '1',
        limit: '10',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchNewsBySource).toHaveBeenCalledWith(
        'weibo-hot',
        1,
        10,
      );
    });

    it('fetchZhihuHot delegates to topicsService.fetchNewsBySource', async () => {
      topicsService.fetchNewsBySource.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchZhihuHot({
        page: '2',
        limit: '5',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchNewsBySource).toHaveBeenCalledWith(
        'zhihu-hot',
        2,
        5,
      );
    });
  });

  describe('NHK endpoint', () => {
    it('fetchNHK delegates to topicsService.fetchNHKNews', async () => {
      topicsService.fetchNHKNews.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchNHK({
        page: '1',
        limit: '10',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchNHKNews).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('Reuters endpoint', () => {
    it('fetchReuters delegates to topicsService.fetchNewsBySource', async () => {
      topicsService.fetchNewsBySource.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchReuters({
        page: '1',
        limit: '10',
      } as unknown as SourcePaginationDto);
      expect(topicsService.fetchNewsBySource).toHaveBeenCalledWith(
        'reuters',
        1,
        10,
      );
    });
  });

  describe('X (Twitter) endpoints', () => {
    it('fetchXTrends delegates to twitterService with parsed woeid', async () => {
      twitterService.fetchTrends.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchXTrends('user-id', '23424977', {
        page: '2',
        limit: '5',
      } as unknown as SourcePaginationDto);
      expect(twitterService.fetchTrends).toHaveBeenCalledWith(
        'user-id',
        23424977,
        2,
        5,
      );
    });

    it('fetchXTrends defaults woeid to 1 when unparseable', async () => {
      twitterService.fetchTrends.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchXTrends('user-id', 'abc', {});
      expect(twitterService.fetchTrends).toHaveBeenCalledWith(
        'user-id',
        1,
        1,
        10,
      );
    });

    it('xTrendWoeids delegates to twitterService.getWoeids', () => {
      twitterService.getWoeids.mockReturnValue([{ woeid: 1, label: '全球' }]);
      const result = controller.xTrendWoeids();
      expect(twitterService.getWoeids).toHaveBeenCalled();
      expect(result).toEqual([{ woeid: 1, label: '全球' }]);
    });

    it('fetchXAccounts delegates to twitterService.fetchAggregatedAccounts', async () => {
      twitterService.fetchAggregatedAccounts.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await controller.fetchXAccounts('user-id', {
        page: '1',
        limit: '20',
      } as unknown as SourcePaginationDto);
      expect(twitterService.fetchAggregatedAccounts).toHaveBeenCalledWith(
        'user-id',
        1,
        20,
      );
    });

    it('fetchXAccountTweets delegates to twitterService.fetchAccountTweets', async () => {
      twitterService.fetchAccountTweets.mockResolvedValue([]);
      await controller.fetchXAccountTweets('user-id', 'elonmusk', '5');
      expect(twitterService.fetchAccountTweets).toHaveBeenCalledWith(
        'elonmusk',
        5,
        'user-id',
        true,
      );
    });
  });

  describe('this-day (Wikipedia On This Day)', () => {
    it('fetchThisDay delegates to wikipediaService with defaults (region→CN)', async () => {
      wikipediaService.fetchOnThisDay.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchThisDay(undefined as unknown as string, undefined, {
        page: '1',
        limit: '10',
      } as unknown as SourcePaginationDto);
      expect(wikipediaService.fetchOnThisDay).toHaveBeenCalledWith(
        'CN',
        undefined,
        1,
        10,
      );
    });

    it('fetchThisDay passes region/date/page/limit', async () => {
      wikipediaService.fetchOnThisDay.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      await controller.fetchThisDay('HK', '2026-07-03', {
        page: '2',
        limit: '5',
      } as unknown as SourcePaginationDto);
      expect(wikipediaService.fetchOnThisDay).toHaveBeenCalledWith(
        'HK',
        '2026-07-03',
        2,
        5,
      );
    });
  });

  describe('adoptTopic', () => {
    it('should call adoptTopic', async () => {
      topicsService.adoptTopic.mockResolvedValue({
        storyId: 's1',
        topicId: 't1',
      });

      const result = await controller.adoptTopic('user-id', 't1');

      expect(topicsService.adoptTopic).toHaveBeenCalledWith('t1', 'user-id');
      expect(result.storyId).toBe('s1');
    });
  });
});
