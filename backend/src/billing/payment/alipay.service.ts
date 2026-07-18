import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing.service';
import {
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@cms-ng/shared';
import { AlipaySdk } from 'alipay-sdk';

@Injectable()
export class AlipayService {
  private readonly logger = new Logger(AlipayService.name);
  private readonly appId: string;
  private readonly privateKey: string;
  private readonly publicKey: string;
  private alipaySdk: AlipaySdk | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private billingService: BillingService,
  ) {
    this.appId = this.config.get<string>('ALIPAY_APP_ID') || '';
    this.privateKey = this.config.get<string>('ALIPAY_PRIVATE_KEY') || '';
    this.publicKey = this.config.get<string>('ALIPAY_PUBLIC_KEY') || '';

    if (this.appId && this.privateKey) {
      try {
        this.alipaySdk = new AlipaySdk({
          appId: this.appId,
          privateKey: this.privateKey,
          alipayPublicKey: this.publicKey || undefined,
          // 关键:openssl pkcs8 命令生成的私钥是 PKCS#8 格式,
          // 必须显式告诉 SDK,否则它默认按 PKCS#1 解析会报
          // "error:1E08010C:DECODER routines::unsupported"
          keyType: 'PKCS8',
          // 沙箱: ALIPAY_GATEWAY=https://openapi.alipaydev.com/gateway.do
          // 生产: 留空(默认 https://openapi.alipay.com/gateway.do)
          gateway: this.config.get<string>('ALIPAY_GATEWAY') || undefined,
        });
        this.logger.log(
          `Alipay configured: appId=${this.appId}, gateway=${this.config.get<string>('ALIPAY_GATEWAY') || 'https://openapi.alipay.com/gateway.do (default)'}`,
        );
      } catch (e) {
        this.logger.warn(`Alipay SDK init failed: ${e}`);
      }
    } else {
      this.logger.log(
        'Alipay not configured (missing ALIPAY_APP_ID or ALIPAY_PRIVATE_KEY). Online top-up via Alipay disabled.',
      );
    }
  }

  private getNotifyUrl(): string {
    return this.config.get<string>('APP_BASE_URL') || 'http://localhost:3001';
  }

  private getReturnUrl(): string {
    return (
      this.config.get<string>('FRONTEND_BASE_URL') || 'http://localhost:3000'
    );
  }

  /**
   * Create a payment order and return the payment URL.
   */
  async createOrder(
    userId: string,
    amount: number,
    subject: string,
  ): Promise<{ topUpRecordId: string; paymentUrl: string }> {
    if (!this.alipaySdk) {
      throw new Error(
        'Alipay not configured. Please set ALIPAY_APP_ID and ALIPAY_PRIVATE_KEY.',
      );
    }

    // Create TopUpRecord
    const record = await this.prisma.topUpRecord.create({
      data: {
        userId,
        amount,
        creditsAdded: amount,
        bonusCredits: 0,
        paymentMethod: PaymentMethod.ALIPAY,
        status: TransactionStatus.PENDING,
      },
    });

    let paymentUrl: string;
    try {
      // pageExecute returns a GET URL or POST form HTML for PC web payment
      paymentUrl = this.alipaySdk.pageExecute('alipay.trade.page.pay', 'GET', {
        notifyUrl: `${this.getNotifyUrl()}/billing/payment/alipay/notify`,
        returnUrl: `${this.getReturnUrl()}/dashboard/billing?payment=success`,
        bizContent: {
          outTradeNo: record.id,
          totalAmount: amount.toFixed(2),
          subject,
          productCode: 'FAST_INSTANT_TRADE_PAY',
        },
      });
    } catch (error) {
      this.logger.error(
        `Alipay createOrder failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Mark record as failed so it doesn't stay in PENDING forever
      await this.prisma.topUpRecord.update({
        where: { id: record.id },
        data: { status: TransactionStatus.FAILED },
      });
      throw new Error(
        `Failed to create Alipay order: ${(error as Error).message}`,
      );
    }

    this.logger.log(
      `Alipay order created: record=${record.id}, amount=${amount}, subject=${subject}`,
    );

    return { topUpRecordId: record.id, paymentUrl };
  }

  /**
   * Handle Alipay async notification callback.
   * Returns 'success' to acknowledge receipt (Alipay requirement).
   */
  async handleNotification(params: Record<string, string>): Promise<string> {
    // Verify signature with alipay public key
    if (this.alipaySdk && this.publicKey) {
      try {
        const isValid = this.alipaySdk.checkNotifySign(params);
        if (!isValid) {
          this.logger.warn('Alipay notification signature verification failed');
          return 'failure';
        }
      } catch (error) {
        this.logger.error(
          `Alipay signature check error: ${(error as Error).message}`,
        );
        return 'failure';
      }
    } else {
      this.logger.warn(
        'Alipay public key not configured, skipping signature verification',
      );
    }

    const outTradeNo = params.out_trade_no;
    const tradeStatus = params.trade_status;

    if (!outTradeNo) {
      this.logger.warn('Alipay notification missing out_trade_no');
      return 'fail';
    }

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const record = await this.prisma.topUpRecord.findUnique({
        where: { id: outTradeNo },
      });

      if (!record) {
        this.logger.warn(
          `Alipay notification: record not found for ${outTradeNo}`,
        );
        return 'fail';
      }

      // Idempotent: already processed
      if (
        (record.status as TransactionStatus) === TransactionStatus.COMPLETED
      ) {
        this.logger.debug(
          `Alipay notification: already processed record=${record.id}`,
        );
        return 'success';
      }

      // Update record status
      await this.prisma.topUpRecord.update({
        where: { id: record.id },
        data: {
          status: TransactionStatus.COMPLETED,
          externalOrderId: params.trade_no,
          paidAt: new Date(),
        },
      });

      // Credit balance
      await this.billingService.credit({
        userId: record.userId,
        amount: Number(record.creditsAdded),
        type: TransactionType.TOP_UP,
        description: `支付宝充值 ¥${record.amount.toString()}`,
        topUpRecordId: record.id,
        idempotencyKey: `topup:${record.id}`,
      });

      this.logger.log(
        `Alipay payment success: record=${record.id}, amount=${record.amount.toString()}`,
      );
    } else if (tradeStatus === 'WAIT_BUYER_PAY') {
      this.logger.debug(`Alipay payment pending: record=${outTradeNo}`);
    } else if (tradeStatus === 'TRADE_CLOSED') {
      this.logger.log(`Alipay payment closed: record=${outTradeNo}`);
      await this.prisma.topUpRecord.update({
        where: { id: outTradeNo },
        data: { status: TransactionStatus.FAILED },
      });
    }

    return 'success';
  }
}
