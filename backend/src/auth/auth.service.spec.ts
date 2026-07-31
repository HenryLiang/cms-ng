import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
  hash: jest.fn(),
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
        {
          provide: ConfigService,
          // Pin the refresh window at 30d so the age-boundary tests stay
          // independent of the production default (90d).
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_REFRESH_MAX_AGE' ? '30d' : undefined,
            ),
          },
        },
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
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('bcrypt_hashed_password');
    });

    it('should create user and return JWT when email is new', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-id',
        email: dto.email,
        name: dto.name,
        role: 'REPORTER',
        createdAt: new Date(),
      });

      const result = await service.register(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      // issue #104 — the caller-supplied password must be hashed, never a
      // shared default hash
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: 'bcrypt_hashed_password',
          role: 'REPORTER',
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
        role: 'REPORTER',
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

    it('issue #105 — should always register as REPORTER even if the client passes an elevated role (mass assignment)', async () => {
      const dtoWithRole = {
        email: 'evil@example.com',
        name: 'Evil',
        password: 'password123',
        role: 'ADMIN',
      } as unknown as Parameters<AuthService['register']>[0];
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-id',
        email: dtoWithRole.email,
        name: dtoWithRole.name,
        role: 'REPORTER',
        createdAt: new Date(),
      });

      const result = await service.register(dtoWithRole);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'REPORTER' }),
        }),
      );
      // the issued JWT must carry REPORTER, never the requested ADMIN
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        email: dtoWithRole.email,
        role: 'REPORTER',
      });
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
    const freshIat = () => Math.floor(Date.now() / 1000) - 60; // issued 1 min ago

    it('should return a new access token for a valid, non-expired token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: freshIat(),
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
      // issue #108 — renewed token pins the family start (fiat) so the
      // absolute window cannot be reset by refreshing
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        fiat: expect.any(Number),
      });
      expect(result.accessToken).toBe('test_jwt_token');
      expect(result.user.id).toBe('user-id');
    });

    it('issue #108 — should pin fiat to the ORIGINAL iat on first refresh and carry it forward', async () => {
      const originalIat = Math.floor(Date.now() / 1000) - 10 * 86400; // 10d ago
      // First refresh: token from login (iat only, no fiat yet)
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: originalIat,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
        role: 'REPORTER',
        isActive: true,
      });

      await service.refresh('first.token');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ fiat: originalIat }),
      );

      // Second refresh: renewed token carries fiat forward unchanged (fresh
      // iat from sign, but family start stays pinned 10 days back)
      jest.clearAllMocks();
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: Math.floor(Date.now() / 1000), // fresh iat from the renewal
        fiat: originalIat,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
        role: 'REPORTER',
        isActive: true,
      });

      await service.refresh('second.token');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ fiat: originalIat }),
      );
    });

    it('issue #108 — should reject a renewed token whose FAMILY age exceeds the window even with a fresh iat', async () => {
      // This is the reset attack: a renewed token always has a fresh iat,
      // so the cap must be computed from fiat, not iat.
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: Math.floor(Date.now() / 1000) - 60, // minted 1 min ago
        fiat: Math.floor(Date.now() / 1000) - 31 * 86400, // family is 31d old
      });

      await expect(service.refresh('renewed.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should return a new access token for an expired-but-signed token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: freshIat(),
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

    it('issue #108 — should reject a token whose iat exceeds the absolute refresh window', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: Math.floor(Date.now() / 1000) - 31 * 86400, // issued 31 days ago
      });

      await expect(service.refresh('ancient.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('issue #108 — should reject a token without iat (hand-crafted)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        // no iat
      });

      await expect(service.refresh('no.iat.token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user is inactive (isActive=false)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: freshIat(),
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
        iat: freshIat(),
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh('token.for.deleted.user')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  // ===== issue #108 — refresh family cap with REAL jsonwebtoken =====
  // The unit tests above mock JwtService; this describe uses the real
  // implementation to prove the absolute window survives renewals (the
  // reset attack the adversarial review demonstrated against the first
  // version of this fix).
  describe('refresh family cap (real JwtService)', () => {
    const realJwt = new JwtService({
      secret: 'spec-secret',
      signOptions: { expiresIn: '7d' },
    });

    const makeService = () =>
      new AuthService(
        prisma,
        realJwt,
        registrationService as unknown as RegistrationService,
        // 30d window so the 31-day family-age cases below stay meaningful
        // (the production default is 90d).
        {
          get: (key: string) =>
            key === 'JWT_REFRESH_MAX_AGE' ? '30d' : undefined,
        } as unknown as ConfigService,
      );

    const activeUser = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Test',
      role: 'REPORTER',
      isActive: true,
    };

    const signOld = (ageDays: number) =>
      realJwt.sign({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: Math.floor(Date.now() / 1000) - ageDays * 86400,
      });

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
    });

    it('should allow renewing a 29-day-old family across multiple refreshes without resetting the window', async () => {
      const svc = makeService();
      const t0 = signOld(29);

      const r1 = await svc.refresh(t0);
      const p1 = realJwt.decode(r1.accessToken);
      expect(p1.fiat).toBe(Math.floor(Date.now() / 1000) - 29 * 86400);

      // Renew the renewed token — family start must stay pinned
      const r2 = await svc.refresh(r1.accessToken);
      const p2 = realJwt.decode(r2.accessToken);
      expect(p2.fiat).toBe(p1.fiat);
      // ...while the fresh token itself is valid (fresh iat → valid exp)
      expect(() => realJwt.verify(r2.accessToken)).not.toThrow();
    });

    it('should reject refresh once the family is older than 30 days, even for a token minted seconds ago', async () => {
      const svc = makeService();
      // Family at day 29: refresh OK
      const r1 = await svc.refresh(signOld(29));
      // Forge time forward: a token whose family is 31 days old must die
      // even though its own iat is fresh (this is what T1/T2 look like after
      // two more days — the family crossed the absolute window).
      const ancient = realJwt.sign({
        sub: 'user-id',
        email: 'test@example.com',
        role: 'REPORTER',
        iat: Math.floor(Date.now() / 1000),
        fiat: Math.floor(Date.now() / 1000) - 31 * 86400,
      });
      await expect(svc.refresh(ancient)).rejects.toThrow(UnauthorizedException);
      expect(r1.accessToken).toBeTruthy();
    });
  });
});
