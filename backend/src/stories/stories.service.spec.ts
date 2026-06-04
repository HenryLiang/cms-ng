jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { ArticlesService } from '../articles/articles.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

describe('StoriesService', () => {
  let service: StoriesService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AIService,
          useValue: {
            generateResearchKit: jest.fn(),
            generateDraft: jest.fn(),
          },
        },
        {
          provide: ArticlesService,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockStory = (override?: any) => ({
    id: 'story-id',
    title: 'Test Story',
    description: 'Desc',
    angle: null,
    status: 'DRAFT',
    priority: 1,
    tags: '[]',
    deadline: null,
    reporterId: 'user-id',
    editorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reporter: { id: 'user-id', name: 'Test', email: 'test@example.com' },
    editor: null,
    _count: { articles: 0 },
    ...override,
  });

  describe('create', () => {
    it('should create story with serialized tags', async () => {
      prisma.story.create.mockResolvedValue(mockStory({ tags: '["tag1"]' }));

      const result = await service.create('user-id', {
        title: 'Test Story',
        description: 'Desc',
        tags: ['tag1'],
        priority: 1,
      } as any);

      expect(prisma.story.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test Story',
          tags: '["tag1"]',
          reporterId: 'user-id',
          status: 'DRAFT',
          priority: 1,
        }),
        include: expect.any(Object),
      });
      expect(result.tags).toEqual(['tag1']);
    });
  });

  describe('findAll', () => {
    it('should return all stories with default pagination for admin', async () => {
      prisma.story.findMany.mockResolvedValue([
        mockStory({ id: 's1' }),
        mockStory({ id: 's2' }),
      ]);
      prisma.story.count.mockResolvedValue(2);

      const result = await service.findAll({ userId: 'admin-id', role: 'ADMIN' }, {});

      expect(prisma.story.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
      expect(prisma.story.count).toHaveBeenCalledWith({ where: {} });
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    });

    it('should paginate with page/pageSize (#54)', async () => {
      prisma.story.findMany.mockResolvedValue([mockStory({ id: 's1' })]);
      prisma.story.count.mockResolvedValue(380);

      const result = await service.findAll(
        { userId: 'admin-id', role: 'ADMIN' },
        { page: 1, pageSize: 2 },
      );

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 2 }),
      );
      expect(prisma.story.count).toHaveBeenCalledWith({ where: {} });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 2, total: 380, totalPages: 190 });
    });

    it('should compute correct skip for page 3 pageSize 5', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.findAll(
        { userId: 'admin-id', role: 'ADMIN' },
        { page: 3, pageSize: 5 },
      );

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should filter by status (#54)', async () => {
      prisma.story.findMany.mockResolvedValue([mockStory({ status: 'APPROVED' })]);
      prisma.story.count.mockResolvedValue(1);

      const result = await service.findAll(
        { userId: 'admin-id', role: 'ADMIN' },
        { status: 'APPROVED' },
      );

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      expect(prisma.story.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: 'APPROVED' }),
      });
      expect(result.data).toHaveLength(1);
    });

    it('should filter by contentLanguage (#54)', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.findAll(
        { userId: 'admin-id', role: 'ADMIN' },
        { contentLanguage: 'ENGLISH' },
      );

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contentLanguage: 'ENGLISH' }),
        }),
      );
    });

    it('should sort by createdAt desc by default', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.findAll({ userId: 'admin-id', role: 'ADMIN' }, {});

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('should respect sortBy/order query params (#54)', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.findAll(
        { userId: 'admin-id', role: 'ADMIN' },
        { sortBy: 'title', order: 'asc' },
      );

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { title: 'asc' } }),
      );
    });

    it('should still filter by reporterId for reporter role', async () => {
      prisma.story.findMany.mockResolvedValue([mockStory()]);
      prisma.story.count.mockResolvedValue(1);

      const result = await service.findAll(
        { userId: 'user-id', role: 'REPORTER' },
        {},
      );

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reporterId: 'user-id' } }),
      );
      expect(result.meta.total).toBe(1);
    });

    it('should combine role-based where with status filter for editor', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      prisma.story.count.mockResolvedValue(0);

      await service.findAll(
        { userId: 'user-id', role: 'EDITOR' },
        { status: 'PENDING_REVIEW' },
      );

      const call = (prisma.story.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.status).toBe('PENDING_REVIEW');
    });
  });

  describe('findOne', () => {
    it('should return story with articles', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ articles: [] }));

      const result = await service.findOne('story-id');

      expect(prisma.story.findUnique).toHaveBeenCalledWith({
        where: { id: 'story-id' },
        include: expect.objectContaining({ articles: expect.any(Object) }),
      });
      expect(result.id).toBe('story-id');
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update story and parse tags', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.story.update.mockResolvedValue(mockStory({ tags: '["updated"]' }));

      const result = await service.update('story-id', { tags: ['updated'] } as any);

      expect(prisma.story.update).toHaveBeenCalledWith({
        where: { id: 'story-id' },
        data: expect.objectContaining({ tags: '["updated"]' }),
        include: expect.any(Object),
      });
      expect(result.tags).toEqual(['updated']);
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete story when found', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.article.updateMany.mockResolvedValue({ count: 0 });
      prisma.story.delete.mockResolvedValue(mockStory());

      const result = await service.remove('story-id');

      expect(prisma.story.delete).toHaveBeenCalledWith({ where: { id: 'story-id' } });
      expect(result.success).toBe(true);
    });

    it('should null out Article.storyId before deleting story (#55 cascade)', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.article.updateMany.mockResolvedValue({ count: 3 });
      prisma.story.delete.mockResolvedValue(mockStory());

      const callOrder: string[] = [];
      (prisma.article.updateMany as jest.Mock).mockImplementation(async () => {
        callOrder.push('article.updateMany');
        return { count: 3 };
      });
      (prisma.story.delete as jest.Mock).mockImplementation(async () => {
        callOrder.push('story.delete');
        return mockStory();
      });

      await service.remove('story-id');

      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { storyId: 'story-id' },
        data: { storyId: null },
      });
      // updateMany must run BEFORE story.delete to avoid FK error
      expect(callOrder).toEqual(['article.updateMany', 'story.delete']);
    });

    it('should still invoke updateMany even when no articles reference the story', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.article.updateMany.mockResolvedValue({ count: 0 });
      prisma.story.delete.mockResolvedValue(mockStory());

      await service.remove('story-id');

      expect(prisma.article.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.story.delete).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
      expect(prisma.article.updateMany).not.toHaveBeenCalled();
      expect(prisma.story.delete).not.toHaveBeenCalled();
    });
  });

  describe('verifyAccess', () => {
    it('should allow admin access', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ reporterId: 'other-id' }));

      await expect(service.verifyAccess('story-id', { userId: 'admin-id', role: 'ADMIN' })).resolves.toBeUndefined();
    });

    it('should allow reporter access', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ reporterId: 'user-id' }));

      await expect(service.verifyAccess('story-id', { userId: 'user-id', role: 'REPORTER' })).resolves.toBeUndefined();
    });

    it('should allow editor access', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ reporterId: 'other-id', editorId: 'editor-id' }));

      await expect(service.verifyAccess('story-id', { userId: 'editor-id', role: 'EDITOR' })).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.verifyAccess('nonexistent', { userId: 'user-id', role: 'REPORTER' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when no access', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ reporterId: 'other-id', editorId: 'another-id' }));

      await expect(service.verifyAccess('story-id', { userId: 'user-id', role: 'REPORTER' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateResearchKit', () => {
    it('should return research kit for existing story', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ tags: '["tag1"]' }));
      const aiService = (service as any).aiService;
      aiService.generateResearchKit.mockResolvedValue({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        people: [{ name: 'P1', role: 'R1' }],
        data: [{ label: 'L1', value: 'V1' }],
        opinions: [{ source: 'S1', viewpoint: 'V1' }],
      });

      const result = await service.generateResearchKit('user-id', 'story-id');

      expect(prisma.story.findUnique).toHaveBeenCalledWith({ where: { id: 'story-id' } });
      expect(aiService.generateResearchKit).toHaveBeenCalledWith('user-id', expect.objectContaining({
        storyTitle: 'Test Story',
        storyDescription: 'Desc',
        storyTags: ['tag1'],
      }));
      expect(result.timeline).toHaveLength(1);
    });

    it('should pass angle when present', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ angle: 'Angle', tags: '[]' }));
      const aiService = (service as any).aiService;
      aiService.generateResearchKit.mockResolvedValue({ timeline: [], people: [], data: [], opinions: [] });

      await service.generateResearchKit('user-id', 'story-id');

      expect(aiService.generateResearchKit).toHaveBeenCalledWith('user-id', expect.objectContaining({
        storyAngle: 'Angle',
      }));
    });

    it('should handle empty tags string', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ tags: '' }));
      const aiService = (service as any).aiService;
      aiService.generateResearchKit.mockResolvedValue({ timeline: [], people: [], data: [], opinions: [] });

      await service.generateResearchKit('user-id', 'story-id');

      expect(aiService.generateResearchKit).toHaveBeenCalledWith('user-id', expect.objectContaining({
        storyTags: [],
      }));
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.generateResearchKit('user-id', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignEditor', () => {
    it('should assign editor to story', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.user.findUnique.mockResolvedValue({ role: 'EDITOR' });
      prisma.story.update.mockResolvedValue(mockStory({ editorId: 'editor-id' }));

      const result = await service.assignEditor('story-id', 'editor-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'editor-id' },
        select: { role: true },
      });
      expect(prisma.story.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { editorId: 'editor-id' },
          include: expect.any(Object),
        }),
      );
      expect(result.editorId).toBe('editor-id');
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.assignEditor('nonexistent', 'editor-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when editor not found', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.assignEditor('story-id', 'bad-editor')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not an editor', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      prisma.user.findUnique.mockResolvedValue({ role: 'REPORTER' });

      await expect(service.assignEditor('story-id', 'reporter-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateDraftFromResearchKit', () => {
    it('should generate draft, create article, and update story status', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ tags: '["politics"]' }));
      const aiService = (service as any).aiService;
      aiService.generateDraft.mockResolvedValue({
        title: 'Draft Title',
        subtitle: 'Draft Subtitle',
        content: '<p>Draft content</p>',
      });
      const articlesService = (service as any).articlesService;
      articlesService.create.mockResolvedValue({ id: 'article-id', title: 'Draft Title' });
      prisma.story.update.mockResolvedValue(mockStory({ status: 'WRITING' }));

      const researchKit = {
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        people: [{ name: 'P1', role: 'R1' }],
        data: [{ label: 'L1', value: 'V1' }],
        opinions: [{ source: 'S1', viewpoint: 'V1' }],
      };

      const result = await service.generateDraftFromResearchKit('user-id', 'story-id', researchKit, 'instruction');

      expect(prisma.story.findUnique).toHaveBeenCalledWith({ where: { id: 'story-id' } });
      expect(aiService.generateDraft).toHaveBeenCalledWith('user-id', undefined, {
        storyTitle: 'Test Story',
        storyDescription: 'Desc',
        storyAngle: undefined,
        storyTags: ['politics'],
        instruction: 'instruction',
        researchKit,
      });
      expect(articlesService.create).toHaveBeenCalledWith('user-id', {
        storyId: 'story-id',
        title: 'Draft Title',
        subtitle: 'Draft Subtitle',
        content: '<p>Draft content</p>',
        status: 'WRITING',
      });
      expect(prisma.story.update).toHaveBeenCalledWith({
        where: { id: 'story-id' },
        data: { status: 'WRITING' },
      });
      expect(result.id).toBe('article-id');
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.generateDraftFromResearchKit('user-id', 'nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should handle empty tags string', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ tags: '' }));
      const aiService = (service as any).aiService;
      aiService.generateDraft.mockResolvedValue({ title: 'T', content: '<p>C</p>' });
      const articlesService = (service as any).articlesService;
      articlesService.create.mockResolvedValue({ id: 'a1' });
      prisma.story.update.mockResolvedValue(mockStory());

      await service.generateDraftFromResearchKit('user-id', 'story-id', {} as any);

      expect(aiService.generateDraft).toHaveBeenCalledWith('user-id', undefined, expect.objectContaining({
        storyTags: [],
      }));
    });

    it('should pass story angle when present', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory({ angle: 'Angle', tags: '[]' }));
      const aiService = (service as any).aiService;
      aiService.generateDraft.mockResolvedValue({ title: 'T', content: '<p>C</p>' });
      const articlesService = (service as any).articlesService;
      articlesService.create.mockResolvedValue({ id: 'a1' });
      prisma.story.update.mockResolvedValue(mockStory());

      await service.generateDraftFromResearchKit('user-id', 'story-id', {} as any);

      expect(aiService.generateDraft).toHaveBeenCalledWith('user-id', undefined, expect.objectContaining({
        storyAngle: 'Angle',
      }));
    });

    it('should work without instruction', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory());
      const aiService = (service as any).aiService;
      aiService.generateDraft.mockResolvedValue({ title: 'T', content: '<p>C</p>' });
      const articlesService = (service as any).articlesService;
      articlesService.create.mockResolvedValue({ id: 'a1' });
      prisma.story.update.mockResolvedValue(mockStory());

      await service.generateDraftFromResearchKit('user-id', 'story-id', {} as any);

      expect(aiService.generateDraft).toHaveBeenCalledWith('user-id', undefined, expect.objectContaining({
        instruction: undefined,
      }));
    });
  });
});
