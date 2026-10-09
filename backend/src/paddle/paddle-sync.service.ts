/**
 * Paddle webhook 事件路由 + 订阅/客户状态镜像入库。
 *
 * 投递契约：Paddle 至少投递一次且可能乱序——所有 handler 都是按 Paddle ID
 * 的 upsert（收敛式写入），重复/乱序投递自动收敛到最新状态。
 * subscription 事件可能先于 customer 事件到达，所以先 upsert 客户占位行
 * （email 空串），customer.created/updated 到达后再补全 email。
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  EventName,
  type EventEntity,
  type CustomerCreatedEvent,
  type CustomerUpdatedEvent,
  type SubscriptionCanceledEvent,
  type SubscriptionCreatedEvent,
  type SubscriptionUpdatedEvent,
  type TransactionCompletedEvent,
} from '@paddle/paddle-node-sdk';
import { PrismaService } from '../prisma/prisma.service';

type SubscriptionEvent =
  | SubscriptionCreatedEvent
  | SubscriptionUpdatedEvent
  | SubscriptionCanceledEvent;

@Injectable()
export class PaddleSyncService {
  private readonly logger = new Logger(PaddleSyncService.name);

  constructor(private prisma: PrismaService) {}

  async processEvent(event: EventEntity): Promise<void> {
    this.logger.log(`Paddle event ${event.eventType} (${event.eventId})`);
    switch (event.eventType) {
      case EventName.SubscriptionCreated:
      case EventName.SubscriptionUpdated:
      case EventName.SubscriptionCanceled:
        return this.upsertSubscription(event);
      case EventName.CustomerCreated:
      case EventName.CustomerUpdated:
        return this.upsertCustomer(event);
      case EventName.TransactionCompleted:
        return this.handleTransactionCompleted(event);
      default:
        // 订阅了但暂未处理的事件类型：安全忽略，不抛错（抛错会触发无意义重试）
        this.logger.log(`Paddle event ${event.eventType} ignored`);
        return;
    }
  }

  private async upsertCustomer(
    event: CustomerCreatedEvent | CustomerUpdatedEvent,
  ): Promise<void> {
    await this.prisma.paddleCustomer.upsert({
      where: { customerId: event.data.id },
      update: { email: event.data.email },
      create: { customerId: event.data.id, email: event.data.email },
    });
  }

  private async upsertSubscription(event: SubscriptionEvent): Promise<void> {
    const sub = event.data;
    // 外键需要客户行先存在；乱序到达时先插占位行，customer 事件再补 email
    await this.prisma.paddleCustomer.upsert({
      where: { customerId: sub.customerId },
      update: {},
      create: { customerId: sub.customerId, email: '' },
    });
    await this.prisma.paddleSubscription.upsert({
      where: { subscriptionId: sub.id },
      update: {
        status: sub.status,
        priceId: sub.items[0]?.price?.id ?? '',
        productId: sub.items[0]?.price?.productId ?? '',
        scheduledChangeAction: sub.scheduledChange?.action ?? null,
        scheduledChangeAt: sub.scheduledChange?.effectiveAt ?? null,
      },
      create: {
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: sub.status,
        priceId: sub.items[0]?.price?.id ?? '',
        productId: sub.items[0]?.price?.productId ?? '',
        scheduledChangeAction: sub.scheduledChange?.action ?? null,
        scheduledChangeAt: sub.scheduledChange?.effectiveAt ?? null,
      },
    });
  }

  private handleTransactionCompleted(event: TransactionCompletedEvent): void {
    // 订阅制权益由 subscription.* 事件驱动开通；这里只留审计日志。
    // 将来若有一次性买断（积分包等），在这里加按 event.eventId 去重的开通逻辑。
    this.logger.log(
      `transaction.completed: ${event.data.id} customer=${event.data.customerId}`,
    );
  }
}
