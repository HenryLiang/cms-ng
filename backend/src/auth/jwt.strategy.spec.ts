import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  const payload = {
    sub: 'user-id',
    email: 'test@example.com',
    role: 'REPORTER',
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue('test-secret') } as any;
    strategy = new JwtStrategy(
      config as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should read the DB on every request and allow when active', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true });

    const result = await strategy.validate(payload);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: { isActive: true },
    });
    expect(result).toEqual({
      userId: 'user-id',
      email: 'test@example.com',
      role: 'REPORTER',
    });
  });

  it('should throw when the DB says inactive (disabled account takes effect immediately)', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: false });

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw when the user no longer exists (deleted)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
