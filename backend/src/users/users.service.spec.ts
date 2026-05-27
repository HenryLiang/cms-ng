import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = (override?: any) => ({
    id: 'user-id',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    role: 'REPORTER',
    department: 'News',
    expertise: '["tech", "politics"]',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...override,
  });

  describe('findAll', () => {
    it('should return users with parsed expertise JSON', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser()]);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].expertise).toEqual(['tech', 'politics']);
    });

    it('should handle null expertise by defaulting to empty array', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser({ expertise: null })]);

      const result = await service.findAll();

      expect(result[0].expertise).toEqual([]);
    });

    it('should return empty array when no users', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findEditors', () => {
    it('should filter users by EDITOR role', async () => {
      prisma.user.findMany.mockResolvedValue([
        mockUser({ id: 'e1', name: 'Editor One', role: 'EDITOR' }),
      ]);

      const result = await service.findEditors();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'EDITOR' },
        select: expect.any(Object),
        orderBy: { name: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('EDITOR');
    });

    it('should return empty array when no editors', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.findEditors();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return user with parsed expertise', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());

      const result = await service.findOne('user-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: expect.any(Object),
      });
      expect(result).not.toBeNull();
      expect(result!.expertise).toEqual(['tech', 'politics']);
    });

    it('should return null when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findOne('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle null expertise for found user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ expertise: null }));

      const result = await service.findOne('user-id');

      expect(result!.expertise).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update user and return updated user with parsed expertise', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());
      prisma.user.update.mockResolvedValue(mockUser({ name: 'Updated Name' }));

      const result = await service.update('user-id', { name: 'Updated Name' });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-id' } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { name: 'Updated Name' },
        select: expect.any(Object),
      });
      expect(result.name).toBe('Updated Name');
      expect(result.expertise).toEqual(['tech', 'politics']);
    });

    it('should update preferredLanguage', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());
      prisma.user.update.mockResolvedValue(mockUser({ preferredLanguage: 'ENGLISH' }));

      const result = await service.update('user-id', { preferredLanguage: 'ENGLISH' as any });

      expect(result.preferredLanguage).toBe('ENGLISH');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'Test' })).rejects.toThrow('User not found');
    });
  });
});
