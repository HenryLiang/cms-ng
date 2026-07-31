import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // 方案 B：每个已认证请求都校验账户是否启用，使「禁用账户」即时生效。
    // 直接查 DB（MySQL 主键查询，~1ms 量级，内部 CMS 无压力）。DB 即真源，
    // 无缓存即无失效一致性问题，禁用立即生效。
    const active = await this.isUserActive(payload.sub);
    if (!active) {
      throw new UnauthorizedException('账户已被禁用');
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }

  private async isUserActive(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    return user?.isActive ?? false;
  }
}
