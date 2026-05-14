import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    jwtService = { sign: jest.fn().mockReturnValue('test_jwt_token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto = { email: 'test@example.com', name: 'Test', password: 'password123', role: 'REPORTER' as const };

    it('should create user and return JWT when email is new', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        name: dto.name,
        role: dto.role,
        createdAt: new Date(),
      });

      const result = await service.register(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: dto.email } });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: 'hashed_password',
          role: dto.role,
        },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-id', email: dto.email, role: dto.role });
      expect(result.accessToken).toBe('test_jwt_token');
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-id', email: dto.email });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'password123' };

    it('should return JWT when credentials are valid', async () => {
      const user = {
        id: 'user-id',
        email: dto.email,
        name: 'Test',
        role: 'REPORTER',
        passwordHash: 'hashed_password',
      };
      prisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: dto.email } });
      expect(bcrypt.compare).toHaveBeenCalledWith(dto.password, user.passwordHash);
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-id', email: dto.email, role: 'REPORTER' });
      expect(result.user.id).toBe('user-id');
      expect(result.accessToken).toBe('test_jwt_token');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        name: 'Test',
        role: 'REPORTER',
        passwordHash: 'hashed_password',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getCurrentUser', () => {
    it('should return user profile when found', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
        avatar: null,
        role: 'REPORTER',
        department: null,
        expertise: '[]',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getCurrentUser('user-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          department: true,
          expertise: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result.id).toBe('user-id');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(UnauthorizedException);
    });
  });
});
