import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { PrismaService } from '../prisma/prisma.service';
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
});
