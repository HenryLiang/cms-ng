import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { NotificationLevel, NotificationType } from '@cms-ng/shared';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    (prisma as any).notification = {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    service = new NotificationsService(prisma);
  });

  it('lists only the current user notifications and returns the unread count', async () => {
    const items = [
      {
        id: 'notice-1',
        userId: 'user-1',
        type: 'TASK',
        level: 'SUCCESS',
        title: '视频生成完成',
        message: '视频任务已完成',
        actionUrl: '/dashboard/video',
        metadata: '{"jobId":"job-1"}',
        readAt: null,
        createdAt: new Date('2026-08-10T02:00:00.000Z'),
      },
    ];
    (prisma as any).notification.findMany.mockResolvedValue(items);
    (prisma as any).notification.count.mockResolvedValue(1);

    const result = await service.list('user-1', 20);

    expect((prisma as any).notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect((prisma as any).notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'notice-1',
          metadata: { jobId: 'job-1' },
          createdAt: '2026-08-10T02:00:00.000Z',
        }),
      ],
      unreadCount: 1,
    });
    expect(result.items[0]).not.toHaveProperty('userId');
    expect(result.items[0]).not.toHaveProperty('dedupeKey');
  });

  it('marks a notification as read only when it belongs to the current user', async () => {
    (prisma as any).notification.findFirst.mockResolvedValue({
      id: 'notice-1',
      userId: 'user-1',
    });
    (prisma as any).notification.update.mockResolvedValue({
      id: 'notice-1',
      userId: 'user-1',
      type: 'TASK',
      level: 'SUCCESS',
      title: '视频生成完成',
      message: '视频任务已完成',
      actionUrl: '/dashboard/video',
      metadata: null,
      readAt: new Date('2026-08-10T02:01:00.000Z'),
      createdAt: new Date('2026-08-10T02:00:00.000Z'),
    });

    const result = await service.markRead('user-1', 'notice-1');

    expect((prisma as any).notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'notice-1', userId: 'user-1' },
    });
    expect((prisma as any).notification.update).toHaveBeenCalledWith({
      where: { id: 'notice-1' },
      data: { readAt: expect.any(Date) },
    });
    expect(result.readAt).toBe('2026-08-10T02:01:00.000Z');
  });

  it('publishes a deduplicated notification for retry-safe task and billing events', async () => {
    (prisma as any).notification.upsert.mockResolvedValue({
      id: 'notice-1',
      userId: 'user-1',
      type: NotificationType.BILLING,
      level: NotificationLevel.INFO,
      title: '扣费成功',
      message: 'AI 视频片段生成，扣除 ¥2.00，余额 ¥98.00',
      actionUrl: '/dashboard/billing/transactions',
      metadata: '{"transactionId":"tx-1"}',
      dedupeKey: 'billing:tx-1',
      readAt: null,
      createdAt: new Date('2026-08-10T02:00:00.000Z'),
    });

    await service.publish({
      userId: 'user-1',
      type: 'BILLING',
      level: 'INFO',
      title: '扣费成功',
      message: 'AI 视频片段生成，扣除 ¥2.00，余额 ¥98.00',
      actionUrl: '/dashboard/billing/transactions',
      metadata: { transactionId: 'tx-1' },
      dedupeKey: 'billing:tx-1',
    });

    expect((prisma as any).notification.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'billing:tx-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        metadata: '{"transactionId":"tx-1"}',
        dedupeKey: 'billing:tx-1',
      }),
      update: {},
    });
  });

  it('marks all unread notifications for the current user as read', async () => {
    (prisma as any).notification.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.markAllRead('user-1');

    expect((prisma as any).notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(result).toEqual({ updatedCount: 3 });
  });
});
