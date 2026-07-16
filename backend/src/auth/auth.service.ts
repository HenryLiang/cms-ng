import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrationService } from './registration.service';
import * as bcrypt from 'bcryptjs';

// 默认密码 123456 的 bcrypt 哈希（开发测试环境统一使用）
const DEFAULT_PASSWORD_HASH =
  '$2b$12$J7rpHCrlCYUeDlxLcqQjKeLBdDZjpzKC5KaDO0NqgQ8TkmVnIk1nS';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private registrationService: RegistrationService,
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

    const passwordHash = DEFAULT_PASSWORD_HASH;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
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
   *   2. The user still exists
   *   3. The user is still active (isActive=true)
   *
   * `ignoreExpiration: true` is intentional: the whole point of /refresh is
   * to renew tokens AFTER they expire. The signature check still rejects
   * forged tokens.
   *
   * Returns the same shape as login() so the frontend can swap the access
   * token transparently.
   */
  async refresh(oldToken: string) {
    let payload: { sub: string; email: string; role: string };
    try {
      payload = this.jwtService.verify(oldToken, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException('Invalid or malformed token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        preferredLanguage: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('User is inactive');
    }

    const newToken = this.jwtService.sign({
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
        preferredLanguage: user.preferredLanguage,
      },
      accessToken: newToken,
    };
  }
}
