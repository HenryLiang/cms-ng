import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TransactionStatus } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { safeJsonParse } from '../common/json.utils';
import { userActiveCacheKey } from '../common/user-active.util';
import { serializeBillingTransaction } from '../common/billing-transaction.utils';

// 随机密码字母表剔除易混淆字符（0/O、1/l/I），便于人工抄录
const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const RANDOM_PASSWORD_LENGTH = 12;
const BCRYPT_SALT_ROUNDS = 10;

function generateRandomPassword(length = RANDOM_PASSWORD_LENGTH): string {
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return pwd;
}

// 脱敏用户字段（不含 passwordHash），含 balance
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  department: true,
  expertise: true,
  preferredLanguage: true,
  isActive: true,
  balance: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedUser = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: string;
  department: string | null;
  expertise: string;
  preferredLanguage: string | null;
  isActive: boolean;
  balance: unknown;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.serializeUser(u));
  }

  async findEditors() {
    const users = await this.prisma.user.findMany({
      where: { role: 'EDITOR' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        department: true,
      },
      orderBy: { name: 'asc' },
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) return null;
    return this.serializeUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });

    return this.serializeUser(user);
  }

  /**
   * 管理员创建账户。生成随机一次性密码（bcrypt 哈希存库），明文仅此一次返回给前端展示。
   */
  async create(dto: CreateUserDto): Promise<{
    user: ReturnType<UsersService['serializeUser']>;
    initialPassword: string;
  }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('该邮箱已被注册');
    }

    const initialPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role,
        department: dto.department,
        preferredLanguage: dto.preferredLanguage,
      },
      select: USER_SELECT,
    });

    return { user: this.serializeUser(user), initialPassword };
  }

  /**
   * 启用/禁用账户。禁用后立即失效 Redis 中的 active 缓存，使 JwtStrategy
   * 下次校验时回落 DB 读到最新状态——被禁用用户的后续请求立即被拒。
   * 禁止管理员禁用自己的账户，避免把自己锁死。
   */
  async setStatus(id: string, dto: UpdateUserStatusDto, operatorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (!dto.isActive && id === operatorId) {
      throw new BadRequestException('不能禁用自己的账户');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      select: USER_SELECT,
    });

    // 失效 active 缓存，下次请求重新从 DB 加载
    await this.redis.del(userActiveCacheKey(id));

    return this.serializeUser(user);
  }

  /**
   * 用户自助修改密码。校验当前密码后写入新哈希。
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('当前密码不正确');
    }

    const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
  }

  /**
   * 管理员重置密码。生成新的随机一次性密码，明文仅此一次返回。
   */
  async resetPassword(userId: string): Promise<{ password: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const password = generateRandomPassword();
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { password };
  }

  /**
   * 单账户消费汇总：余额、累计消费、累计充值、按类型/类目分布、最近流水（分页）。
   * 复用与 billing.service 一致的口径：完成态流水，负金额=消费。
   */
  async getConsumption(userId: string, page = 1, pageSize = 20) {
    // 防御性夹取：page/pageSize 来自 @Query 字符串解析，需抵御非正整数/NaN/负值，
    // 否则 Prisma skip/take 会抛 PrismaClientValidationError -> 500。
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const where = { userId, status: TransactionStatus.COMPLETED };

    const [recent, total, summaryTxns, topUps] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: {
          id: true,
          userId: true,
          type: true,
          category: true,
          amount: true,
          balanceAfter: true,
          description: true,
          articleId: true,
          aiOperationId: true,
          platformPublishId: true,
          quantity: true,
          unitPrice: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.billingTransaction.count({ where: { userId } }),
      this.prisma.billingTransaction.findMany({
        where,
        select: { type: true, amount: true, category: true },
      }),
      this.prisma.topUpRecord.findMany({
        where: { userId, status: TransactionStatus.COMPLETED },
        select: { amount: true },
      }),
    ]);

    let totalSpent = 0;
    let totalTopUp = 0;
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const t of summaryTxns) {
      const amount = Number(t.amount);
      if (amount < 0) {
        const abs = Math.abs(amount);
        totalSpent += abs;
        byType[t.type] = (byType[t.type] || 0) + abs;
        byCategory[t.category] = (byCategory[t.category] || 0) + abs;
      }
    }

    for (const r of topUps) {
      totalTopUp += Number(r.amount);
    }

    return {
      user: this.serializeUser(user),
      summary: {
        totalSpent,
        totalTopUp,
        transactionCount: summaryTxns.length,
        byType,
        byCategory,
      },
      recentTransactions: recent.map((t) => serializeBillingTransaction(t)),
      meta: { page: safePage, pageSize: safePageSize, total },
    };
  }

  private serializeUser(u: SelectedUser) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      department: u.department,
      expertise: safeJsonParse(u.expertise, []),
      preferredLanguage: u.preferredLanguage,
      isActive: u.isActive,
      balance: Number(u.balance),
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
