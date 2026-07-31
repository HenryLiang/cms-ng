import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Headers,
  Param,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { UserRole } from '@cms-ng/shared';
import { BillingService } from './billing.service';
import { AlipayService } from './payment/alipay.service';
import { WechatPayService } from './payment/wechat-pay.service';
import { ManualTopUpDto } from './dto/manual-top-up.dto';
import { UpdateBillingConfigDto } from './dto/update-billing-config.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { EstimateCostDto } from './dto/estimate-cost.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateTopUpDto } from './dto/create-top-up.dto';

@ApiTags('billing')
@ApiBearerAuth('bearer')
@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private alipayService: AlipayService,
    private wechatPayService: WechatPayService,
  ) {}

  // ─── Balance ───

  @Get('balance')
  @ApiOperation({ summary: 'Get the current user billing balance' })
  getBalance(@CurrentUser('userId') userId: string) {
    return this.billingService.getBalance(userId);
  }

  // ─── Transactions ───

  @Get('transactions')
  @ApiOperation({ summary: 'List the current user transactions' })
  getTransactions(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryTransactionsDto,
  ) {
    return this.billingService.getTransactions(userId, query);
  }

  @Get('transactions/team')
  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'List team-wide transactions (editor/admin only)' })
  getTeamTransactions(@Query() query: QueryTransactionsDto) {
    return this.billingService.getTeamTransactions(query);
  }

  // ─── Config ───

  @Get('config')
  @ApiOperation({ summary: 'Get all billing configuration items' })
  getAllConfigs() {
    return this.billingService.getAllConfigs();
  }

  @Put('config/:itemKey')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a billing configuration item (admin only)' })
  updateConfig(
    @CurrentUser('userId') adminId: string,
    @Param('itemKey') itemKey: string,
    @Body() dto: UpdateBillingConfigDto,
  ) {
    return this.billingService.updateConfig(adminId, itemKey, dto);
  }

  // ─── Top-up ───

  @Post('top-up/manual')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Manually top up a user balance (admin only)' })
  manualTopUp(
    @CurrentUser('userId') adminId: string,
    @Body() dto: ManualTopUpDto,
  ) {
    return this.billingService.manualTopUp(adminId, dto);
  }

  @Get('top-up/records')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List manual top-up records (admin only)' })
  getTopUpRecords(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.billingService.getTopUpRecords(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  // ─── Estimate ───

  @Post('estimate')
  @ApiOperation({ summary: 'Estimate the cost of an AI operation' })
  estimateCost(
    @CurrentUser('userId') userId: string,
    @Body() dto: EstimateCostDto,
  ) {
    return this.billingService.estimateCost(userId, dto);
  }

  // ─── Alert ───

  @Get('alert')
  @ApiOperation({ summary: 'Get the current user low-balance alert settings' })
  getAlert(@CurrentUser('userId') userId: string) {
    return this.billingService.getAlert(userId);
  }

  @Put('alert')
  @ApiOperation({
    summary: 'Update the current user low-balance alert settings',
  })
  updateAlert(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateAlertDto,
  ) {
    return this.billingService.updateAlert(userId, dto);
  }

  // ─── Refund ───

  @Post('refund')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Issue a refund (admin only)' })
  refund(@CurrentUser('userId') adminId: string, @Body() dto: CreateRefundDto) {
    return this.billingService.refund(adminId, dto);
  }

  // ─── Report ───

  @Get('report')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get a billing report for a date range (admin only)',
  })
  getReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.billingService.getReport(startDate, endDate);
  }

  // ─── Payment ───

  /**
   * Create a top-up order via Alipay or WeChat Pay.
   */
  @Post('top-up/create')
  @ApiOperation({ summary: 'Create a top-up order via Alipay or WeChat Pay' })
  async createTopUp(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateTopUpDto,
  ) {
    switch (dto.paymentMethod) {
      case 'ALIPAY':
        return this.alipayService.createOrder(
          userId,
          dto.amount,
          `充值 ¥${dto.amount}`,
        );
      case 'WECHAT_PAY':
        return this.wechatPayService.createOrder(
          userId,
          dto.amount,
          `充值 ¥${dto.amount}`,
        );
      default:
        throw new BadRequestException(
          `Unsupported payment method: ${dto.paymentMethod}`,
        );
    }
  }

  /**
   * Alipay async notification callback (public, no auth).
   */
  @Public()
  @Post('payment/alipay/notify')
  // Exempt from throttling: Alipay retries notifications on non-'success'
  // responses and a 429 would delay legitimate settlement. Abuse is bounded
  // by fail-closed signature verification (issue #106).
  @SkipThrottle()
  @ApiOperation({
    summary: 'Alipay async payment notification (public callback)',
  })
  async alipayNotify(@Body() body: Record<string, string>) {
    return this.alipayService.handleNotification(body);
  }

  /**
   * WeChat Pay notification callback (public, no auth).
   */
  @Public()
  @Post('payment/wechat/notify')
  // NOTE: NOT @SkipThrottle (unlike Alipay). Alipay verifies signatures
  // locally against the configured public key, but wechatpay-node-v3 may
  // fetch platform certificates over the network for an unknown serial —
  // an unauthenticated caller could otherwise amplify cert fetches
  // (adversarial review, round 2). The global 100/min limit leaves ample
  // room for WeChat's legitimate retries.
  @ApiOperation({
    summary: 'WeChat Pay async payment notification (public callback)',
  })
  async wechatNotify(
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Signature verification must run over the RAW body — @Body() would be
    // the already-parsed object and JSON.parse would throw, making every
    // legitimate notification fail (found by adversarial review). rawBody is
    // enabled in main.ts.
    const raw = req.rawBody?.toString('utf8');
    if (!raw) {
      return { code: 'FAIL', message: 'Missing raw body' };
    }
    return this.wechatPayService.handleNotification(headers, raw);
  }
}
