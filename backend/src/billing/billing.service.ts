import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  BillingCategory,
  UserRole,
} from '@cms-ng/shared';
import { ManualTopUpDto } from './dto/manual-top-up.dto';
import { UpdateBillingConfigDto } from './dto/update-billing-config.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { EstimateCostDto, EstimateOperationType } from './dto/estimate-cost.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { serializeBillingTransaction } from '../common/billing-transaction.utils';

export class InsufficientBalanceException extends BadRequestException {
  constructor(required: number, available: number) {
    super(
      `余额不足，需要 ¥${required.toFixed(2)}，当前余额 ¥${available.toFixed(2)}`,
    );
  }
}

export interface DeductParams {
  userId: string;
  type: TransactionType;
  category: BillingCategory;
  amount: number;
  description: string;
  articleId?: string;
  aiOperationId?: string;
  platformPublishId?: string;
  quantity?: number;
  unitPrice?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface CreditParams {
  userId: string;
  amount: number;
  type: TransactionType;
  description: string;
  topUpRecordId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly billingEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.billingEnabled = this.config.get<string>('BILLING_ENABLED') !== 'false';
    if (!this.billingEnabled) {
      this.logger.warn('Billing system is DISABLED (BILLING_ENABLED=false)');
    }
  }

  /**
   * Get user balance and recent transactions.
   */
  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const alert = await this.prisma.balanceAlert.findUnique({
      where: { userId },
    });

