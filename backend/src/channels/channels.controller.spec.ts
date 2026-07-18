jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { WordPressService } from './wordpress.service';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let service: {
    getPlatforms: jest.Mock;
    getPublishes: jest.Mock;
    generateAdaptation: jest.Mock;
    updatePublish: jest.Mock;
    deletePublish: jest.Mock;
    verifyAccess: jest.Mock;
  };
  let wpService: {
    publish: jest.Mock;
  };

  const mockUser = { userId: 'user-1', role: 'REPORTER' };

  beforeEach(async () => {
    service = {
      getPlatforms: jest.fn(),
      getPublishes: jest.fn(),
      generateAdaptation: jest.fn(),
      updatePublish: jest.fn(),
      deletePublish: jest.fn(),
      verifyAccess: jest.fn().mockResolvedValue(undefined),
    };

    wpService = {
      publish: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        { provide: ChannelsService, useValue: service },
        { provide: WordPressService, useValue: wpService },
      ],
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
      const mockPublishes = [
        { id: 'p1', platform: 'FACEBOOK', status: 'READY' },
      ];
      service.getPublishes.mockResolvedValue(mockPublishes);

      const result = await controller.getPublishes('article-id', mockUser);

      expect(service.verifyAccess).toHaveBeenCalledWith('article-id', mockUser);
      expect(service.getPublishes).toHaveBeenCalledWith('article-id');
      expect(result).toEqual(mockPublishes);
    });
  });

  describe('POST /channels/:articleId/adapt', () => {
    it('should generate adaptation', async () => {
      const mockResult = { id: 'p1', status: 'READY', adaptedTitle: 'Title' };
      service.generateAdaptation.mockResolvedValue(mockResult);

      const result = await controller.generateAdaptation(
        mockUser,
        'article-id',
        {
          platform: 'FACEBOOK' as any,
        },
      );

      expect(service.verifyAccess).toHaveBeenCalledWith('article-id', mockUser);
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

      await controller.generateAdaptation(mockUser, 'article-id', {
        platform: 'XIAOHONGSHU' as any,
        customPrompt: 'Use more emojis',
      });

      expect(service.verifyAccess).toHaveBeenCalledWith('article-id', mockUser);
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

      const result = await controller.updatePublish(
        mockUser,
        'article-id',
        'publish-id',
        {
          status: 'PUBLISHED' as any,
          publishedUrl: 'https://fb.com/post/1',
        },
      );

      expect(service.verifyAccess).toHaveBeenCalledWith('article-id', mockUser);
      expect(service.updatePublish).toHaveBeenCalledWith(
        'article-id',
        'publish-id',
        {
          status: 'PUBLISHED',
          publishedUrl: 'https://fb.com/post/1',
        },
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('POST /channels/:articleId/publish-wordpress', () => {
    it('should publish to WordPress', async () => {
      const mockResult = {
        id: 'p1',
        status: 'PUBLISHED',
        publishedUrl: 'https://wuququ.com/post/1',
      };
      wpService.publish.mockResolvedValue(mockResult);

      const result = await controller.publishToWordPress(
        mockUser,
        'article-id',
        {},
      );

      expect(service.verifyAccess).toHaveBeenCalledWith('article-id', mockUser);
      expect(wpService.publish).toHaveBeenCalledWith('article-id', 'publish');
      expect(result).toEqual(mockResult);
    });

    it('should pass draft status', async () => {
      wpService.publish.mockResolvedValue({ id: 'p1', status: 'PUBLISHED' });

      await controller.publishToWordPress(mockUser, 'article-id', {
        wpStatus: 'draft',
      });

      expect(wpService.publish).toHaveBeenCalledWith('article-id', 'draft');
    });
  });

  describe('DELETE /channels/:articleId/publishes/:publishId', () => {
    it('should delete publish', async () => {
      service.deletePublish.mockResolvedValue({ deleted: true });

      const result = await controller.deletePublish(
        mockUser,
        'article-id',
        'publish-id',
      );

      expect(service.verifyAccess).toHaveBeenCalledWith('article-id', mockUser);
      expect(service.deletePublish).toHaveBeenCalledWith(
        'article-id',
        'publish-id',
      );
      expect(result).toEqual({ deleted: true });
    });
  });
});
