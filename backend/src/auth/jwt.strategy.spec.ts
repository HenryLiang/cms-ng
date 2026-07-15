import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UnauthorizedException } from '@nestjs/common';
import { userActiveCacheKey } from '../common/user-active.util';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };
  let redis: { get: jest.Mock; set: jest.Mock };

  const payload = { sub: 'user-id', email: 'test@example.com', role: 'REPORTER' };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('test-secret') } as any;
    strategy = new JwtStrategy(
      config as ConfigService,
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should deny immediately when cache holds a deny ("0") without hitting the DB', async () => {
    redis.get.mockResolvedValue('0');

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should read the DB on cache miss and allow when active (and NOT cache a positive)', async () => {
    redis.get.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ isActive: true });

    const result = await strategy.validate(payload);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: { isActive: true },
    });
    expect(result).toEqual({ userId: 'user-id', email: 'test@example.com', role: 'REPORTER' });
    // fail-closed: a positive result is never cached
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('should throw and cache the deny ("0") when the DB says inactive', async () => {
    redis.get.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ isActive: false });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(redis.set).toHaveBeenCalledWith(userActiveCacheKey('user-id'), '0', expect.any(Number));
  });

  it('should throw when the user no longer exists (deleted)', async () => {
    redis.get.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should NOT trust a cached/positive "1" (race or Redis poisoning) and re-check the DB', async () => {
    // An attacker (or a stale race) wrote '1' into Redis for a disabled user.
    redis.get.mockResolvedValue('1');
    prisma.user.findUnique.mockResolvedValue({ isActive: false });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});
