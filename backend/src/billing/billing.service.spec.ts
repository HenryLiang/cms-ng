import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  BillingService,
  InsufficientBalanceException,
} from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  BillingCategory,
  UserRole,
} from '@cms-ng/shared';
import { EstimateOperationType } from './dto/estimate-cost.dto';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let configService: { get: jest.Mock };

  const mockTxClient = () => ({
    $queryRaw: jest.fn().mockResolvedValue([{ balance: '100.0000' }]),
    user: { update: jest.fn() },
    billingTransaction: {
      create: jest.fn().mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        type: TransactionType.AI_LLM,
        category: BillingCategory.AI,
        amount: '-5.0000',
        balanceAfter: '95.0000',
        description: 'test',
        articleId: null,
        aiOperationId: null,
        platformPublishId: null,
        quantity: null,
        unitPrice: null,
        status: TransactionStatus.COMPLETED,
        createdAt: new Date('2026-05-14T00:00:00.000Z'),
      }),
      findUnique: jest.fn(),
    },
  });

  beforeEach(async () => {
    prisma = createMockPrismaService();

    // Add billing-specific model mocks
    (prisma as any).billingConfig = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    (prisma as any).billingTransaction = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };
    (prisma as any).topUpRecord = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    };
    (prisma as any).balanceAlert = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    };

    prisma.$transaction = jest.fn().mockImplementation((fn) => {
      const tx = mockTxClient();
      return fn(tx);
    });

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'BILLING_ENABLED') return 'true';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Helper factories ───

  const mockTransaction = (override?: Record<string, unknown>) => ({
    id: 'tx-1',
    userId: 'user-1',
    type: TransactionType.AI_LLM,
    category: BillingCategory.AI,
    amount: '-5.0000',
    balanceAfter: '95.0000',
    description: 'AI call',
    articleId: null,
    aiOperationId: null,
    platformPublishId: null,
    quantity: null,
    unitPrice: null,
    status: TransactionStatus.COMPLETED,
    createdAt: new Date('2026-05-14T00:00:00.000Z'),
    ...override,
  });

  const mockConfig = (override?: Record<string, unknown>) => ({
    id: 'cfg-1',
    category: 'AI',
    itemKey: 'ai_llm_per_1k_tokens',
    itemName: 'AI LLM per 1K tokens',
    unitPrice: '0.0200',
    unit: '1K tokens',
    isActive: true,
    ...override,
  });

  // ─── getBalance ───

  describe('getBalance', () => {
    it('should return correct balance for existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ balance: '150.5000' });
      (prisma as any).balanceAlert.findUnique.mockResolvedValue(null);
      (prisma as any).billingTransaction.findMany.mockResolvedValue([]);

      const result = await service.getBalance('user-1');

      expect(result.balance).toBe(150.5);
      expect(result.alertThreshold).toBeNull();
      expect(result.recentTransactions).toEqual([]);
    });

    it('should include alert threshold when configured', async () => {
      prisma.user.findUnique.mockResolvedValue({ balance: '100.0000' });
      (prisma as any).balanceAlert.findUnique.mockResolvedValue({
        userId: 'user-1',
        thresholdAmount: '50.0000',
        isEnabled: true,
      });
      (prisma as any).billingTransaction.findMany.mockResolvedValue([]);

      const result = await service.getBalance('user-1');

      expect(result.alertThreshold).toBe(50);
    });

    it('should include recent 5 transactions', async () => {
      prisma.user.findUnique.mockResolvedValue({ balance: '100.0000' });
      (prisma as any).balanceAlert.findUnique.mockResolvedValue(null);
      const txs = Array.from({ length: 5 }, (_, i) =>
        mockTransaction({ id: `tx-${i}` }),
      );
      (prisma as any).billingTransaction.findMany.mockResolvedValue(txs);

      const result = await service.getBalance('user-1');

      expect(result.recentTransactions).toHaveLength(5);
      expect((prisma as any).billingTransaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getBalance('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── checkBalance ───

  describe('checkBalance', () => {
    it('should return true when balance is sufficient', async () => {
      prisma.user.findUnique.mockResolvedValue({ balance: '100.0000' });

      const result = await service.checkBalance('user-1', 50);

      expect(result).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      prisma.user.findUnique.mockResolvedValue({ balance: '30.0000' });

      const result = await service.checkBalance('user-1', 50);

      expect(result).toBe(false);
    });

    it('should return true when billing is disabled', async () => {
      // Create a separate service instance with billing disabled
      configService.get.mockReturnValue('false');
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BillingService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();
      const disabledService = module.get<BillingService>(BillingService);

      const result = await disabledService.checkBalance('user-1', 999999);

      expect(result).toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── deduct ───

  describe('deduct', () => {
    const deductParams = {
      userId: 'user-1',
      type: TransactionType.AI_LLM,
      category: BillingCategory.AI,
      amount: 5,
      description: 'AI LLM call',
    };

    it('should successfully deduct amount and create transaction', async () => {
      const tx = mockTxClient();
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      const result = await service.deduct(deductParams);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { balance: 95 },
      });
      expect(tx.billingTransaction.create).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBe('tx-1');
    });

    it('should update balance correctly', async () => {
      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '50.0000' }]);
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await service.deduct({ ...deductParams, amount: 20 });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { balance: 30 },
      });
    });

    it('should throw InsufficientBalanceException when balance too low', async () => {
      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '3.0000' }]);
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await expect(service.deduct(deductParams)).rejects.toThrow(
        InsufficientBalanceException,
      );
    });

    it('should return null when billing is disabled', async () => {
      configService.get.mockReturnValue('false');
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BillingService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();
      const disabledService = module.get<BillingService>(BillingService);

      const result = await disabledService.deduct(deductParams);

      expect(result).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should return null when amount is 0 or negative', async () => {
      const result1 = await service.deduct({ ...deductParams, amount: 0 });
      expect(result1).toBeNull();

      const result2 = await service.deduct({ ...deductParams, amount: -5 });
      expect(result2).toBeNull();

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should handle idempotency key (return existing transaction)', async () => {
      const existingTx = mockTransaction({ idempotencyKey: 'idem-1' });
      (prisma as any).billingTransaction.findUnique.mockResolvedValue(
        existingTx,
      );

      const result = await service.deduct({
        ...deductParams,
        idempotencyKey: 'idem-1',
      });

      expect(result.id).toBe('tx-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should record correct transaction fields', async () => {
      const tx = mockTxClient();
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await service.deduct({
        ...deductParams,
        articleId: 'art-1',
        aiOperationId: 'ai-op-1',
        quantity: 1,
        unitPrice: 5,
        idempotencyKey: 'idem-key',
        metadata: { model: 'gpt-4' },
      });

      const createCall = tx.billingTransaction.create.mock.calls[0][0];
      expect(createCall.data.amount).toBe(-5);
      expect(createCall.data.type).toBe(TransactionType.AI_LLM);
      expect(createCall.data.category).toBe(BillingCategory.AI);
      expect(createCall.data.balanceAfter).toBe(95);
      expect(createCall.data.idempotencyKey).toBe('idem-key');
      expect(createCall.data.articleId).toBe('art-1');
      expect(createCall.data.aiOperationId).toBe('ai-op-1');
      expect(createCall.data.quantity).toBe(1);
      expect(createCall.data.unitPrice).toBe(5);
      expect(createCall.data.metadata).toBe(JSON.stringify({ model: 'gpt-4' }));
      expect(createCall.data.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  // ─── credit ───

  describe('credit', () => {
    const creditParams = {
      userId: 'user-1',
      amount: 50,
      type: TransactionType.TOP_UP,
      description: 'Top-up credits',
    };

    it('should successfully credit amount and create transaction', async () => {
      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '100.0000' }]);
      tx.billingTransaction.create.mockResolvedValue(
        mockTransaction({
          amount: '50.0000',
          balanceAfter: '150.0000',
          type: TransactionType.TOP_UP,
        }),
      );
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      const result = await service.credit(creditParams);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { balance: 150 },
      });
      expect(result).toBeDefined();
    });

    it('should update balance correctly', async () => {
      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '200.0000' }]);
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await service.credit(creditParams);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { balance: 250 },
      });
    });

    it('should throw BadRequestException for non-positive amount', async () => {
      await expect(
        service.credit({ ...creditParams, amount: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.credit({ ...creditParams, amount: -10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle idempotency key (return existing transaction)', async () => {
      const existingTx = mockTransaction({ idempotencyKey: 'credit-idem-1' });
      (prisma as any).billingTransaction.findUnique.mockResolvedValue(
        existingTx,
      );

      const result = await service.credit({
        ...creditParams,
        idempotencyKey: 'credit-idem-1',
      });

      expect(result.id).toBe('tx-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should record correct transaction fields (amount is positive)', async () => {
      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '100.0000' }]);
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await service.credit({
        ...creditParams,
        topUpRecordId: 'topup-1',
        idempotencyKey: 'credit-key',
      });

      const createCall = tx.billingTransaction.create.mock.calls[0][0];
      expect(createCall.data.amount).toBe(50);
      expect(createCall.data.type).toBe(TransactionType.TOP_UP);
      expect(createCall.data.category).toBe(BillingCategory.OTHER);
      expect(createCall.data.balanceAfter).toBe(150);
      expect(createCall.data.topUpRecordId).toBe('topup-1');
      expect(createCall.data.idempotencyKey).toBe('credit-key');
      expect(createCall.data.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  // ─── manualTopUp ───

  describe('manualTopUp', () => {
    const dto = {
      targetUserId: 'target-user',
      amount: 100,
      reason: 'Monthly allocation',
    };

    it('should create TopUpRecord and credit balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      (prisma as any).topUpRecord.create.mockResolvedValue({
        id: 'topup-1',
        userId: 'target-user',
        amount: '100.0000',
        creditsAdded: '100.0000',
        bonusCredits: '0.0000',
        paymentMethod: PaymentMethod.MANUAL,
        status: TransactionStatus.COMPLETED,
        paidAt: new Date(),
        createdAt: new Date(),
      });
      (prisma as any).billingTransaction.update.mockResolvedValue({});

      // Mock $transaction for the inner credit() call
      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '0.0000' }]);
      tx.billingTransaction.create.mockResolvedValue(
        mockTransaction({
          id: 'tx-topup',
          amount: '100.0000',
          balanceAfter: '100.0000',
          type: TransactionType.TOP_UP,
        }),
      );
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      const result = await service.manualTopUp('admin-1', dto);

      expect((prisma as any).topUpRecord.create).toHaveBeenCalled();
      expect(result.topUpRecord.id).toBe('topup-1');
      expect(result.topUpRecord.amount).toBe(100);
      expect(result.transaction).toBeDefined();
    });

    it('should throw ForbiddenException for non-admin users', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.REPORTER });

      await expect(service.manualTopUp('reporter-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should link TopUpRecord to BillingTransaction', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      (prisma as any).topUpRecord.create.mockResolvedValue({
        id: 'topup-link',
        userId: 'target-user',
        amount: '100.0000',
        creditsAdded: '100.0000',
        bonusCredits: '0.0000',
        paymentMethod: PaymentMethod.MANUAL,
        status: TransactionStatus.COMPLETED,
        paidAt: new Date(),
        createdAt: new Date(),
      });
      (prisma as any).billingTransaction.update.mockResolvedValue({});

      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '0.0000' }]);
      tx.billingTransaction.create.mockResolvedValue(
        mockTransaction({ id: 'tx-linked' }),
      );
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await service.manualTopUp('admin-1', dto);

      expect((prisma as any).billingTransaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-linked' },
        data: { topUpRecordId: 'topup-link' },
      });
    });
  });

  // ─── getAllConfigs / getConfig / updateConfig ───

  describe('getAllConfigs', () => {
    it('should return all configs ordered', async () => {
      (prisma as any).billingConfig.findMany.mockResolvedValue([
        mockConfig(),
        mockConfig({
          id: 'cfg-2',
          itemKey: 'ai_image_per_piece',
          unitPrice: '0.5000',
        }),
      ]);

      const result = await service.getAllConfigs();

      expect(result).toHaveLength(2);
      expect(result[0].unitPrice).toBe(0.02);
      expect(result[1].unitPrice).toBe(0.5);
      expect((prisma as any).billingConfig.findMany).toHaveBeenCalledWith({
        orderBy: [{ category: 'asc' }, { itemKey: 'asc' }],
      });
    });
  });

  describe('getConfig', () => {
    it('should return single config by itemKey', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(mockConfig());

      const result = await service.getConfig('ai_llm_per_1k_tokens');

      expect(result.itemKey).toBe('ai_llm_per_1k_tokens');
      expect(result.unitPrice).toBe(0.02);
    });

    it('should throw NotFoundException for non-existent config', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(null);

      await expect(service.getConfig('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateConfig', () => {
    it('should change the unitPrice', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(mockConfig());
      (prisma as any).billingConfig.update.mockResolvedValue(
        mockConfig({ unitPrice: '0.0500' }),
      );

      const result = await service.updateConfig(
        'admin-1',
        'ai_llm_per_1k_tokens',
        {
          unitPrice: 0.05,
        },
      );

      expect(result.unitPrice).toBe(0.05);
      expect((prisma as any).billingConfig.update).toHaveBeenCalledWith({
        where: { id: 'cfg-1' },
        data: {
          unitPrice: 0.05,
          itemName: undefined,
          isActive: undefined,
          updatedBy: 'admin-1',
        },
      });
    });

    it('should throw NotFoundException when updating non-existent config', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.updateConfig('admin-1', 'nonexistent', { unitPrice: 0.05 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── estimateCost ───

  describe('estimateCost', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ balance: '100.0000' });
    });

    it('should estimate AI_LLM with default tokens', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(
        mockConfig({ unitPrice: '0.0200' }),
      );

      const result = await service.estimateCost('user-1', {
        operationType: EstimateOperationType.AI_LLM,
      });

      // Default 2000 tokens → ceil(2000/1000) = 2 units × 0.02 = 0.04
      expect(result.estimatedCost).toBeCloseTo(0.04);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].item).toBe('AI LLM 调用');
      expect(result.currentBalance).toBe(100);
    });

    it('should estimate AI_LLM with custom tokens', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(
        mockConfig({ unitPrice: '0.0200' }),
      );

      const result = await service.estimateCost('user-1', {
        operationType: EstimateOperationType.AI_LLM,
        estimatedTokens: 5000,
      });

      // 5000 tokens → ceil(5000/1000) = 5 units × 0.02 = 0.10
      expect(result.estimatedCost).toBeCloseTo(0.1);
    });

    it('should estimate AI_IMAGE', async () => {
      (prisma as any).billingConfig.findFirst.mockResolvedValue(
        mockConfig({ itemKey: 'ai_image_per_piece', unitPrice: '0.5000' }),
      );

      const result = await service.estimateCost('user-1', {
        operationType: EstimateOperationType.AI_IMAGE,
      });

      expect(result.estimatedCost).toBeCloseTo(0.5);
      expect(result.breakdown[0].item).toBe('AI 图片生成');
    });

    it('should estimate PUBLISH with multiple platforms', async () => {
      (prisma as any).billingConfig.findFirst
        .mockResolvedValueOnce(
          mockConfig({ itemKey: 'publish_facebook', unitPrice: '0.1000' }),
        )
        .mockResolvedValueOnce(
          mockConfig({ itemKey: 'publish_instagram', unitPrice: '0.1500' }),
        );

      const result = await service.estimateCost('user-1', {
        operationType: EstimateOperationType.PUBLISH,
        platforms: ['FACEBOOK', 'INSTAGRAM'],
      });

      expect(result.estimatedCost).toBeCloseTo(0.25);
      expect(result.breakdown).toHaveLength(2);
    });

    it('should estimate AUTO_PUBLISH with batch', async () => {
      (prisma as any).billingConfig.findFirst
        .mockResolvedValueOnce(
          mockConfig({ itemKey: 'ai_llm_per_1k_tokens', unitPrice: '0.0200' }),
        )
        .mockResolvedValueOnce(
          mockConfig({ itemKey: 'publish_website', unitPrice: '0.0000' }),
        )
        .mockResolvedValueOnce(
          mockConfig({
            itemKey: 'auto_publish_surcharge',
            unitPrice: '0.0500',
          }),
        );

      const result = await service.estimateCost('user-1', {
        operationType: EstimateOperationType.AUTO_PUBLISH,
        batchSize: 3,
      });

      // AI cost: ceil(3000/1000) * 0.02 = 0.06 per article × 3 = 0.18
      // Publish: 0 × 3 = 0
      // Surcharge: 0.05
      // Total: 0.23
      expect(result.estimatedCost).toBeCloseTo(0.23);
      expect(result.breakdown).toHaveLength(3);
    });

    it('should return sufficientBalance correctly based on current balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ balance: '0.0100' });
      (prisma as any).billingConfig.findFirst.mockResolvedValue(
        mockConfig({ unitPrice: '0.5000' }),
      );

      const result = await service.estimateCost('user-1', {
        operationType: EstimateOperationType.AI_IMAGE,
      });

      expect(result.sufficientBalance).toBe(false);
      expect(result.currentBalance).toBe(0.01);
    });
  });

  // ─── getTransactions ───

  describe('getTransactions', () => {
    it('should return paginated results', async () => {
      (prisma as any).billingTransaction.findMany
        .mockResolvedValueOnce([mockTransaction()]) // paged data
        .mockResolvedValueOnce([mockTransaction()]); // summary query
      (prisma as any).billingTransaction.count.mockResolvedValue(25);

      const result = await service.getTransactions('user-1', {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
      expect(result.meta.total).toBe(25);
    });

    it('should filter by type', async () => {
      (prisma as any).billingTransaction.findMany.mockResolvedValue([]);
      (prisma as any).billingTransaction.count.mockResolvedValue(0);

      await service.getTransactions('user-1', {
        type: TransactionType.AI_LLM,
      });

      const findManyCall = (prisma as any).billingTransaction.findMany.mock
        .calls[0][0];
      expect(findManyCall.where.type).toBe(TransactionType.AI_LLM);
    });

    it('should filter by date range', async () => {
      (prisma as any).billingTransaction.findMany.mockResolvedValue([]);
      (prisma as any).billingTransaction.count.mockResolvedValue(0);

      await service.getTransactions('user-1', {
        startDate: '2026-01-01',
        endDate: '2026-05-01',
      });

      const findManyCall = (prisma as any).billingTransaction.findMany.mock
        .calls[0][0];
      expect(findManyCall.where.createdAt.gte).toEqual(new Date('2026-01-01'));
      expect(findManyCall.where.createdAt.lte).toEqual(new Date('2026-05-01'));
    });

    it('should include summary (totalSpent, byType, byCategory)', async () => {
      const summaryTxs = [
        mockTransaction({
          amount: '-5.0000',
          type: TransactionType.AI_LLM,
          category: BillingCategory.AI,
        }),
        mockTransaction({
          amount: '-3.0000',
          type: TransactionType.PUBLISH,
          category: BillingCategory.PUBLISHING,
        }),
        mockTransaction({
          amount: '10.0000',
          type: TransactionType.TOP_UP,
          category: BillingCategory.OTHER,
        }),
      ];
      (prisma as any).billingTransaction.findMany
        .mockResolvedValueOnce([mockTransaction()]) // paged data
        .mockResolvedValueOnce(summaryTxs); // summary query
      (prisma as any).billingTransaction.count.mockResolvedValue(3);

      const result = await service.getTransactions('user-1', {});

      // Only negative amounts count toward totalSpent
      expect(result.summary.totalSpent).toBeCloseTo(8);
      expect(result.summary.byType[TransactionType.AI_LLM]).toBeCloseTo(5);
      expect(result.summary.byType[TransactionType.PUBLISH]).toBeCloseTo(3);
      expect(result.summary.byCategory[BillingCategory.AI]).toBeCloseTo(5);
      expect(result.summary.byCategory[BillingCategory.PUBLISHING]).toBeCloseTo(
        3,
      );
    });
  });

  // ─── refund ───

  describe('refund', () => {
    const refundDto = {
      originalTransactionId: 'orig-tx-1',
      reason: 'Overcharge correction',
    };

    it('should create refund transaction and credit balance', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ role: UserRole.ADMIN }) // admin check
        .mockResolvedValueOnce({ balance: '100.0000' }); // inside credit's $transaction
      // First call: find original by id; second call: idempotency check in credit() → null (no existing)
      (prisma as any).billingTransaction.findUnique
        .mockResolvedValueOnce(
          mockTransaction({
            id: 'orig-tx-1',
            userId: 'user-1',
            amount: '-10.0000',
            status: TransactionStatus.COMPLETED,
            description: 'Original charge',
          }),
        )
        .mockResolvedValueOnce(null); // credit idempotency check: no existing
      (prisma as any).billingTransaction.update.mockResolvedValue({});

      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '100.0000' }]);
      tx.billingTransaction.create.mockResolvedValue(
        mockTransaction({
          id: 'refund-tx-1',
          type: TransactionType.REFUND,
          amount: '10.0000',
        }),
      );
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      const result = await service.refund('admin-1', refundDto);

      expect(result.id).toBe('refund-tx-1');
      expect(tx.billingTransaction.create).toHaveBeenCalled();
    });

    it('should mark original transaction as REFUNDED', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ role: UserRole.ADMIN });
      (prisma as any).billingTransaction.findUnique
        .mockResolvedValueOnce(
          mockTransaction({
            id: 'orig-tx-1',
            userId: 'user-1',
            amount: '-10.0000',
            status: TransactionStatus.COMPLETED,
            description: 'Original',
          }),
        )
        .mockResolvedValueOnce(null); // credit idempotency check
      (prisma as any).billingTransaction.update.mockResolvedValue({});

      const tx = mockTxClient();
      tx.$queryRaw.mockResolvedValue([{ balance: '100.0000' }]);
      tx.billingTransaction.create.mockResolvedValue(
        mockTransaction({ id: 'refund-tx-2', type: TransactionType.REFUND }),
      );
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));

      await service.refund('admin-1', refundDto);

      expect((prisma as any).billingTransaction.update).toHaveBeenCalledWith({
        where: { id: 'orig-tx-1' },
        data: { status: TransactionStatus.REFUNDED },
      });
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.REPORTER });

      await expect(service.refund('reporter-1', refundDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException for non-existent original transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      (prisma as any).billingTransaction.findUnique.mockResolvedValue(null);

      await expect(service.refund('admin-1', refundDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for already-refunded transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      (prisma as any).billingTransaction.findUnique.mockResolvedValue(
        mockTransaction({
          id: 'orig-tx-1',
          status: TransactionStatus.REFUNDED,
        }),
      );

      await expect(service.refund('admin-1', refundDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when refund amount exceeds original', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      (prisma as any).billingTransaction.findUnique.mockResolvedValue(
        mockTransaction({
          id: 'orig-tx-1',
          amount: '-5.0000',
          status: TransactionStatus.COMPLETED,
        }),
      );

      await expect(
        service.refund('admin-1', { ...refundDto, refundAmount: 10 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── checkAndAlertBalance ───

  describe('checkAndAlertBalance', () => {
    it('should trigger alert when balance below threshold', async () => {
      (prisma as any).balanceAlert.findUnique.mockResolvedValue({
        userId: 'user-1',
        thresholdAmount: '50.0000',
        isEnabled: true,
        lastTriggeredAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({ balance: '30.0000' });
      (prisma as any).balanceAlert.update.mockResolvedValue({});

      await service.checkAndAlertBalance('user-1');

      expect((prisma as any).balanceAlert.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { lastTriggeredAt: expect.any(Date) },
      });
    });

    it('should not trigger if alert is disabled', async () => {
      (prisma as any).balanceAlert.findUnique.mockResolvedValue({
        userId: 'user-1',
        thresholdAmount: '50.0000',
        isEnabled: false,
        lastTriggeredAt: null,
      });

      await service.checkAndAlertBalance('user-1');

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect((prisma as any).balanceAlert.update).not.toHaveBeenCalled();
    });

    it('should not trigger if already triggered within 24 hours', async () => {
      (prisma as any).balanceAlert.findUnique.mockResolvedValue({
        userId: 'user-1',
        thresholdAmount: '50.0000',
        isEnabled: true,
        lastTriggeredAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      });
      prisma.user.findUnique.mockResolvedValue({ balance: '30.0000' });

      await service.checkAndAlertBalance('user-1');

      expect((prisma as any).balanceAlert.update).not.toHaveBeenCalled();
    });

    it('should update lastTriggeredAt', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      (prisma as any).balanceAlert.findUnique.mockResolvedValue({
        userId: 'user-1',
        thresholdAmount: '50.0000',
        isEnabled: true,
        lastTriggeredAt: oldDate,
      });
      prisma.user.findUnique.mockResolvedValue({ balance: '10.0000' });
      (prisma as any).balanceAlert.update.mockResolvedValue({});

      await service.checkAndAlertBalance('user-1');

      expect((prisma as any).balanceAlert.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { lastTriggeredAt: expect.any(Date) },
      });
    });
  });

  // ─── getReport ───

  describe('getReport', () => {
    it('should return correct totals for revenue, consumption, net change', async () => {
      const transactions = [
        {
          type: TransactionType.AI_LLM,
          category: BillingCategory.AI,
          amount: '-5.0000',
          userId: 'u1',
          createdAt: new Date(),
        },
        {
          type: TransactionType.PUBLISH,
          category: BillingCategory.PUBLISHING,
          amount: '-3.0000',
          userId: 'u1',
          createdAt: new Date(),
        },
        {
          type: TransactionType.TOP_UP,
          category: BillingCategory.OTHER,
          amount: '10.0000',
          userId: 'u1',
          createdAt: new Date(),
        },
      ];
      (prisma as any).billingTransaction.findMany.mockResolvedValue(
        transactions,
      );
      (prisma as any).topUpRecord.findMany.mockResolvedValue([
        { amount: '200.0000', createdAt: new Date() },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        name: 'User One',
        email: 'u1@test.com',
      });

      const result = await service.getReport('2026-01-01', '2026-12-31');

      expect(result.totalRevenue).toBe(200);
      expect(result.totalConsumption).toBeCloseTo(8);
      expect(result.netChange).toBeCloseTo(192);
    });

    it('should return top users by consumption', async () => {
      const transactions = [
        {
          type: TransactionType.AI_LLM,
          category: BillingCategory.AI,
          amount: '-50.0000',
          userId: 'u1',
          createdAt: new Date(),
        },
        {
          type: TransactionType.AI_LLM,
          category: BillingCategory.AI,
          amount: '-30.0000',
          userId: 'u2',
          createdAt: new Date(),
        },
      ];
      (prisma as any).billingTransaction.findMany.mockResolvedValue(
        transactions,
      );
      (prisma as any).topUpRecord.findMany.mockResolvedValue([]);
      prisma.user.findUnique
        .mockResolvedValueOnce({ name: 'Alice', email: 'alice@test.com' })
        .mockResolvedValueOnce({ name: 'Bob', email: 'bob@test.com' });

      const result = await service.getReport('2026-01-01', '2026-12-31');

      expect(result.topUsers).toHaveLength(2);
      expect(result.topUsers[0].userId).toBe('u1');
      expect(result.topUsers[0].totalSpent).toBeCloseTo(50);
      expect(result.topUsers[0].userName).toBe('Alice');
      expect(result.topUsers[1].userId).toBe('u2');
      expect(result.topUsers[1].totalSpent).toBeCloseTo(30);
    });

    it('should return category breakdown', async () => {
      const transactions = [
        {
          type: TransactionType.AI_LLM,
          category: BillingCategory.AI,
          amount: '-10.0000',
          userId: 'u1',
          createdAt: new Date(),
        },
        {
          type: TransactionType.PUBLISH,
          category: BillingCategory.PUBLISHING,
          amount: '-5.0000',
          userId: 'u1',
          createdAt: new Date(),
        },
      ];
      (prisma as any).billingTransaction.findMany.mockResolvedValue(
        transactions,
      );
      (prisma as any).topUpRecord.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({
        name: 'User',
        email: 'u@t.com',
      });

      const result = await service.getReport('2026-01-01', '2026-12-31');

      expect(result.byCategory[BillingCategory.AI]).toBeCloseTo(10);
      expect(result.byCategory[BillingCategory.PUBLISHING]).toBeCloseTo(5);
    });
  });

  // ─── isEnabled ───

  describe('isEnabled', () => {
    it('should return true when billing is enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });
});
