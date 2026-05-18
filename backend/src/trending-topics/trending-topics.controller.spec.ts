import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TrendingTopicsController } from './trending-topics.controller';
import { TrendingTopicsService } from './trending-topics.service';

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
    fetchGoogleTrends: jest.Mock;
    importFromGoogleTrends: jest.Mock;
    adoptTopic: jest.Mock;
  };

  beforeEach(async () => {
    topicsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      generateAISuggestions: jest.fn(),
      fetchGoogleTrends: jest.fn(),
      importFromGoogleTrends: jest.fn(),
      adoptTopic: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrendingTopicsController],
      providers: [{ provide: TrendingTopicsService, useValue: topicsService }],
    }).compile();

    controller = module.get<TrendingTopicsController>(TrendingTopicsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call topicsService.create', async () => {
      topicsService.create.mockResolvedValue({ id: 't1', title: 'Topic' });

      const result = await controller.create('user-id', { title: 'Topic' } as any);

      expect(topicsService.create).toHaveBeenCalledWith('user-id', { title: 'Topic' });
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
      topicsService.findOne.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' });

      const result = await controller.findOne('550e8400-e29b-41d4-a716-446655440000');

      expect(topicsService.findOne).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw BadRequestException for unknown source names', () => {
      expect(() => controller.findOne('nonexistent')).toThrow(BadRequestException);
      expect(() => controller.findOne('nonexistent')).toThrow('Unknown data source: nonexistent');
    });

    it('should throw BadRequestException for known source keys', () => {
      expect(() => controller.findOne('bbc')).toThrow(BadRequestException);
      expect(() => controller.findOne('bbc')).toThrow("Invalid topic ID: 'bbc' is a data source name");
    });
  });

  describe('update', () => {
    it('should call topicsService.update with user info', async () => {
      topicsService.update.mockResolvedValue({ id: 't1', title: 'Updated' });

      const result = await controller.update('user-id', 'REPORTER', 't1', { title: 'Updated' } as any);

      expect(topicsService.update).toHaveBeenCalledWith('t1', { title: 'Updated' }, 'user-id', 'REPORTER');
      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should call topicsService.remove with user info', async () => {
      topicsService.remove.mockResolvedValue({ success: true });

      const result = await controller.remove('user-id', 'REPORTER', 't1');

      expect(topicsService.remove).toHaveBeenCalledWith('t1', 'user-id', 'REPORTER');
      expect(result.success).toBe(true);
    });
  });

  describe('generateSuggestions', () => {
    it('should call generateAISuggestions', async () => {
      topicsService.generateAISuggestions.mockResolvedValue([{ title: 'Suggestion' }]);

      const result = await controller.generateSuggestions('user-id');

      expect(topicsService.generateAISuggestions).toHaveBeenCalledWith('user-id');
      expect(result).toHaveLength(1);
    });
  });

  describe('fetchGoogleTrends', () => {
    it('should call fetchGoogleTrends with defaults', async () => {
      topicsService.fetchGoogleTrends.mockResolvedValue({ items: [{ title: 'Trend' }], total: 1, page: 1, limit: 10, totalPages: 1 });

      const result = await controller.fetchGoogleTrends({ geo: '', timeRange: '' } as any);

      expect(topicsService.fetchGoogleTrends).toHaveBeenCalledWith('HK', '24h', 1, 10);
      expect(result.items).toHaveLength(1);
    });

    it('should pass query params', async () => {
      topicsService.fetchGoogleTrends.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 });

      await controller.fetchGoogleTrends({ geo: 'US', timeRange: '7d' } as any);

      expect(topicsService.fetchGoogleTrends).toHaveBeenCalledWith('US', '7d', 1, 10);
    });
  });

  describe('importGoogleTrend', () => {
    it('should call importFromGoogleTrends', async () => {
      topicsService.importFromGoogleTrends.mockResolvedValue({ id: 't1' });

      const result = await controller.importGoogleTrend('user-id', { title: 'Trend' });

      expect(topicsService.importFromGoogleTrends).toHaveBeenCalledWith('user-id', { title: 'Trend' });
      expect(result.id).toBe('t1');
    });
  });

  describe('adoptTopic', () => {
    it('should call adoptTopic', async () => {
      topicsService.adoptTopic.mockResolvedValue({ storyId: 's1', topicId: 't1' });

      const result = await controller.adoptTopic('user-id', 't1');

      expect(topicsService.adoptTopic).toHaveBeenCalledWith('t1', 'user-id');
      expect(result.storyId).toBe('s1');
    });
  });
});
