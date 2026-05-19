import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { Platform, PublishStatus } from '@cms-ng/shared';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let aiService: { chatWithAI: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    aiService = { chatWithAI: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AIService, useValue: aiService },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockArticle = (override?: any) => ({
    id: 'article-id',
    title: 'Test Article Title',
    subtitle: 'Test Subtitle',
    content: 'This is the article content. '.repeat(100),
    excerpt: 'Test excerpt',
    tags: '["tag1", "tag2"]',
    status: 'DRAFT',
    storyId: 'story-id',
    authorId: 'author-id',
    editorId: null,
    coverImage: null,
    platforms: '[]',
    aiGeneratedParts: '[]',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    ...override,
  });

  const mockPublish = (override?: any) => ({
    id: 'publish-id',
    articleId: 'article-id',
    platform: Platform.FACEBOOK,
    status: PublishStatus.READY,
    adaptedTitle: 'Adapted Title',
    adaptedContent: 'Adapted content',
    adaptedExcerpt: 'Adapted excerpt',
    adaptedTags: '["#tag1"]',
    coverImages: '[]',
    scheduledAt: null,
    publishedAt: null,
    publishedUrl: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...override,
  });

  describe('getPlatforms', () => {
    it('should return all platform metadata', () => {
      const result = service.getPlatforms();
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('key');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('styleGuide');
    });

    it('should include supported platforms', () => {
      const result = service.getPlatforms();
      const keys = result.map((p) => p.key);
      expect(keys).toContain(Platform.WEBSITE);
      expect(keys).toContain(Platform.FACEBOOK);
      expect(keys).toContain(Platform.INSTAGRAM);
      expect(keys).toContain(Platform.XIAOHONGSHU);
    });
  });

  describe('getPublishes', () => {
    it('should return publishes with parsed JSON fields', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.findMany.mockResolvedValue([
        mockPublish({ adaptedTags: '["#news", "#hongkong"]', coverImages: '["img1.jpg"]' }),
      ]);

      const result = await service.getPublishes('article-id');

      expect(prisma.article.findUnique).toHaveBeenCalledWith({ where: { id: 'article-id' } });
      expect(prisma.platformPublish.findMany).toHaveBeenCalledWith({
        where: { articleId: 'article-id' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0].adaptedTags).toEqual(['#news', '#hongkong']);
      expect(result[0].coverImages).toEqual(['img1.jpg']);
    });

    it('should handle empty tags and coverImages', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.findMany.mockResolvedValue([
        mockPublish({ adaptedTags: '[]', coverImages: '[]' }),
      ]);

      const result = await service.getPublishes('article-id');

      expect(result[0].adaptedTags).toEqual([]);
      expect(result[0].coverImages).toEqual([]);
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.getPublishes('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateAdaptation', () => {
    const validAIResponse = JSON.stringify({
      title: 'Facebook Post Title',
      content: 'This is the adapted Facebook content with emoji 😊',
      excerpt: 'Short excerpt',
      tags: ['#HongKong', '#News'],
    });

    it('should generate adaptation for supported platform (Facebook)', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.update.mockResolvedValue(
        mockPublish({
          status: PublishStatus.READY,
          adaptedTitle: 'Facebook Post Title',
          adaptedContent: 'This is the adapted Facebook content with emoji 😊',
        }),
      );
      aiService.chatWithAI.mockResolvedValue(validAIResponse);

      const result = await service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK);

      expect(prisma.platformPublish.upsert).toHaveBeenCalledWith({
        where: { articleId_platform: { articleId: 'article-id', platform: Platform.FACEBOOK } },
        create: expect.objectContaining({
          articleId: 'article-id',
          platform: Platform.FACEBOOK,
          status: PublishStatus.GENERATING,
        }),
        update: { status: PublishStatus.GENERATING },
      });
      expect(aiService.chatWithAI).toHaveBeenCalledWith(
        'user-id',
        'article-id',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Facebook'),
            }),
          ]),
        }),
      );
      expect(result.status).toBe(PublishStatus.READY);
      expect(result.adaptedTitle).toBe('Facebook Post Title');
      expect(result.adaptedTags).toEqual(['#HongKong', '#News']);
    });

    it('should generate adaptation for Xiaohongshu', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(
        mockPublish({ platform: Platform.XIAOHONGSHU, status: PublishStatus.GENERATING }),
      );
      prisma.platformPublish.update.mockResolvedValue(
        mockPublish({
          platform: Platform.XIAOHONGSHU,
          status: PublishStatus.READY,
          adaptedTitle: '✅ 香港必知！3分鐘看懂...',
        }),
      );
      aiService.chatWithAI.mockResolvedValue(
        JSON.stringify({
          title: '✅ 香港必知！3分鐘看懂...',
          content: '💡 第一點內容\n✅ 第二點內容',
          tags: ['#香港', '#生活'],
        }),
      );

      const result = await service.generateAdaptation('user-id', 'article-id', Platform.XIAOHONGSHU);

      expect(aiService.chatWithAI).toHaveBeenCalled();
      const prompt = aiService.chatWithAI.mock.calls[0][2].messages[0].content;
      expect(prompt).toContain('小红书');
      expect(prompt).toContain('种草风格');
      expect(result.status).toBe(PublishStatus.READY);
    });

    it('should generate adaptation for Instagram', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(
        mockPublish({ platform: Platform.INSTAGRAM, status: PublishStatus.GENERATING }),
      );
      prisma.platformPublish.update.mockResolvedValue(
        mockPublish({ platform: Platform.INSTAGRAM, status: PublishStatus.READY }),
      );
      aiService.chatWithAI.mockResolvedValue(
        JSON.stringify({
          title: 'Instagram Post',
          content: 'Photo caption here #hashtag',
          tags: ['#photo', '#insta'],
        }),
      );

      await service.generateAdaptation('user-id', 'article-id', Platform.INSTAGRAM);

      const prompt = aiService.chatWithAI.mock.calls[0][2].messages[0].content;
      expect(prompt).toContain('Instagram');
    });

    it('should generate adaptation for Website', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(
        mockPublish({ platform: Platform.WEBSITE, status: PublishStatus.GENERATING }),
      );
      prisma.platformPublish.update.mockResolvedValue(
        mockPublish({ platform: Platform.WEBSITE, status: PublishStatus.READY }),
      );
      aiService.chatWithAI.mockResolvedValue(
        JSON.stringify({
          title: 'Website Article Title',
          content: '<p>Full article content</p>',
          excerpt: 'Summary',
          tags: ['news', 'hongkong'],
        }),
      );

      await service.generateAdaptation('user-id', 'article-id', Platform.WEBSITE);

      const prompt = aiService.chatWithAI.mock.calls[0][2].messages[0].content;
      expect(prompt).toContain('官网/APP');
    });

    it('should support custom prompt', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.update.mockResolvedValue(mockPublish({ status: PublishStatus.READY }));
      aiService.chatWithAI.mockResolvedValue(validAIResponse);

      await service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK, 'Use more emojis');

      const prompt = aiService.chatWithAI.mock.calls[0][2].messages[0].content;
      expect(prompt).toContain('额外要求：Use more emojis');
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(
        service.generateAdaptation('user-id', 'nonexistent', Platform.FACEBOOK),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for unsupported platform', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());

      await expect(
        service.generateAdaptation('user-id', 'article-id', Platform.X),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set FAILED status when AI returns invalid JSON', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.findUnique.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      aiService.chatWithAI.mockResolvedValue('This is not JSON at all');

      // Website adapter doesn't validate length, so it should still succeed
      // But let's test with Facebook which has length limits
      prisma.platformPublish.upsert.mockResolvedValue(
        mockPublish({ platform: Platform.FACEBOOK, status: PublishStatus.GENERATING }),
      );
      aiService.chatWithAI.mockResolvedValue('Invalid output without title');

      // The fallback parser should extract some content but validation may fail
      // Since the fallback returns title from first line, and there's no clear title,
      // the adapter might return empty title
      await expect(
        service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK),
      ).rejects.toThrow();

      // Verify FAILED status was set
      expect(prisma.platformPublish.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PublishStatus.FAILED,
          }),
        }),
      );
    });

    it('should handle AI service failure and set FAILED status', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.findUnique.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      aiService.chatWithAI.mockRejectedValue(new Error('AI service timeout'));

      await expect(
        service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK),
      ).rejects.toThrow('AI service timeout');

      expect(prisma.platformPublish.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PublishStatus.FAILED,
            notes: 'AI service timeout',
          }),
        }),
      );
    });

    it('should reject AI fallback error messages', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.findUnique.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      aiService.chatWithAI.mockResolvedValue('AI 助手暂时无法回答，请稍后重试。');

      await expect(
        service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK),
      ).rejects.toThrow();

      expect(prisma.platformPublish.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PublishStatus.FAILED,
            notes: expect.stringContaining('AI service returned an error response'),
          }),
        }),
      );
    });

    it('should not overwrite READY status on error', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.findUnique.mockResolvedValue(mockPublish({ status: PublishStatus.READY }));
      aiService.chatWithAI.mockRejectedValue(new Error('AI error'));

      await expect(
        service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK),
      ).rejects.toThrow();

      // Should not update since status is already READY
      const updateCalls = prisma.platformPublish.update.mock.calls.filter(
        (call: any) => call[0].data?.status === PublishStatus.FAILED,
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('should handle article with empty tags', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ tags: '[]' }));
      prisma.platformPublish.upsert.mockResolvedValue(mockPublish({ status: PublishStatus.GENERATING }));
      prisma.platformPublish.update.mockResolvedValue(mockPublish({ status: PublishStatus.READY }));
      aiService.chatWithAI.mockResolvedValue(validAIResponse);

      await service.generateAdaptation('user-id', 'article-id', Platform.FACEBOOK);

      const prompt = aiService.chatWithAI.mock.calls[0][2].messages[0].content;
      expect(prompt).toContain('原文标题：Test Article Title');
    });
  });

  describe('updatePublish', () => {
    it('should update publish status', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish());
      prisma.platformPublish.update.mockResolvedValue(
        mockPublish({ status: PublishStatus.PUBLISHED, publishedAt: new Date() }),
      );

      const result = await service.updatePublish('article-id', 'publish-id', {
        status: PublishStatus.PUBLISHED,
      });

      expect(prisma.platformPublish.update).toHaveBeenCalledWith({
        where: { id: 'publish-id' },
        data: expect.objectContaining({
          status: PublishStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe(PublishStatus.PUBLISHED);
    });

    it('should update publishedUrl', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish());
      prisma.platformPublish.update.mockResolvedValue(
        mockPublish({ publishedUrl: 'https://facebook.com/post/123' }),
      );

      const result = await service.updatePublish('article-id', 'publish-id', {
        publishedUrl: 'https://facebook.com/post/123',
      });

      expect(prisma.platformPublish.update).toHaveBeenCalledWith({
        where: { id: 'publish-id' },
        data: { publishedUrl: 'https://facebook.com/post/123' },
      });
      expect(result.publishedUrl).toBe('https://facebook.com/post/123');
    });

    it('should update notes', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish());
      prisma.platformPublish.update.mockResolvedValue(mockPublish({ notes: 'Some notes' }));

      const result = await service.updatePublish('article-id', 'publish-id', {
        notes: 'Some notes',
      });

      expect(prisma.platformPublish.update).toHaveBeenCalledWith({
        where: { id: 'publish-id' },
        data: { notes: 'Some notes' },
      });
      expect(result.notes).toBe('Some notes');
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePublish('nonexistent', 'publish-id', { status: PublishStatus.PUBLISHED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when publish not found', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.platformPublish.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePublish('article-id', 'nonexistent', { status: PublishStatus.PUBLISHED }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deletePublish', () => {
    it('should delete publish record', async () => {
      prisma.platformPublish.findFirst.mockResolvedValue(mockPublish());
      prisma.platformPublish.delete.mockResolvedValue(mockPublish());

      const result = await service.deletePublish('article-id', 'publish-id');

      expect(prisma.platformPublish.findFirst).toHaveBeenCalledWith({
        where: { id: 'publish-id', articleId: 'article-id' },
      });
      expect(prisma.platformPublish.delete).toHaveBeenCalledWith({
        where: { id: 'publish-id' },
      });
      expect(result.deleted).toBe(true);
    });

    it('should throw NotFoundException when publish not found', async () => {
      prisma.platformPublish.findFirst.mockResolvedValue(null);

      await expect(service.deletePublish('article-id', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
