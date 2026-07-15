import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  USER_ACTIVE_CACHE_TTL,
  userActiveCacheKey,
} from '../common/user-active.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // 方案 B：每个已认证请求都校验账户是否启用，使「禁用账户」即时生效。
    // 缓存采用 fail-closed 策略：只缓存拒绝('0')，永不缓存/信任放行('1')。
    // 这样缓存只能"保守拒绝"——竞态或 Redis 投毒写入的 '1' 都不会被采纳，
    // 禁用立即生效；最坏情况是刚启用的用户被残留 '0' 短暂拒绝（setStatus 会删 key 兜底）。
    // Redis 不可用时 get 返回 null（视为未命中）-> 每次回落 DB，正确性优先。
    const active = await this.isUserActive(payload.sub);
    if (!active) {
      throw new UnauthorizedException('账户已被禁用');
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }

  private async isUserActive(userId: string): Promise<boolean> {
    const key = userActiveCacheKey(userId);
    // 只信任缓存的拒绝('0')。任何其他值（未命中、残留/被投毒的 '1'）都回落 DB。
    const cached = await this.redis.get(key);
    if (cached === '0') return false;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    const active = user?.isActive ?? false;
    // 只回填拒绝结果，使缓存永远不会错误放行。
    if (!active) {
      void this.redis.set(key, '0', USER_ACTIVE_CACHE_TTL);
    }
    return active;
  }
}
