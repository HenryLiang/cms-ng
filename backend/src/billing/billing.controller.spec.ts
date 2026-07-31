import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { AlipayService } from './payment/alipay.service';
import { WechatPayService } from './payment/wechat-pay.service';

/**
 * Controller-layer coverage for the public payment callback chain (issue #111).
 *
 * The signature/idempotency/amount logic itself is unit-tested at the service
 * layer (alipay.service.spec.ts / wechat-pay.service.spec.ts, added with #106).
 * These specs guard the controller seam: that a forged or malformed request
 * reaches the right service with the right payload, and that the controller's
 * own fail-closed guards (unsupported method, missing raw body) reject before
 * the service is ever touched.
 */
describe('BillingController - payment chain (issue #111)', () => {
  let controller: BillingController;
  let billingService: { manualTopUp: jest.Mock };
  let alipayService: {
    createOrder: jest.Mock;
    handleNotification: jest.Mock;
  };
  let wechatPayService: {
    createOrder: jest.Mock;
    handleNotification: jest.Mock;
  };

  beforeEach(async () => {
    billingService = { manualTopUp: jest.fn() };
    alipayService = {
      createOrder: jest.fn(),
      handleNotification: jest.fn(),
    };
    wechatPayService = {
      createOrder: jest.fn(),
      handleNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: billingService },
        { provide: AlipayService, useValue: alipayService },
        { provide: WechatPayService, useValue: wechatPayService },
      ],
    }).compile();

    controller = module.get<BillingController>(BillingController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createTopUp dispatch ───

  describe('createTopUp', () => {
    it('dispatches an ALIPAY top-up to AlipayService.createOrder', async () => {
      alipayService.createOrder.mockResolvedValue({
        topUpRecordId: 'rec-1',
        paymentUrl: 'https://alipay/pay',
      });

      const result = await controller.createTopUp('user-1', {
        amount: 100,
        paymentMethod: 'ALIPAY',
      });

      expect(alipayService.createOrder).toHaveBeenCalledWith(
        'user-1',
        100,
        '充值 ¥100',
      );
      expect(wechatPayService.createOrder).not.toHaveBeenCalled();
      expect(result.topUpRecordId).toBe('rec-1');
    });

    it('dispatches a WECHAT_PAY top-up to WechatPayService.createOrder', async () => {
      wechatPayService.createOrder.mockResolvedValue({
        topUpRecordId: 'rec-2',
        qrCodeUrl: 'weixin://wxpay/bizpayurl?pr=abc',
      });

      const result = await controller.createTopUp('user-1', {
        amount: 50,
        paymentMethod: 'WECHAT_PAY',
      });

      expect(wechatPayService.createOrder).toHaveBeenCalledWith(
        'user-1',
        50,
        '充值 ¥50',
      );
      expect(alipayService.createOrder).not.toHaveBeenCalled();
      expect(result.qrCodeUrl).toBe('weixin://wxpay/bizpayurl?pr=abc');
    });

    it('rejects an unsupported payment method with BadRequestException', async () => {
      await expect(
        controller.createTopUp('user-1', {
          amount: 100,
          paymentMethod: 'BITCOIN',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(alipayService.createOrder).not.toHaveBeenCalled();
      expect(wechatPayService.createOrder).not.toHaveBeenCalled();
    });
  });

  // ─── Alipay notify ───

  describe('alipayNotify (public callback)', () => {
    it('forwards the body to AlipayService.handleNotification and returns its verdict', async () => {
      // A fail-closed verdict from the service (bad signature / missing config)
      // must propagate unchanged - the controller must not swallow it.
      alipayService.handleNotification.mockResolvedValue('failure');

      const body = {
        out_trade_no: 'order-123',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00',
      };

      const result = await controller.alipayNotify(body);

      expect(alipayService.handleNotification).toHaveBeenCalledWith(body);
      expect(result).toBe('failure');
    });

    it('propagates a success verdict on a valid notification', async () => {
      alipayService.handleNotification.mockResolvedValue('success');

      const result = await controller.alipayNotify({
        out_trade_no: 'order-123',
        trade_status: 'TRADE_SUCCESS',
      });

      expect(result).toBe('success');
    });
  });

  // ─── WeChat Pay notify ───

  describe('wechatNotify (public callback)', () => {
    const headers = {
      'wechatpay-timestamp': '1720000000',
      'wechatpay-nonce': 'nonce-abc',
      'wechatpay-signature': 'sig-abc',
      'wechatpay-serial': 'serial-1',
    };
    const rawJson = JSON.stringify({
      resource: { ciphertext: 'cipher', associated_data: 'ad', nonce: 'n' },
    });

    it('forwards the RAW body (not a parsed object) to WechatPayService.handleNotification', async () => {
      // Signature verification must run over the raw body - forwarding a
      // parsed/re-stringified object would invalidate the signature.
      wechatPayService.handleNotification.mockResolvedValue({
        code: 'SUCCESS',
        message: 'OK',
      });

      const req = { rawBody: Buffer.from(rawJson) };

      const result = await controller.wechatNotify(headers, req as never);

      expect(wechatPayService.handleNotification).toHaveBeenCalledWith(
        headers,
        rawJson,
      );
      expect(result).toEqual({ code: 'SUCCESS', message: 'OK' });
    });

    it('rejects with FAIL when the raw body is missing (controller-level guard)', async () => {
      // No rawBody -> cannot verify signature -> must reject before the service.
      const req = { rawBody: undefined };

      const result = await controller.wechatNotify(headers, req as never);

      expect(result).toEqual({ code: 'FAIL', message: 'Missing raw body' });
      expect(wechatPayService.handleNotification).not.toHaveBeenCalled();
    });

    it('rejects with FAIL when the raw body is an empty buffer', async () => {
      const req = { rawBody: Buffer.from('') };

      const result = await controller.wechatNotify(headers, req as never);

      expect(result).toEqual({ code: 'FAIL', message: 'Missing raw body' });
      expect(wechatPayService.handleNotification).not.toHaveBeenCalled();
    });

    it('propagates a FAIL verdict from the service (bad signature / amount mismatch)', async () => {
      wechatPayService.handleNotification.mockResolvedValue({
        code: 'FAIL',
        message: 'Invalid signature',
      });

      const req = { rawBody: Buffer.from(rawJson) };

      const result = await controller.wechatNotify(headers, req as never);

      expect(result).toEqual({ code: 'FAIL', message: 'Invalid signature' });
    });
  });
});
