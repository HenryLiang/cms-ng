import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionStatus } from '@cms-ng/shared';
import { WechatPayService } from './wechat-pay.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing.service';

// fs.readFileSync is non-configurable on modern Node — mock the module
// instead of spying (only the private-key load path is replaced).
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(() => Buffer.from('fake-key')),
}));

// Mock the SDK so we control verifySign / decipher_gcm without real certs.
const mockVerifySign = jest.fn();
const mockDecipherGcm = jest.fn();
jest.mock('wechatpay-node-v3', () =>
  jest.fn().mockImplementation(() => ({
    verifySign: mockVerifySign,
    decipher_gcm: mockDecipherGcm,
    transactions_native: jest.fn(),
  })),
);

describe('WechatPayService — handleNotification (issue #106)', () => {
  let prisma: {
    topUpRecord: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let billingService: { credit: jest.Mock };

  const makeConfig = () =>
    ({
      get: (key: string) =>
        ({
          WECHAT_PAY_APP_ID: 'wx-app-id',
          WECHAT_PAY_MCH_ID: 'mch-123',
          WECHAT_PAY_API_V3_KEY: 'api-v3-key-32-bytes-padding-0000',
          WECHAT_PAY_SERIAL_NO: 'serial-1',
          WECHAT_PAY_PRIVATE_KEY_PATH: '/fake/key.pem',
        })[key],
    }) as unknown as ConfigService;

  const makeService = () =>
    new WechatPayService(
      makeConfig(),
      prisma as unknown as PrismaService,
      billingService as unknown as BillingService,
    );

  const sigHeaders = {
    'wechatpay-timestamp': '1720000000',
    'wechatpay-nonce': 'nonce-abc',
    'wechatpay-signature': 'sig-abc',
    'wechatpay-serial': 'serial-1',
  };

  const notifyBody = JSON.stringify({
    resource: {
      ciphertext: 'cipher',
      associated_data: 'ad',
      nonce: 'nonce',
    },
  });

  const pendingRecord = {
    id: 'order-123',
    userId: 'user-1',
    amount: 100, // ¥100 → 10000 cents
    creditsAdded: 100,
    status: TransactionStatus.PENDING,
  };

  const decryptedSuccess = {
    out_trade_no: 'order-123',
    trade_state: 'SUCCESS',
    transaction_id: 'wx-txn-456',
    mchid: 'mch-123',
    appid: 'wx-app-id',
    amount: { total: 10000, payer_total: 10000, currency: 'CNY' },
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
    mockVerifySign.mockReset().mockResolvedValue(true);
    mockDecipherGcm.mockReset().mockReturnValue(decryptedSuccess);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('fails closed when signature headers are missing (was fail-open)', async () => {
    const service = makeService();

    const result = await service.handleNotification({}, notifyBody);

    expect(result.code).toBe('FAIL');
    expect(mockVerifySign).not.toHaveBeenCalled();
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects when signature verification fails', async () => {
    mockVerifySign.mockResolvedValue(false);
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('FAIL');
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects when the paid amount does not match the recorded order', async () => {
    mockDecipherGcm.mockReturnValue({
      ...decryptedSuccess,
      amount: { total: 1 }, // attacker pays 1 cent for a ¥100 order
    });
    prisma.topUpRecord.findUnique.mockResolvedValue(pendingRecord);
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('FAIL');
    expect(prisma.topUpRecord.update).not.toHaveBeenCalled();
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects when the decrypted notification carries no amount', async () => {
    mockDecipherGcm.mockReturnValue({
      out_trade_no: 'order-123',
      trade_state: 'SUCCESS',
      transaction_id: 'wx-txn-456',
      mchid: 'mch-123',
    });
    prisma.topUpRecord.findUnique.mockResolvedValue(pendingRecord);
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('FAIL');
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('rejects a signature-valid notification bound to a different mchid', async () => {
    // WeChat platform certs are shared across merchants — a validly-signed
    // notification for ANOTHER merchant must never touch our ledger.
    mockDecipherGcm.mockReturnValue({
      ...decryptedSuccess,
      mchid: 'another-merchants-mchid',
    });
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('FAIL');
    expect(result.message).toBe('Merchant mismatch');
    expect(prisma.topUpRecord.findUnique).not.toHaveBeenCalled();
    expect(billingService.credit).not.toHaveBeenCalled();
  });

  it('CLOSED only transitions PENDING orders (never overwrites COMPLETED)', async () => {
    mockDecipherGcm.mockReturnValue({
      out_trade_no: 'order-123',
      trade_state: 'CLOSED',
      transaction_id: 'wx-txn-456',
      mchid: 'mch-123',
    });
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('SUCCESS');
    expect(prisma.topUpRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-123', status: TransactionStatus.PENDING },
      data: { status: TransactionStatus.FAILED },
    });
    // No unconditional update — a replayed CLOSED cannot flip a COMPLETED
    // record back to FAILED.
    expect(prisma.topUpRecord.update).not.toHaveBeenCalled();
  });

  it('credits the balance on a fully valid SUCCESS notification', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue(pendingRecord);
    prisma.topUpRecord.update.mockResolvedValue({
      ...pendingRecord,
      status: TransactionStatus.COMPLETED,
    });
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('SUCCESS');
    expect(prisma.topUpRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          status: TransactionStatus.COMPLETED,
          externalOrderId: 'wx-txn-456',
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
    // credit must happen BEFORE the record is marked COMPLETED (see alipay
    // spec for the failure mode this prevents).
    expect(billingService.credit.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.topUpRecord.update.mock.invocationCallOrder[0],
    );
  });

  it('is idempotent: an already-COMPLETED record returns SUCCESS without crediting again', async () => {
    prisma.topUpRecord.findUnique.mockResolvedValue({
      ...pendingRecord,
      status: TransactionStatus.COMPLETED,
    });
    const service = makeService();

    const result = await service.handleNotification(sigHeaders, notifyBody);

    expect(result.code).toBe('SUCCESS');
    expect(billingService.credit).not.toHaveBeenCalled();
  });
});
