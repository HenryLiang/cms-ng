import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { userActiveCacheKey } from '../common/user-active.util';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
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
    preferredLanguage: 'TRADITIONAL_CHINESE_HK',
    isActive: true,
    balance: '0.0000',
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...override,
  });

  describe('findAll', () => {
    it('should return users with parsed expertise JSON and balance as number', async () => {
      prisma.user.findMany.mockResolvedValue([
        mockUser({ balance: '12.5000' }),
      ]);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].expertise).toEqual(['tech', 'politics']);
      expect(result[0].balance).toBe(12.5);
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
  });

  describe('update', () => {
    it('should update user and return updated user with parsed expertise', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());
      prisma.user.update.mockResolvedValue(mockUser({ name: 'Updated Name' }));

      const result = await service.update('user-id', { name: 'Updated Name' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { name: 'Updated Name' },
        select: expect.any(Object),
      });
      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a user with a random hashed password and return it once', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // email not taken
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      prisma.user.create.mockResolvedValue(
        mockUser({ email: 'new@example.com' }),
      );

      const result = await service.create({
        email: 'new@example.com',
        name: 'New User',
        role: 'REPORTER' as any,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
      );
      // plaintext password returned, 12 chars
      expect(result.initialPassword).toHaveLength(12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          name: 'New User',
          passwordHash: 'hashed_password',
        }),
        select: expect.any(Object),
      });
      // returned user is sanitized (no passwordHash)
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.email).toBe('new@example.com');
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());

      await expect(
        service.create({ email: 'test@example.com', name: 'Dup' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('should disable a user and invalidate the active cache', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ isActive: true }));
      prisma.user.update.mockResolvedValue(mockUser({ isActive: false }));

      const result = await service.setStatus(
        'user-id',
        { isActive: false },
        'admin-id',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { isActive: false },
        select: expect.any(Object),
      });
      expect(redis.del).toHaveBeenCalledWith(userActiveCacheKey('user-id'));
      expect(result.isActive).toBe(false);
    });

    it('should enable a user and invalidate the active cache', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ isActive: false }));
      prisma.user.update.mockResolvedValue(mockUser({ isActive: true }));

      const result = await service.setStatus(
        'user-id',
        { isActive: true },
        'admin-id',
      );

      expect(redis.del).toHaveBeenCalledWith(userActiveCacheKey('user-id'));
      expect(result.isActive).toBe(true);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.setStatus('nope', { isActive: false }, 'admin-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should forbid an admin from disabling their own account', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ id: 'admin-id' }));

      await expect(
        service.setStatus('admin-id', { isActive: false }, 'admin-id'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should allow an admin to disable a different account', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ id: 'user-id' }));
      prisma.user.update.mockResolvedValue(mockUser({ isActive: false }));

      await service.setStatus('user-id', { isActive: false }, 'admin-id');

      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('should verify current password and update the hash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        passwordHash: 'old_hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hash');

      await service.changePassword('user-id', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('old-password', 'old_hash');
      expect(bcrypt.hash).toHaveBeenCalledWith(
        'new-password',
        expect.any(Number),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { passwordHash: 'new_hash' },
      });
    });

    it('should throw BadRequestException when new password equals current password', async () => {
      await expect(
        service.changePassword('user-id', {
          currentPassword: 'same-password',
          newPassword: 'same-password',
        }),
      ).rejects.toThrow(BadRequestException);
      // rejected before any DB / bcrypt work
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        passwordHash: 'old_hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-id', {
          currentPassword: 'wrong',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('nope', {
          currentPassword: 'old',
          newPassword: 'new-password',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPassword', () => {
    it('should generate a new random password, hash it, and return plaintext once', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());
      (bcrypt.hash as jest.Mock).mockResolvedValue('reset_hash');

      const result = await service.resetPassword('user-id');

      expect(result.password).toHaveLength(12);
      expect(bcrypt.hash).toHaveBeenCalledWith(
        result.password,
        expect.any(Number),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { passwordHash: 'reset_hash' },
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getConsumption', () => {
    it('should aggregate consumption, top-ups, and recent transactions', async () => {
      prisma.user.findUnique.mockResolvedValue(
        mockUser({ balance: '80.0000' }),
      );
      // recent (paged, all statuses)
      prisma.billingTransaction.findMany
        .mockResolvedValueOnce([
          {
            id: 't1',
            userId: 'user-id',
            type: 'AI_LLM',
            category: 'AI',
            amount: '-5.0000',
            balanceAfter: '75.0000',
            description: 'llm call',
            articleId: null,
            aiOperationId: null,
            platformPublishId: null,
            quantity: '1',
            unitPrice: '5.0000',
            status: 'COMPLETED',
            createdAt: new Date(),
          },
        ])
        // summary (completed only)
        .mockResolvedValueOnce([
          { type: 'AI_LLM', amount: '-5.0000', category: 'AI' },
          { type: 'PUBLISH', amount: '-3.0000', category: 'PUBLISHING' },
          { type: 'TOP_UP', amount: '100.0000', category: 'OTHER' },
        ]);
      prisma.billingTransaction.count.mockResolvedValue(1);
      prisma.topUpRecord.findMany.mockResolvedValue([{ amount: '100.0000' }]);

      const result = await service.getConsumption('user-id', 1, 20);

      expect(result.user.balance).toBe(80);
      expect(result.summary.totalSpent).toBe(8); // 5 + 3
      expect(result.summary.totalTopUp).toBe(100);
      expect(result.summary.transactionCount).toBe(3);
      expect(result.summary.byType.AI_LLM).toBe(5);
      expect(result.summary.byType.PUBLISH).toBe(3);
      expect(result.summary.byCategory.AI).toBe(5);
      expect(result.summary.byCategory.PUBLISHING).toBe(3);
      expect(result.recentTransactions).toHaveLength(1);
      expect(result.recentTransactions[0].amount).toBe(-5);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getConsumption('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should clamp non-positive / NaN page and pageSize to safe bounds', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());
      prisma.billingTransaction.findMany
        .mockResolvedValueOnce([]) // recent (paged)
        .mockResolvedValueOnce([]); // summary (completed)
      prisma.billingTransaction.count.mockResolvedValue(0);
      prisma.topUpRecord.findMany.mockResolvedValue([]);

      await service.getConsumption('user-id', 0, -5);

      // page=0 -> safePage=1 -> skip=0; pageSize=-5 -> safePageSize=1 -> take=1
      expect(prisma.billingTransaction.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ skip: 0, take: 1 }),
      );
    });
  });
});
