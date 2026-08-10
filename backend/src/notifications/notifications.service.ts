import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationLevel, NotificationType } from '@cms-ng/shared';
import type { Notification } from '@prisma/client';
import { safeJsonParse } from '../common/json.utils';
import { PrismaService } from '../prisma/prisma.service';

export interface PublishNotificationInput {
  userId: string;
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(input: PublishNotificationInput) {
    const notification = this.prisma.notification;
    const data = {
      userId: input.userId,
      type: input.type,
      level: input.level,
      title: input.title.slice(0, 120),
      message: input.message.slice(0, 500),
      actionUrl: input.actionUrl?.slice(0, 500),
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      dedupeKey: input.dedupeKey,
    };
    const created = input.dedupeKey
      ? await notification.upsert({
          where: { dedupeKey: input.dedupeKey },
          create: data,
          update: {},
        })
      : await notification.create({ data });
    return this.serialize(created);
  }

  async list(userId: string, limit = 20) {
    const notification = this.prisma.notification;
    const [items, unreadCount] = await Promise.all([
      notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      items: items.map((item) => this.serialize(item)),
      unreadCount,
    };
  }

  async markRead(userId: string, id: string) {
    const notification = this.prisma.notification;
    const owned = await notification.findFirst({ where: { id, userId } });
    if (!owned) throw new NotFoundException('通知不存在');

    const updated = await notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return this.serialize(updated);
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  private serialize(item: Notification) {
    return {
      ...item,
      metadata: safeJsonParse<Record<string, unknown>>(item.metadata, {}),
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
