import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionStatus } from '@cms-ng/shared';
import { AlipayService } from './alipay.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing.service';

// Mock the SDK class so we control checkNotifySign without real RSA keys.
const mockCheckNotifySign = jest.fn();
jest.mock('alipay-sdk', () => ({
  AlipaySdk: jest.fn().mockImplementation(() => ({
    checkNotifySign: mockCheckNotifySign,
    pageExecute: jest.fn(),
  })),
}));

describe('AlipayService — handleNotification (issue #106)', () => {
  const APP_ID = '2021000123456789';

  let prisma: {
    topUpRecord: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let billingService: { credit: jest.Mock };

  const makeConfig = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      ALIPAY_APP_ID: APP_ID,
      ALIPAY_PRIVATE_KEY: 'fake-private-key',
      ALIPAY_PUBLIC_KEY: 'fake-public-key',
      ...overrides,
    };
    return {
      get: (key: string) => values[key],
    } as unknown as ConfigService;
  };

  const makeService = (config: ConfigService) =>
    new AlipayService(
      config,
      prisma as unknown as PrismaService,
      billingService as unknown as BillingService,
    );

  const pendingRecord = {
    id: 'order-123',
    userId: 'user-1',
    amount: 100,
    creditsAdded: 100,
    status: TransactionStatus.PENDING,
  };

  const validNotify = {
    out_trade_no: 'order-123',
    trade_status: 'TRADE_SUCCESS',
    trade_no: 'alipay-trade-456',
    app_id: APP_ID,
    total_amount: '100.00',
  };

  beforeEach(() => {
    prisma = {
      topUpRecord: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    billingService = { credit: jest.fn() };
    mockCheckNotifySign.mockReset().mockReturnValue(true);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('fails closed when SDK/public key is not configured (was fail-open)', async () => {
    const service = makeService(
      makeConfig({ ALIPAY_PRIVATE_KEY: '', ALIPAY_PUBLIC_KEY: '' }),
    );

    const result = await service.handleNotification(validNotify);

    expect(result).toBe('failure');
    expect(prisma.topUpRecord.findUnique).not.toHaveBeenCalled();
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects when signature verification fails', async () => {
    mockCheckNotifySign.mockReturnValue(false);
    const service = makeService(makeConfig());

    const result = await service.handleNotification(validNotify);

    expect(result).toBe('failure');
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects when signature check throws', async () => {
    mockCheckNotifySign.mockImplementation(() => {
      throw new Error('bad params');
    });
    const service = makeService(makeConfig());

    const result = await service.handleNotification(validNotify);

    expect(result).toBe('failure');
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects a signature-valid notification from a different app_id', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue(pendingRecord);
    const service = makeService(makeConfig());

    const result = await service.handleNotification({
      ...validNotify,
      app_id: 'another-merchants-app',
    });

    expect(result).toBe('failure');
    expect(prisma.topUpRecord.update).not.toHaveBeenCalled();
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects when notified amount differs from the recorded order amount', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue(pendingRecord);
    const service = makeService(makeConfig());

    const result = await service.handleNotification({
      ...validNotify,
      total_amount: '0.01', // attacker pays 1 cent for a ¥100 order
    });

    expect(result).toBe('failure');
    expect(prisma.topUpRecord.update).not.toHaveBeenCalled();
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('credits the balance on a fully valid TRADE_SUCCESS notification', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue(pendingRecord);
    prisma.topUpRecord.update.mockResolvedValue({
      ...pendingRecord,
      status: TransactionStatus.COMPLETED,
    });
    const service = makeService(makeConfig());

    const result = await service.handleNotification(validNotify);

    expect(result).toBe('success');
    expect(prisma.topUpRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          status: TransactionStatus.COMPLETED,
          externalOrderId: 'alipay-trade-456',
        }),
      }),
    );
    expect(billingService.credit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 100,
        topUpRecordId: 'order-123',
        idempotencyKey: 'topup:order-123',
      }),
    );
    // credit must happen BEFORE the record is marked COMPLETED — otherwise a
    // credit failure leaves a paid-but-never-credited order that all retries
    // skip as "already processed".
    expect(billingService.credit.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.topUpRecord.update.mock.invocationCallOrder[0],
    );
  });

  it('is idempotent: an already-COMPLETED record returns success without crediting again', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue({
      ...pendingRecord,
      status: TransactionStatus.COMPLETED,
    });
    const service = makeService(makeConfig());

    const result = await service.handleNotification(validNotify);

    expect(result).toBe('success');
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('returns fail when the order record does not exist', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue(null);
    const service = makeService(makeConfig());

    const result = await service.handleNotification(validNotify);

    expect(result).toBe('fail');
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  describe('TRADE_CLOSED guard (adversarial review, round 2)', () => {
    const closedNotify = { ...validNotify, trade_status: 'TRADE_CLOSED' };

    it('rejects a signature-valid TRADE_CLOSED from a different app_id', async () => {
      const service = makeService(makeConfig());

      const result = await service.handleNotification({
        ...closedNotify,
        app_id: 'another-merchants-app',
      });

      expect(result).toBe('failure');
      expect(prisma.topUpRecord.updateMany).not.toHaveBeenCalled();
    });

    it('only transitions PENDING orders (never overwrites COMPLETED)', async () => {
      const service = makeService(makeConfig());

      const result = await service.handleNotification(closedNotify);

      expect(result).toBe('success');
      expect(prisma.topUpRecord.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-123', status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.FAILED },
      });
      // No unconditional update — a replayed CLOSED cannot flip a COMPLETED
      // record back to FAILED.
      expect(prisma.topUpRecord.update).not.toHaveBeenCalled();
    });
  });

  describe('createOrder amount normalization', () => {
    it('rounds to 2 decimals so the record always matches what Alipay charges', async () => {
      // 10.999 would be charged as ¥11.00 (totalAmount.toFixed(2)); storing
      // the unrounded amount would make every notify mismatch (found by
      // adversarial review).
      prisma.topUpRecord.create.mockResolvedValue({
        id: 'order-round',
        userId: 'user-1',
        amount: 11,
        creditsAdded: 11,
        status: TransactionStatus.PENDING,
      });
      const service = makeService(makeConfig());

      const result = await service.createOrder('user-1', 10.999, '充值');

      expect(prisma.topUpRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 11, creditsAdded: 11 }),
        }),
      );
      expect(result.topUpRecordId).toBe('order-round');
    });
  });
});
