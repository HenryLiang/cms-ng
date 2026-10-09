/**
 * Paddle webhook 接收端点（公开、无鉴权，安全完全依赖签名校验）。
 *
 * 投递契约（详见 paddle-webhooks skill）：
 * - 只有 2xx 视为投递成功；任何非 2xx 都会触发 Paddle 重试（sandbox 15 分钟内 3 次）
 * - 验签失败绝不能返回 2xx，否则事件永久丢失
 * - rawBody 已在 main.ts 全局开启（微信支付回调同样需要），验签必须用原始字节
 */
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { PaddleService } from './paddle.service';
import { PaddleSyncService } from './paddle-sync.service';

@ApiTags('paddle')
@Controller('paddle')
export class PaddleWebhookController {
  private readonly logger = new Logger(PaddleWebhookController.name);

  constructor(
    private paddle: PaddleService,
    private sync: PaddleSyncService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  // Paddle 按非 2xx 重试，429 会挤占合法重试；滥用由验签 fail-closed 兜底
  @SkipThrottle()
  @ApiOperation({
    summary: 'Paddle webhook receiver (public, signature-verified)',
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paddle-signature') signature?: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8');
    if (!signature || !rawBody) {
      throw new BadRequestException('Missing paddle-signature header or body');
    }

    try {
      // unmarshal 内部完成 HMAC 验签 + 时间戳校验 + 载荷解析，任一失败即抛错
      const event = await this.paddle.verifyWebhook(rawBody, signature);
      if (event) {
        // 先确认再异步处理：Paddle 投递只等 5 秒，云端数据库往返可能超时——
        // 超时会记为投递失败并重试（本环境实测已发生）。upsert 幂等，
        // 重复投递安全。handler 失败仅记日志；生产环境如有更高可靠性要求，
        // 应换成「先入队再确认」的持久队列。
        void this.sync.processEvent(event).catch((e: unknown) => {
          this.logger.error(
            `Paddle 事件异步处理失败 ${event.eventId}: ${e instanceof Error ? e.message : String(e)}`,
          );
        });
      }
      return { received: true };
    } catch (e) {
      // 验签失败（密钥错误/被篡改/时间戳过期）绝不能返回 2xx，
      // 否则 Paddle 认为投递成功、事件永久丢失。统一 500 让 Paddle 重试。
      this.logger.error(
        `Paddle webhook 验签失败: ${e instanceof Error ? e.message : e}`,
      );
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }
}
