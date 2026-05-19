import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let service: {
    getPlatforms: jest.Mock;
    getPublishes: jest.Mock;
    generateAdaptation: jest.Mock;
    updatePublish: jest.Mock;
    deletePublish: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getPlatforms: jest.fn(),
      getPublishes: jest.fn(),
      generateAdaptation: jest.fn(),
      updatePublish: jest.fn(),
      deletePublish: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [{ provide: ChannelsService, useValue: service }],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /channels/platforms', () => {
    it('should return all platforms', () => {
      const mockPlatforms = [
        { key: 'WEBSITE', name: '官网/APP' },
        { key: 'FACEBOOK', name: 'Facebook' },
      ];
      service.getPlatforms.mockReturnValue(mockPlatforms);

      const result = controller.getPlatforms();

      expect(service.getPlatforms).toHaveBeenCalled();
      expect(result).toEqual(mockPlatforms);
    });
  });

  describe('GET /channels/:articleId/publishes', () => {
    it('should return publishes for article', async () => {
      const mockPublishes = [{ id: 'p1', platform: 'FACEBOOK', status: 'READY' }];
      service.getPublishes.mockResolvedValue(mockPublishes);

      const result = await controller.getPublishes('article-id');

      expect(service.getPublishes).toHaveBeenCalledWith('article-id');
      expect(result).toEqual(mockPublishes);
    });
  });

  describe('POST /channels/:articleId/adapt', () => {
    it('should generate adaptation', async () => {
      const mockResult = { id: 'p1', status: 'READY', adaptedTitle: 'Title' };
      service.generateAdaptation.mockResolvedValue(mockResult);

      const result = await controller.generateAdaptation('user-1', 'article-id', {
        platform: 'FACEBOOK' as any,
      });

      expect(service.generateAdaptation).toHaveBeenCalledWith(
        'user-1',
        'article-id',
        'FACEBOOK',
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it('should pass custom prompt', async () => {
      service.generateAdaptation.mockResolvedValue({ id: 'p1' });

      await controller.generateAdaptation('user-1', 'article-id', {
        platform: 'XIAOHONGSHU' as any,
        customPrompt: 'Use more emojis',
      });

      expect(service.generateAdaptation).toHaveBeenCalledWith(
        'user-1',
        'article-id',
        'XIAOHONGSHU',
        'Use more emojis',
      );
    });
  });

  describe('PATCH /channels/:articleId/publishes/:publishId', () => {
    it('should update publish', async () => {
      const mockResult = { id: 'p1', status: 'PUBLISHED' };
      service.updatePublish.mockResolvedValue(mockResult);

      const result = await controller.updatePublish('article-id', 'publish-id', {
        status: 'PUBLISHED' as any,
        publishedUrl: 'https://fb.com/post/1',
      });

      expect(service.updatePublish).toHaveBeenCalledWith('article-id', 'publish-id', {
        status: 'PUBLISHED',
        publishedUrl: 'https://fb.com/post/1',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('DELETE /channels/:articleId/publishes/:publishId', () => {
    it('should delete publish', async () => {
      service.deletePublish.mockResolvedValue({ deleted: true });

      const result = await controller.deletePublish('article-id', 'publish-id');

      expect(service.deletePublish).toHaveBeenCalledWith('article-id', 'publish-id');
      expect(result).toEqual({ deleted: true });
    });
  });
});
