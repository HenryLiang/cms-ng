import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrationService } from './registration.service';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/**
 * Parse a duration string like '30d', '12h', '15m', '90s' (bare number =
 * seconds) into seconds. Falls back to `fallbackSec` on malformed input
 * (with a warning — silent fallback hid config typos, per adversarial
 * review). Note this intentionally supports a narrower syntax than the
 * `ms` package used for JWT_EXPIRES_IN ('60 days', '1w' etc. are NOT
 * accepted here).
 */
function parseDurationSec(
  value: string | undefined,
  fallbackSec: number,
): number {
  if (!value) return fallbackSec;
  const match = /^(\d+)\s*([smhd])?$/i.exec(value.trim());
  if (!match) {
    new Logger('AuthService').warn(
      `Unparseable duration "${value}", falling back to ${fallbackSec}s. ` +
        'Use formats like 3600, 15m, 12h, 30d.',
    );
    return fallbackSec;
  }
  const n = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  const sec = n * factor;
  // Guard against absurd values: an overflowing duration (e.g. a 20-digit
  // day count → Infinity) would silently disable the refresh-family cap,
  // because `ageSec > Infinity` is always false.
  if (!Number.isFinite(sec) || sec <= 0) {
    new Logger('AuthService').warn(
      `Duration "${value}" is out of range, falling back to ${fallbackSec}s.`,
    );
    return fallbackSec;
  }
  return sec;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private registrationService: RegistrationService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (!(await this.registrationService.isRegistrationOpen())) {
      throw new ForbiddenException('注册功能已关闭，暂不接受新用户注册');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // issue #104 — hash the caller-supplied password. The previous build
    // ignored dto.password and stored a shared default hash (123456).
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        // issue #105 — public registration must never accept a role from the
        // client (mass assignment → register-as-ADMIN). Everyone registers as
        // REPORTER; privileged accounts are provisioned out-of-band (admin
        // bootstrap script / DB ops — there is intentionally no self-serve
        // role elevation API).
        role: UserRole.REPORTER,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        displayLanguage: true,
        preferredLanguage: true,
        createdAt: true,
      },
    });

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { user, accessToken: token };
  }

  /** 注册是否开放（委派 RegistrationService）。 */
  async getRegistrationStatus() {
    return {
      registrationOpen: await this.registrationService.isRegistrationOpen(),
    };
  }

  /** 开/关注册（委派 RegistrationService）。返回切换后的开放状态。 */
  async setRegistrationStatus(
    enabled: boolean,
    operatorId: string,
    reason?: string,
  ) {
    await this.registrationService.setRegistrationOpen(
      enabled,
      operatorId,
      reason,
    );
    return { registrationOpen: enabled };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 记录最后登录时间（仅凭证登录刷新；token refresh 不计为登录）。
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        displayLanguage: user.displayLanguage,
        preferredLanguage: user.preferredLanguage,
      },
      accessToken: token,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        department: true,
        expertise: true,
        displayLanguage: true,
        preferredLanguage: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  /**
   * Refresh an access token (issue #49).
   *
   * Accepts an existing JWT (valid OR expired) and re-issues a new one IF:
   *   1. The token's signature is valid (catch verify errors -> 401)
   *   2. The token FAMILY is within the absolute refresh window (issue #108):
   *      first refresh pins `fiat` (family issued-at) to the original iat and
   *      every renewal carries it forward, so the window cannot be reset by
   *      refreshing. Without this cap a leaked token could be renewed forever.
   *   3. The user still exists
   *   4. The user is still active (isActive=true)
   *
   * `ignoreExpiration: true` is intentional: the whole point of /refresh is
   * to renew tokens AFTER they expire. The signature check still rejects
   * forged tokens, and the family cap bounds how long a token family lives.
   *
   * Returns the same shape as login() so the frontend can swap the access
   * token transparently.
   */
  async refresh(oldToken: string) {
    let payload: {
      sub: string;
      email: string;
      role: string;
      iat?: number;
      fiat?: number;
    };
    try {
      payload = this.jwtService.verify(oldToken, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException('Invalid or malformed token');
    }

    // issue #108 — absolute refresh window for the whole token FAMILY.
    // `fiat` (family issued-at) is set on first refresh to the original
    // token's iat and carried forward unchanged on every renewal, so the
    // window cannot be reset by refreshing (each renewal gets a fresh iat
    // for a valid exp, but the family start is pinned). A token with no
    // iat at all is hand-crafted; treat it as non-refreshable.
    const maxAgeSec = parseDurationSec(
      this.config.get<string>('JWT_REFRESH_MAX_AGE'),
      // Default 90d: must exceed the longest documented JWT_EXPIRES_IN (12h)
      // or the refresh window closes before the first token expires.
      90 * 86400,
    );
    const familyStart = payload.fiat ?? payload.iat ?? NaN;
    const ageSec = Math.floor(Date.now() / 1000) - familyStart;
    if (!Number.isFinite(ageSec) || ageSec > maxAgeSec) {
      throw new UnauthorizedException(
        'Token is too old to refresh, please log in again',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        displayLanguage: true,
        preferredLanguage: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('User is inactive');
    }

    // Fresh iat (valid exp) + pinned family start (absolute cap holds).
    const newToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      fiat: familyStart,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        displayLanguage: user.displayLanguage,
        preferredLanguage: user.preferredLanguage,
      },
      accessToken: newToken,
    };
  }
}