    const recentTransactions = await this.prisma.billingTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      balance: Number(user.balance),
      alertThreshold: alert ? Number(alert.thresholdAmount) : null,
      recentTransactions: recentTransactions.map((t) => this.serializeTransaction(t)),
    };
  }

  /**
   * Check if user has sufficient balance.
   */
  async checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
    if (!this.billingEnabled) return true;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) return false;

    return Number(user.balance) >= requiredAmount;
  }

  /**
   * Deduct credits from user balance.
   * Uses pessimistic locking (SELECT ... FOR UPDATE) for concurrency safety.
   */
  async deduct(params: DeductParams) {
    if (!this.billingEnabled) return null;
    if (params.amount <= 0) return null;

    // Check idempotency
    if (params.idempotencyKey) {
      const existing = await this.prisma.billingTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        this.logger.debug(`Idempotent deduct hit: ${params.idempotencyKey}`);
        return this.serializeTransaction(existing);
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        // 1. Row-level lock
        const rows = await tx.$queryRaw<Array<{ balance: string }>>`
          SELECT balance FROM users WHERE id = ${params.userId} FOR UPDATE
        `;

        if (!rows.length) {
          throw new NotFoundException('User not found');
        }

        const currentBalance = Number(rows[0].balance);
        if (currentBalance < params.amount) {
          throw new InsufficientBalanceException(params.amount, currentBalance);
        }

        // 2. Deduct
        const newBalance = currentBalance - params.amount;
        await tx.user.update({
          where: { id: params.userId },
          data: { balance: newBalance },
        });

        // 3. Record transaction
        const transaction = await tx.billingTransaction.create({
          data: {
            userId: params.userId,
            type: params.type,
            category: params.category,
            amount: -params.amount,
            balanceAfter: newBalance,
            description: params.description,
            articleId: params.articleId,
            aiOperationId: params.aiOperationId,
            platformPublishId: params.platformPublishId,
            quantity: params.quantity,
            unitPrice: params.unitPrice,
            idempotencyKey: params.idempotencyKey,
            metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
            status: TransactionStatus.COMPLETED,
          },
        });

        return this.serializeTransaction(transaction);
      },
      {
        isolationLevel: 'ReadCommitted',
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Credit (add) balance to user account.
   */
  async credit(params: CreditParams) {
    if (params.amount <= 0) {
      throw new BadRequestException('Credit amount must be positive');
    }

    // Check idempotency
    if (params.idempotencyKey) {
      const existing = await this.prisma.billingTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        this.logger.debug(`Idempotent credit hit: ${params.idempotencyKey}`);
        return this.serializeTransaction(existing);
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ balance: string }>>`
          SELECT balance FROM users WHERE id = ${params.userId} FOR UPDATE
        `;

        if (!rows.length) {
          throw new NotFoundException('User not found');
        }

        const currentBalance = Number(rows[0].balance);
        const newBalance = currentBalance + params.amount;

        await tx.user.update({
          where: { id: params.userId },
          data: { balance: newBalance },
        });

        const transaction = await tx.billingTransaction.create({
          data: {
            userId: params.userId,
            type: params.type,
            category: BillingCategory.OTHER,
            amount: params.amount,
            balanceAfter: newBalance,
            description: params.description,
            topUpRecordId: params.topUpRecordId,
            idempotencyKey: params.idempotencyKey,
            status: TransactionStatus.COMPLETED,
          },
        });

        return this.serializeTransaction(transaction);
      },
      {
        isolationLevel: 'ReadCommitted',
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Manual top-up by admin.
   */
  async manualTopUp(adminId: string, dto: ManualTopUpDto) {
    // Verify admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can perform manual top-ups');
    }

    // Create top-up record
    const record = await this.prisma.topUpRecord.create({
      data: {
        userId: dto.targetUserId,
        amount: dto.amount,
        creditsAdded: dto.amount,
        bonusCredits: 0,
        paymentMethod: PaymentMethod.MANUAL,
        status: TransactionStatus.COMPLETED,
        paidAt: new Date(),
      },
    });

    // Credit balance
    const transaction = await this.credit({
      userId: dto.targetUserId,
      amount: dto.amount,
      type: TransactionType.TOP_UP,
      description: `手动充值 ¥${dto.amount}${dto.reason ? ` (${dto.reason})` : ''}`,
      topUpRecordId: record.id,
      idempotencyKey: `topup:${record.id}`,
    });

    // Link top-up record to transaction
    await this.prisma.billingTransaction.update({
      where: { id: transaction.id },
      data: { topUpRecordId: record.id },
    });

    this.logger.log(
      `Manual top-up: admin=${adminId}, user=${dto.targetUserId}, amount=${dto.amount}`,
    );

    return {
      topUpRecord: {
        id: record.id,
        amount: Number(record.amount),
        creditsAdded: Number(record.creditsAdded),
        paymentMethod: record.paymentMethod,
        status: record.status,
        createdAt: record.createdAt,
      },
      transaction,
    };
  }

  /**
   * Get all billing configs.
   */
  async getAllConfigs() {
    const configs = await this.prisma.billingConfig.findMany({
      orderBy: [{ category: 'asc' }, { itemKey: 'asc' }],
    });
    return configs.map((c) => ({
      id: c.id,
      category: c.category,
      itemKey: c.itemKey,
      itemName: c.itemName,
      unitPrice: Number(c.unitPrice),
      unit: c.unit,
      isActive: c.isActive,
    }));
  }

  /**
   * Get a specific config by itemKey.
   */
  async getConfig(itemKey: string) {
    const config = await this.prisma.billingConfig.findFirst({
      where: { itemKey },
    });
    if (!config) throw new NotFoundException(`Billing config not found: ${itemKey}`);
    return {
      ...config,
      unitPrice: Number(config.unitPrice),
    };
  }

  /**
   * Update a billing config (admin only).
   */
  async updateConfig(adminId: string, itemKey: string, dto: UpdateBillingConfigDto) {
    const config = await this.prisma.billingConfig.findFirst({
      where: { itemKey },
    });
    if (!config) throw new NotFoundException(`Billing config not found: ${itemKey}`);

    const updated = await this.prisma.billingConfig.update({
      where: { id: config.id },
      data: {
        unitPrice: dto.unitPrice,
        itemName: dto.itemName,
        isActive: dto.isActive,
        updatedBy: adminId,
      },
    });

    return {
      ...updated,
      unitPrice: Number(updated.unitPrice),
    };
  }

  /**
   * Estimate cost for an operation.
   */
  async estimateCost(userId: string, dto: EstimateCostDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const currentBalance = Number(user.balance);
    const breakdown: Array<{ item: string; quantity: number; unitPrice: number; subtotal: number }> = [];
    let estimatedCost = 0;

    switch (dto.operationType) {
      case EstimateOperationType.AI_LLM: {
        const config = await this.getConfigSafe('ai_llm_per_1k_tokens');
        const tokens = dto.estimatedTokens || 2000; // default estimate
        const units = Math.ceil(tokens / 1000);
        const price = config?.unitPrice || 0.02;
        const subtotal = units * price;
        breakdown.push({ item: 'AI LLM 调用', quantity: units, unitPrice: price, subtotal });
        estimatedCost += subtotal;
        break;
      }
      case EstimateOperationType.AI_IMAGE: {
        const config = await this.getConfigSafe('ai_image_per_piece');
        const price = config?.unitPrice || 0.5;
        breakdown.push({ item: 'AI 图片生成', quantity: 1, unitPrice: price, subtotal: price });
        estimatedCost += price;
        break;
      }
      case EstimateOperationType.PUBLISH: {
        const platforms = dto.platforms || [];
        for (const platform of platforms) {
          const key = `publish_${platform.toLowerCase()}`;
          const config = await this.getConfigSafe(key);
          const price = config?.unitPrice || 0.1;
          breakdown.push({ item: `${platform} 发布`, quantity: 1, unitPrice: price, subtotal: price });
          estimatedCost += price;
        }
        break;
      }
      case EstimateOperationType.AUTO_PUBLISH: {
        const batchSize = dto.batchSize || 1;
        // Estimate per-article cost (AI + publish)
        const aiConfig = await this.getConfigSafe('ai_llm_per_1k_tokens');
        const aiPrice = aiConfig?.unitPrice || 0.02;
        const aiTokens = 3000; // estimated tokens per auto-generated article
        const aiCost = Math.ceil(aiTokens / 1000) * aiPrice;

        const publishConfig = await this.getConfigSafe('publish_website');
        const publishPrice = publishConfig?.unitPrice || 0;

        const surchargeConfig = await this.getConfigSafe('auto_publish_surcharge');
        const surchargePrice = surchargeConfig?.unitPrice || 0.05;

        const perArticleCost = aiCost + publishPrice;
        breakdown.push({
          item: 'AI 生成 (每篇)',
          quantity: batchSize,
          unitPrice: aiCost,
          subtotal: aiCost * batchSize,
        });
        breakdown.push({
          item: '发布费用 (每篇)',
          quantity: batchSize,
          unitPrice: publishPrice,
          subtotal: publishPrice * batchSize,
        });
        breakdown.push({
          item: '自动发布附加费',
          quantity: 1,
          unitPrice: surchargePrice,
          subtotal: surchargePrice,
        });
        estimatedCost = aiCost * batchSize + publishPrice * batchSize + surchargePrice;
        break;
      }
      case EstimateOperationType.X_TRENDING: {
        // X (twitterapi.io) 数据源拉取 — 缓存命中免费，仅缓存未命中时扣费。
        // 一次拉取（趋势榜单或聚合账号推文）按一次调用计费。
        const config = await this.getConfigSafe('x_trending_fetch');
        const price = config?.unitPrice || 0.05;
        breakdown.push({ item: 'X 数据源拉取', quantity: 1, unitPrice: price, subtotal: price });
        estimatedCost += price;
        break;
      }
    }

    return {
      estimatedCost,
      breakdown,
      sufficientBalance: currentBalance >= estimatedCost,
      currentBalance,
    };
  }

  /**
   * Query personal transactions with pagination and filters.
   */
  async getTransactions(userId: string, query: QueryTransactionsDto) {
    const { page = 1, pageSize = 20, type, startDate, endDate } = query;

    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.billingTransaction.count({ where }),
    ]);

    // Summary
    const allTransactions = await this.prisma.billingTransaction.findMany({
      where: {
        ...where,
        status: TransactionStatus.COMPLETED,
      },
      select: { type: true, amount: true, category: true },
    });

    let totalSpent = 0;
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const t of allTransactions) {
      const amount = Number(t.amount);
      if (amount < 0) {
        totalSpent += Math.abs(amount);
        byType[t.type] = (byType[t.type] || 0) + Math.abs(amount);
        byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(amount);
      }
    }

    return {
      data: transactions.map((t) => this.serializeTransaction(t)),
      meta: { page, pageSize, total },
      summary: { totalSpent, byType, byCategory },
    };
  }

  /**
   * Query team transactions (editor+).
   */
  async getTeamTransactions(query: QueryTransactionsDto) {
    const { page = 1, pageSize = 20, type, startDate, endDate } = query;

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.billingTransaction.count({ where }),
    ]);

    return {
      data: transactions.map((t) => ({
        ...this.serializeTransaction(t),
        user: { id: t.user.id, name: t.user.name, email: t.user.email },
      })),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get top-up records (admin).
   */
  async getTopUpRecords(page = 1, pageSize = 20) {
    const [records, total] = await Promise.all([
      this.prisma.topUpRecord.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.topUpRecord.count(),
    ]);

    return {
      data: records.map((r) => ({
        id: r.id,
        userId: r.userId,
        user: { id: r.user.id, name: r.user.name, email: r.user.email },
        amount: Number(r.amount),
        creditsAdded: Number(r.creditsAdded),
        bonusCredits: Number(r.bonusCredits),
        paymentMethod: r.paymentMethod,
        status: r.status,
        paidAt: r.paidAt,
        createdAt: r.createdAt,
      })),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get or create balance alert config.
   */
  async getAlert(userId: string) {
    const alert = await this.prisma.balanceAlert.findUnique({
      where: { userId },
    });
    if (!alert) return { thresholdAmount: null, isEnabled: false };
    return {
      id: alert.id,
      thresholdAmount: Number(alert.thresholdAmount),
      isEnabled: alert.isEnabled,
      lastTriggeredAt: alert.lastTriggeredAt,
    };
  }

  /**
   * Update balance alert config.
   */
  async updateAlert(userId: string, dto: UpdateAlertDto) {
    const alert = await this.prisma.balanceAlert.upsert({
      where: { userId },
      create: {
        userId,
        thresholdAmount: dto.thresholdAmount,
        isEnabled: dto.isEnabled ?? true,
      },
      update: {
        thresholdAmount: dto.thresholdAmount,
        isEnabled: dto.isEnabled,
      },
    });

    return {
      id: alert.id,
      thresholdAmount: Number(alert.thresholdAmount),
      isEnabled: alert.isEnabled,
    };
  }

  /**
   * Check and trigger balance alert if below threshold.
   */
  async checkAndAlertBalance(userId: string): Promise<void> {
    const alert = await this.prisma.balanceAlert.findUnique({
      where: { userId },
    });
    if (!alert || !alert.isEnabled) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) return;

    const balance = Number(user.balance);
    const threshold = Number(alert.thresholdAmount);

    if (balance <= threshold) {
      // Check if we already triggered in the last 24 hours
      if (
        alert.lastTriggeredAt &&
        Date.now() - alert.lastTriggeredAt.getTime() < 24 * 60 * 60 * 1000
      ) {
        return;
      }

      await this.prisma.balanceAlert.update({
        where: { userId },
        data: { lastTriggeredAt: new Date() },
      });

      this.logger.warn(
        `Balance alert triggered for user ${userId}: balance=${balance}, threshold=${threshold}`,
      );
    }
  }

  /**
   * Process a refund (admin only).
   */
  async refund(adminId: string, dto: CreateRefundDto) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can process refunds');
    }

    // Find original transaction
    const original = await this.prisma.billingTransaction.findUnique({
      where: { id: dto.originalTransactionId },
    });
    if (!original) {
      throw new NotFoundException('Original transaction not found');
    }
    if (original.status === TransactionStatus.REFUNDED) {
      throw new BadRequestException('Transaction already refunded');
    }

    const originalAmount = Math.abs(Number(original.amount));
    const refundAmount = dto.refundAmount || originalAmount;

    if (refundAmount > originalAmount) {
      throw new BadRequestException(
        `Refund amount (¥${refundAmount}) exceeds original amount (¥${originalAmount})`,
      );
    }

    // Credit the refund
    const transaction = await this.credit({
      userId: original.userId,
      amount: refundAmount,
      type: TransactionType.REFUND,
      description: `退款: ${dto.reason} (原交易: ${original.description})`,
      idempotencyKey: `refund:${original.id}`,
    });

    // Mark original as refunded
    await this.prisma.billingTransaction.update({
      where: { id: original.id },
      data: { status: TransactionStatus.REFUNDED },
    });

    this.logger.log(
      `Refund processed: admin=${adminId}, originalTx=${original.id}, amount=${refundAmount}`,
    );

    return transaction;
  }

  /**
   * Get consumption report (admin).
   */
  async getReport(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const transactions = await this.prisma.billingTransaction.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: TransactionStatus.COMPLETED,
      },
      select: {
        type: true,
        category: true,
        amount: true,
        userId: true,
        createdAt: true,
      },
    });

    const topUps = await this.prisma.topUpRecord.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: TransactionStatus.COMPLETED,
      },
      select: { amount: true, createdAt: true },
    });

    let totalRevenue = 0;
    let totalConsumption = 0;
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const t of transactions) {
      const amount = Number(t.amount);
      if (amount > 0) {
        byType[t.type] = (byType[t.type] || 0) + amount;
      } else {
        const abs = Math.abs(amount);
        totalConsumption += abs;
        byType[t.type] = (byType[t.type] || 0) + abs;
        byCategory[t.category] = (byCategory[t.category] || 0) + abs;
        byUser[t.userId] = (byUser[t.userId] || 0) + abs;
      }
    }

    for (const topUp of topUps) {
      totalRevenue += Number(topUp.amount);
    }

    // Top 10 users by consumption
    const topUsers = Object.entries(byUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    const topUserDetails = await Promise.all(
      topUsers.map(async ([userId, totalSpent]) => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });
        return {
          userId,
          userName: user?.name || 'Unknown',
          totalSpent,
        };
      }),
    );

    return {
      period: { start, end },
      totalRevenue,
      totalConsumption,
      netChange: totalRevenue - totalConsumption,
      byType,
      byCategory,
      topUsers: topUserDetails,
    };
  }

  /**
   * Check if billing is enabled.
   */
  isEnabled(): boolean {
    return this.billingEnabled;
  }

  // ─── Private helpers ───

  private async getConfigSafe(itemKey: string) {
    const config = await this.prisma.billingConfig.findFirst({
      where: { itemKey, isActive: true },
    });
    return config ? { ...config, unitPrice: Number(config.unitPrice) } : null;
  }

  private serializeTransaction(t: {
    id: string;
    userId: string;
    type: string;
    category: string;
    amount: unknown;
    balanceAfter: unknown;
    description: string;
    articleId: string | null;
    aiOperationId: string | null;
    platformPublishId: string | null;
    quantity: unknown;
    unitPrice: unknown;
    status: string;
    createdAt: Date;
  }) {
    // Delegate to the shared serializer so the transaction shape stays
    // identical across 计费管理 and 账号管理 (see common/billing-transaction.utils).
    return serializeBillingTransaction(t);
  }
}
