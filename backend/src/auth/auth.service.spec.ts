import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let registrationService: {
    isRegistrationOpen: jest.Mock;
    setRegistrationOpen: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    jwtService = {
      sign: jest.fn().mockReturnValue('test_jwt_token'),
      verify: jest.fn(),
    };
    registrationService = {
      isRegistrationOpen: jest.fn().mockResolvedValue(true), // default-open
      setRegistrationOpen: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: RegistrationService, useValue: registrationService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto = {
      email: 'test@example.com',
      name: 'Test',
      password: 'password123',
      role: 'REPORTER' as const,
    };

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

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash:
            '$2b$12$J7rpHCrlCYUeDlxLcqQjKeLBdDZjpzKC5KaDO0NqgQ8TkmVnIk1nS',
          role: dto.role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          preferredLanguage: true,
          createdAt: true,
        },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        email: dto.email,
        role: dto.role,
      });
      expect(result.accessToken).toBe('test_jwt_token');
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-id',
        email: dto.email,
      });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should allow registration without optional role', async () => {
      const dtoNoRole = {
        email: 'new@example.com',
        name: 'Test',
        password: 'password123',
      };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-id',
        email: dtoNoRole.email,
        name: dtoNoRole.name,
        role: undefined,
        createdAt: new Date(),
      });

      const result = await service.register(dtoNoRole);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: undefined }),
        }),
      );
      expect(result.accessToken).toBe('test_jwt_token');
    });

    it('should throw ForbiddenException when registration is closed (gate before any DB write)', async () => {
      registrationService.isRegistrationOpen.mockResolvedValue(false);

      await expect(service.register(dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('registration status (delegates to RegistrationService)', () => {
    it('getRegistrationStatus should return { registrationOpen } from the service', async () => {
      registrationService.isRegistrationOpen.mockResolvedValue(true);
      await expect(service.getRegistrationStatus()).resolves.toEqual({
        registrationOpen: true,
      });
      expect(registrationService.isRegistrationOpen).toHaveBeenCalled();
    });

    it('setRegistrationStatus should delegate and return { registrationOpen: enabled }', async () => {
      const result = await service.setRegistrationStatus(
        false,
        'admin-id',
        '维护',
      );
      expect(registrationService.setRegistrationOpen).toHaveBeenCalledWith(
        false,
        'admin-id',
        '维护',
      );
      expect(result).toEqual({ registrationOpen: false });
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

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        dto.password,
        user.passwordHash,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { lastLoginAt: expect.any(Date) },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        email: dto.email,
        role: 'REPORTER',
      });
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
          preferredLanguage: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result.id).toBe('user-id');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ===== issue #49 — POST /auth/refresh =====
  describe('refresh (issue #49)', () => {
    it('should return a new access token for a valid, non-expired token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
        role: 'REPORTER',
        isActive: true,
      });

      const result = await service.refresh('valid.jwt.token');

      // verify must be called with ignoreExpiration: true so expired tokens
      // can still be refreshed (issue #49 acceptance criteria)
      expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token', {
        ignoreExpiration: true,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
      });
      expect(result.accessToken).toBe('test_jwt_token');
      expect(result.user.id).toBe('user-id');
    });

    it('should return a new access token for an expired-but-signed token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
        role: 'REPORTER',
        isActive: true,
      });

      const result = await service.refresh('expired.but.signed.jwt');

      expect(result.accessToken).toBe('test_jwt_token');
    });

    it('should throw UnauthorizedException when user is inactive (isActive=false)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
        role: 'REPORTER',
        isActive: false,
      });

      await expect(service.refresh('valid.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token signature is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.refresh('forged.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user referenced by token no longer exists', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'deleted-user-id',
        email: 'gone@example.com',
        role: 'REPORTER',
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh('token.for.deleted.user')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });
});
