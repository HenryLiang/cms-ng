import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
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
    it('should return all stories ordered by priority for admin', async () => {
      prisma.story.findMany.mockResolvedValue([
        mockStory({ id: 's1', priority: 2 }),
        mockStory({ id: 's2', priority: 1 }),
      ]);

      const result = await service.findAll({ userId: 'admin-id', role: 'ADMIN' });

      expect(prisma.story.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        include: expect.any(Object),
      });
      expect(result).toHaveLength(2);
    });

    it('should filter by reporterId for reporter role', async () => {
      prisma.story.findMany.mockResolvedValue([mockStory()]);

      await service.findAll({ userId: 'user-id', role: 'REPORTER' });

      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reporterId: 'user-id' } }),
      );
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
      prisma.story.delete.mockResolvedValue(mockStory());

      const result = await service.remove('story-id');

      expect(prisma.story.delete).toHaveBeenCalledWith({ where: { id: 'story-id' } });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
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
});
