import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { AlipayService } from './payment/alipay.service';
import { WechatPayService } from './payment/wechat-pay.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, AlipayService, WechatPayService],
  exports: [BillingService],
})
export class BillingModule {}
