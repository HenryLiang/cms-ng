import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublishStatus } from '@cms-ng/shared';

describe('WordPressService', () => {
  let service: WordPressService;
  let prisma: {
    article: { findUnique: jest.Mock };
    platformPublish: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let configService: { get: jest.Mock };

  const mockArticle = {
    id: 'article-1',
    title: '测试文章',
    content: '<p>测试内容</p>',
    excerpt: '摘要',
    coverImage: 'https://example.com/cover.jpg',
    tags: '["标签1"]',
  };

  const mockPublish = {
    id: 'publish-1',
    articleId: 'article-1',
    platform: 'WORDPRESS',
    status: PublishStatus.READY,
    adaptedTitle: 'SEO优化标题',
    adaptedContent: '<h2>正文</h2><p>适配内容</p>',
    adaptedExcerpt: 'meta description',
    adaptedTags: '["关键词1","关键词2"]',
    coverImages: '[]',
  };

  beforeEach(async () => {
    prisma = {
      article: { findUnique: jest.fn() },
      platformPublish: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const env: Record<string, string> = {
          WORDPRESS_SITE_URL: 'https://wp.test',
          WORDPRESS_USERNAME: 'admin',
          WORDPRESS_APP_PASSWORD: 'test pwd',
        };
        return env[key] ?? defaultValue ?? '';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WordPressService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<WordPressService>(WordPressService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ensureConfigured', () => {
    it('should throw if WORDPRESS_SITE_URL is missing', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'WORDPRESS_SITE_URL') return '';
        return 'value';
      });
      const svc = new WordPressService(prisma as any, configService as any);
      await expect(svc.publish('article-1')).rejects.toThrow('WordPress 配置不完整');
    });

    it('should throw if WORDPRESS_USERNAME is missing', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'WORDPRESS_USERNAME') return '';
        return 'value';
      });
      const svc = new WordPressService(prisma as any, configService as any);
      await expect(svc.publish('article-1')).rejects.toThrow('WordPress 配置不完整');
    });

    it('should throw if WORDPRESS_APP_PASSWORD is missing', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'WORDPRESS_APP_PASSWORD') return '';
        return 'value';
      });
      const svc = new WordPressService(prisma as any, configService as any);
      await expect(svc.publish('article-1')).rejects.toThrow('WordPress 配置不完整');
    });
  });

  describe('publish', () => {
    it('should throw if article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);
      await expect(service.publish('nonexistent')).rejects.toThrow('文章不存在');
    });

    it('should throw if no WordPress adaptation exists', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle);
      prisma.platformPublish.findFirst.mockResolvedValue(null);
      await expect(service.publish('article-1')).rejects.toThrow('请先生成 WordPress 适配内容');
    });

    it('should throw if adaptation status is GENERATING', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle);
      prisma.platformPublish.findFirst.mockResolvedValue({
        ...mockPublish,
        status: PublishStatus.GENERATING,
      });
      await expect(service.publish('article-1')).rejects.toThrow('适配内容未就绪');
    });

    it('should throw if adaptation status is FAILED', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle);
      prisma.platformPublish.findFirst.mockResolvedValue({
        ...mockPublish,
        status: PublishStatus.FAILED,
      });
      await expect(service.publish('article-1')).rejects.toThrow('适配内容未就绪');
    });

    it('should set status to FAILED on WordPress API error', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle);
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish);
      prisma.platformPublish.update.mockResolvedValue({});

      // Mock fetch to return error
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });
      global.fetch = mockFetch;

      await expect(service.publish('article-1')).rejects.toThrow('WordPress 发布失败');

      // Verify status was set to FAILED
      const failedUpdateCall = prisma.platformPublish.update.mock.calls.find(
        (call: any) => call[0]?.data?.status === PublishStatus.FAILED,
      );
      expect(failedUpdateCall).toBeDefined();
    });

    it('should publish successfully and return updated record', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle);
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish);

      let updateCallCount = 0;
      prisma.platformPublish.update.mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 1) {
          return Promise.resolve({ id: 'publish-1', status: PublishStatus.GENERATING });
        }
        return Promise.resolve({
          id: 'publish-1',
          status: PublishStatus.PUBLISHED,
          publishedUrl: 'https://wp.test/post/1',
          publishedAt: new Date(),
          adaptedTags: '["关键词1","关键词2"]',
          coverImages: '[]',
        });
      });

      // Mock fetch for tag search, tag creation, image upload, and post creation
      let fetchCallCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        fetchCallCount++;
        // Tag search -> no match
        if (fetchCallCount === 1) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        // Tag creation
        if (fetchCallCount === 2) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 10 }) });
        }
        // Tag search -> no match (2nd tag)
        if (fetchCallCount === 3) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        // Tag creation (2nd tag)
        if (fetchCallCount === 4) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 11 }) });
        }
        // Image download
        if (fetchCallCount === 5) {
          return Promise.resolve({
            ok: true,
            headers: { get: () => 'image/jpeg' },
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          });
        }
        // Image upload
        if (fetchCallCount === 6) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 20 }) });
        }
        // Post creation
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 1, link: 'https://wp.test/post/1' }),
        });
      });
      global.fetch = mockFetch;

      const result = await service.publish('article-1', 'publish');

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(result.publishedUrl).toBe('https://wp.test/post/1');
      expect(result.adaptedTags).toEqual(['关键词1', '关键词2']);
    });

    it('should handle malformed adaptedTags gracefully', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle);
      prisma.platformPublish.findFirst.mockResolvedValue({
        ...mockPublish,
        adaptedTags: '{broken json',
      });

      let updateCallCount = 0;
      prisma.platformPublish.update.mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 1) {
          return Promise.resolve({ id: 'publish-1', status: PublishStatus.GENERATING });
        }
        return Promise.resolve({
          id: 'publish-1',
          status: PublishStatus.PUBLISHED,
          publishedUrl: 'https://wp.test/post/2',
          publishedAt: new Date(),
          adaptedTags: '[]',
          coverImages: '[]',
        });
      });

      // Mock fetch: no tags, no image, just post creation
      global.fetch = jest.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 2, link: 'https://wp.test/post/2' }),
        });
      });

      // Should NOT throw — safeJsonParse handles it
      const result = await service.publish('article-1');
      expect(result.adaptedTags).toEqual([]);
    });
  });

  describe('publish with draft mode', () => {
    it('should pass draft status to WordPress API', async () => {
      prisma.article.findUnique.mockResolvedValue({ ...mockArticle, coverImage: null });
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish);

      let updateCallCount = 0;
      prisma.platformPublish.update.mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 1) return Promise.resolve({ id: 'publish-1' });
        return Promise.resolve({
          id: 'publish-1',
          status: PublishStatus.PUBLISHED,
          publishedUrl: 'https://wp.test/?p=3',
          adaptedTags: '[]',
          coverImages: '[]',
        });
      });

      const mockFetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 3, link: 'https://wp.test/?p=3' }),
        }),
      );
      global.fetch = mockFetch;

      await service.publish('article-1', 'draft');

      // The last fetch call should be the post creation with status: 'draft'
      const postCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(postCall[1]?.body || '{}');
      expect(body.status).toBe('draft');
    });
  });
});
