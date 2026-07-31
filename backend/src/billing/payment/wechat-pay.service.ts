import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing.service';
import {
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@cms-ng/shared';
import WxPay from 'wechatpay-node-v3';
import * as fs from 'fs';

/** 微信支付统一下单(native)响应 */
interface WeChatOrderResponse {
  status: number;
  data?: { code_url?: string };
  error?: unknown;
}

/** 微信支付回调通知体(含加密资源) */
interface WeChatNotification {
  resource?: {
    ciphertext?: string;
    associated_data?: string;
    nonce?: string;
  };
}

@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name);
  private readonly appId: string;
  private readonly mchId: string;
  private readonly apiV3Key: string;
  private readonly serialNo: string;
  private wxPay: WxPay | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private billingService: BillingService,
  ) {
    this.appId = this.config.get<string>('WECHAT_PAY_APP_ID') || '';
    this.mchId = this.config.get<string>('WECHAT_PAY_MCH_ID') || '';
    this.apiV3Key = this.config.get<string>('WECHAT_PAY_API_V3_KEY') || '';
    this.serialNo = this.config.get<string>('WECHAT_PAY_SERIAL_NO') || '';

    const privateKeyPath =
      this.config.get<string>('WECHAT_PAY_PRIVATE_KEY_PATH') || '';
    if (this.appId && this.mchId && privateKeyPath) {
      try {
        const privateKey = fs.readFileSync(privateKeyPath);
        this.wxPay = new WxPay({
          appid: this.appId,
          mchid: this.mchId,
          serial_no: this.serialNo,
          key: this.apiV3Key,
          privateKey,
          // publicKey is required by the constructor but not used for native pay
          // We use a dummy buffer; real platform cert is fetched via get_certificates
          publicKey: Buffer.from(''),
        });
      } catch (e) {
        this.logger.warn(`WeChat Pay init failed: ${e}`);
      }
    } else if (this.appId && this.mchId) {
      this.logger.warn(
        'WeChat Pay: WECHAT_PAY_PRIVATE_KEY_PATH not set, SDK not initialized',
      );
    }
  }

  private getNotifyUrl(): string {
    return this.config.get<string>('APP_BASE_URL') || 'http://localhost:3001';
  }

  /**
   * Create a native payment order and return the QR code URL.
   */
  async createOrder(
    userId: string,
    amount: number,
    description: string,
  ): Promise<{ topUpRecordId: string; qrCodeUrl: string }> {
    if (!this.wxPay) {
      throw new Error(
        'WeChat Pay not configured or initialization failed. Please check WECHAT_PAY_APP_ID, WECHAT_PAY_MCH_ID, and WECHAT_PAY_PRIVATE_KEY_PATH.',
      );
    }

    // Normalize to cents before persisting so the record matches what the
    // user is actually charged (WeChat bills Math.round(amount*100) cents).
    const orderAmount = Math.round(amount * 100) / 100;

    // Create TopUpRecord
    const record = await this.prisma.topUpRecord.create({
      data: {
        userId,
        amount: orderAmount,
        creditsAdded: orderAmount,
        bonusCredits: 0,
        paymentMethod: PaymentMethod.WECHAT_PAY,
        status: TransactionStatus.PENDING,
      },
    });

    let qrCodeUrl: string;
    try {
      const result = (await this.wxPay.transactions_native({
        description,
        out_trade_no: record.id,
        notify_url: `${this.getNotifyUrl()}/billing/payment/wechat/notify`,
        amount: {
          total: Math.round(orderAmount * 100), // WeChat uses cents (分)
          currency: 'CNY',
        },
      })) as WeChatOrderResponse;

      if (result.status !== 200 || !result.data?.code_url) {
        throw new Error(
          `WeChat Pay API error: status=${result.status}, error=${JSON.stringify(result.error)}`,
        );
      }
      qrCodeUrl = result.data.code_url;
    } catch (error) {
      this.logger.error(
        `WeChat Pay createOrder failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Mark record as failed so it doesn't stay in PENDING forever
      await this.prisma.topUpRecord.update({
        where: { id: record.id },
        data: { status: TransactionStatus.FAILED },
      });
      throw new Error(
        `Failed to create WeChat Pay order: ${(error as Error).message}`,
      );
    }

    this.logger.log(
      `WeChat Pay order created: record=${record.id}, amount=${amount}, description=${description}`,
    );

    return { topUpRecordId: record.id, qrCodeUrl };
  }

  /**
   * Handle WeChat Pay notification callback (API v3).
   * Returns response object per WeChat Pay spec.
   */
  async handleNotification(
    headers: Record<string, string>,
    body: string,
  ): Promise<{ code: string; message: string }> {
    if (!this.wxPay) {
      return { code: 'FAIL', message: 'WeChat Pay not initialized' };
    }

    try {
      const notification = JSON.parse(body) as WeChatNotification;
      const resource = notification.resource;

      // Verify signature using WeChat Pay platform certificate
      try {
        const timestamp = headers['wechatpay-timestamp'];
        const nonce = headers['wechatpay-nonce'];
        const signature = headers['wechatpay-signature'];
        const serial = headers['wechatpay-serial'];

        if (timestamp && nonce && signature && serial) {
          const isValid = await this.wxPay.verifySign({
            timestamp,
            nonce,
            body,
            serial,
            signature,
            apiSecret: this.apiV3Key,
          });
          if (!isValid) {
            this.logger.warn(
              'WeChat Pay notification signature verification failed',
            );
            return { code: 'FAIL', message: 'Invalid signature' };
          }
        } else {
          // issue #106 — fail closed: this endpoint is @Public, so a missing
          // signature must be a rejection, not a skip.
          this.logger.warn(
            'WeChat Pay notification missing signature headers, rejecting',
          );
          return { code: 'FAIL', message: 'Missing signature headers' };
        }
      } catch (signError) {
        this.logger.error(
          `WeChat Pay signature verification error: ${(signError as Error).message}`,
        );
        return { code: 'FAIL', message: 'Signature verification error' };
      }

      // Decrypt notification body using API v3 key
      let outTradeNo: string | undefined;
      let tradeState: string | undefined;
      let transactionId: string | undefined;
      let paidTotalCents: number | undefined;

      try {
        const decrypted = this.wxPay.decipher_gcm<{
          out_trade_no: string;
          trade_state: string;
          transaction_id: string;
          mchid?: string;
          appid?: string;
          amount?: { total?: number; payer_total?: number; currency?: string };
        }>(
          resource?.ciphertext ?? '',
          resource?.associated_data ?? '',
          resource?.nonce ?? '',
          this.apiV3Key,
        );
        outTradeNo = decrypted.out_trade_no;
        tradeState = decrypted.trade_state;
        transactionId = decrypted.transaction_id;
        paidTotalCents = decrypted.amount?.total;

        // Bind to THIS merchant (adversarial review, round 2): WeChat
        // platform certificates are shared across merchants, so a
        // signature-valid notification meant for another mchid must never
        // touch our ledger.
        if (decrypted.mchid !== this.mchId) {
          this.logger.warn(
            `WeChat Pay notification: mchid mismatch (got ${decrypted.mchid})`,
          );
          return { code: 'FAIL', message: 'Merchant mismatch' };
        }
      } catch (decryptError) {
        this.logger.error(
          `WeChat Pay notification decryption failed: ${(decryptError as Error).message}`,
        );
        return { code: 'FAIL', message: 'Decryption failed' };
      }

      if (!outTradeNo) {
        this.logger.warn('WeChat Pay notification missing out_trade_no');
        return { code: 'FAIL', message: 'Missing out_trade_no' };
      }

      if (tradeState === 'SUCCESS') {
        const record = await this.prisma.topUpRecord.findUnique({
          where: { id: outTradeNo },
        });

        if (!record) {
          this.logger.warn(
            `WeChat Pay notification: record not found for ${outTradeNo}`,
          );
          return { code: 'FAIL', message: 'Order not found' };
        }

        // issue #106 — verify the paid amount (cents) matches the recorded
        // order before crediting; a mismatched amount must never credit.
        if (
          paidTotalCents === undefined ||
          paidTotalCents !== Math.round(Number(record.amount) * 100)
        ) {
          this.logger.warn(
            `WeChat Pay notification: amount mismatch for record=${record.id} ` +
              `(notify=${paidTotalCents} cents, expected=${Math.round(Number(record.amount) * 100)} cents)`,
          );
          return { code: 'FAIL', message: 'Amount mismatch' };
        }

        // Idempotent: already processed
        if (
          (record.status as TransactionStatus) === TransactionStatus.COMPLETED
        ) {
          this.logger.debug(
            `WeChat Pay notification: already processed record=${record.id}`,
          );
          return { code: 'SUCCESS', message: 'OK' };
        }

        // Credit FIRST (idempotent via idempotencyKey), then mark COMPLETED
        // — same non-atomicity fix as the Alipay path.
        await this.billingService.credit({
          userId: record.userId,
          amount: Number(record.creditsAdded),
          type: TransactionType.TOP_UP,
          description: `微信支付充值 ¥${record.amount.toString()}`,
          topUpRecordId: record.id,
          idempotencyKey: `topup:${record.id}`,
        });

        // Mark record as completed
        await this.prisma.topUpRecord.update({
          where: { id: record.id },
          data: {
            status: TransactionStatus.COMPLETED,
            externalOrderId: transactionId,
            paidAt: new Date(),
          },
        });

        this.logger.log(
          `WeChat Pay success: record=${record.id}, amount=${record.amount.toString()}`,
        );
      } else if (tradeState === 'CLOSED') {
        // Only ever transition a PENDING order to FAILED — a replayed CLOSED
        // notification must never overwrite a COMPLETED record (adversarial
        // review, round 2).
        this.logger.log(`WeChat Pay closed: record=${outTradeNo}`);
        await this.prisma.topUpRecord.updateMany({
          where: { id: outTradeNo, status: TransactionStatus.PENDING },
          data: { status: TransactionStatus.FAILED },
        });
      } else if (tradeState === 'NOTPAY') {
        this.logger.debug(`WeChat Pay pending: record=${outTradeNo}`);
      }

      return { code: 'SUCCESS', message: 'OK' };
    } catch (error) {
      this.logger.error(
        `WeChat Pay notification error: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return { code: 'FAIL', message: 'Processing error' };
    }
  }
}
