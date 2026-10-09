/**
 * Paddle Node SDK 单例（仅服务端）。
 *
 * PADDLE_API_KEY / PADDLE_ENV 缺失时直接抛错，绝不静默降级——
 * 防止把请求打到错误的 Paddle 环境（sandbox / production）。
 * PADDLE_API_KEY 是服务端密钥，永远不允许出现在前端代码里。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Environment,
  LogLevel,
  Paddle,
  type EventEntity,
} from '@paddle/paddle-node-sdk';

@Injectable()
export class PaddleService implements OnModuleInit {
  private readonly logger = new Logger(PaddleService.name);
  private paddle: Paddle | null = null;
  private webhookSecret: string | null = null;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('PADDLE_API_KEY');
    const environment = this.config.get<string>('PADDLE_ENV');
    this.webhookSecret =
      this.config.get<string>('PADDLE_NOTIFICATION_WEBHOOK_SECRET') ?? null;

    if (!apiKey || !environment) {
      // 与项目惯例一致：可选集成的配置缺失不在启动时 fail-fast（见 env.validation.ts），
      // 但首次调用会抛错，绝不静默打到错误环境。
      this.logger.warn(
        'PADDLE_API_KEY / PADDLE_ENV 未配置，Paddle 功能不可用（webhook 验签与 portal 会话将失败）',
      );
      return;
    }
    this.paddle = new Paddle(apiKey, {
      environment: environment as Environment,
      logLevel: LogLevel.error,
    });
  }

  private getClient(): Paddle {
    if (!this.paddle) {
      throw new Error(
        'Paddle 未配置：请在 backend/.env 设置 PADDLE_API_KEY 和 PADDLE_ENV（sandbox | production）',
      );
    }
    return this.paddle;
  }

  /**
   * 验签并反序列化 webhook 事件。
   * 必须传 RAW body 字符串（不能先 JSON.parse，否则验签必失败）。
   * 验签失败/时间戳过期/载荷畸形都会抛错，由调用方转成非 2xx 让 Paddle 重试。
   */
  async verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<EventEntity | undefined> {
    if (!this.webhookSecret) {
      throw new Error(
        'PADDLE_NOTIFICATION_WEBHOOK_SECRET 未配置，无法验证 webhook 签名',
      );
    }
    return this.getClient().webhooks.unmarshal(
      rawBody,
      this.webhookSecret,
      signature,
    );
  }

  /** 为客户签发 Paddle 托管门户会话（一次性、限时，禁止缓存）。 */
  async createPortalSession(customerId: string, subscriptionIds: string[]) {
    const session = await this.getClient().customerPortalSessions.create(
      customerId,
      subscriptionIds,
    );
    // 只返回 overview URL：session 对象还包含 customer_id 等客户端不需要的信息
    return session.urls.general.overview;
  }
}
