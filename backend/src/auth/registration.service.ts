import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 注册功能开放开关 — 管理员控制注册功能的开/关。
 *
 * 复用 KillSwitch 单例表模式（issue #48），但语义相反：
 *   - KillSwitch.enabled=true 表示「关闭/杀死」，默认 false
 *   - RegistrationSwitch.enabled=true 表示「注册开放」，默认 true
 *
 * MySQL 为唯一真源，不读 Redis（注册状态为冷路径：每页加载 + 每提交各查一次，
 * 加 Redis 属 cargo-cult）。行不存在时视为「开放」（默认开放 = 无行 = 开放）。
 */
@Injectable()
export class RegistrationService {
  private static readonly REGISTRATION_SWITCH_ID = 'registration';

  constructor(private prisma: PrismaService) {}

  /**
   * 注册是否开放 — MySQL 为唯一真源。
   * 行不存在视为开放（默认开放）；仅 enabled=false 才视为关闭。
   */
  async isRegistrationOpen(): Promise<boolean> {
    const row = await this.prisma.registrationSwitch.findUnique({
      where: { id: RegistrationService.REGISTRATION_SWITCH_ID },
    });
    return row?.enabled !== false; // absent OR enabled=true → open
  }

  /**
   * 开/关注册。upsert 单例行，记录审计字段。
   * @returns 切换后的开放状态
   */
  async setRegistrationOpen(
    enabled: boolean,
    operatorId: string,
    reason?: string,
  ): Promise<boolean> {
    await this.prisma.registrationSwitch.upsert({
      where: { id: RegistrationService.REGISTRATION_SWITCH_ID },
      create: {
        id: RegistrationService.REGISTRATION_SWITCH_ID,
        enabled,
        enabledAt: new Date(),
        enabledBy: operatorId,
        reason: reason ?? null,
      },
      update: {
        enabled,
        enabledAt: new Date(),
        enabledBy: operatorId,
        reason: reason ?? null,
      },
    });
    return enabled;
  }
}
