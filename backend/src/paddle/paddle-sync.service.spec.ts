import { Test, TestingModule } from '@nestjs/testing';
import { EventName } from '@paddle/paddle-node-sdk';
import { PaddleSyncService } from './paddle-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

describe('PaddleSyncService', () => {
  let service: PaddleSyncService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaddleSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PaddleSyncService);
  });

  it('upserts customer on customer.created / customer.updated', async () => {
    await service.processEvent({
      eventId: 'evt-1',
      eventType: EventName.CustomerCreated,
      occurredAt: new Date().toISOString(),
      data: { id: 'ctm_1', email: 'a@example.com' },
    } as never);

    expect(prisma.paddleCustomer.upsert).toHaveBeenCalledWith({
      where: { customerId: 'ctm_1' },
      update: { email: 'a@example.com' },
      create: { customerId: 'ctm_1', email: 'a@example.com' },
    });
  });

  it('upserts subscription and backfills a customer placeholder row', async () => {
    await service.processEvent({
      eventId: 'evt-2',
      eventType: EventName.SubscriptionCreated,
      occurredAt: new Date().toISOString(),
      data: {
        id: 'sub_1',
        customerId: 'ctm_1',
        status: 'trialing',
        scheduledChange: null,
        items: [{ price: { id: 'pri_1', productId: 'pro_1' } }],
      },
    } as never);

    // 乱序保护：先确保客户行存在（占位），再 upsert 订阅
    expect(prisma.paddleCustomer.upsert).toHaveBeenCalledWith({
      where: { customerId: 'ctm_1' },
      update: {},
      create: { customerId: 'ctm_1', email: '' },
    });
    expect(prisma.paddleSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscriptionId: 'sub_1' },
        create: expect.objectContaining({
          subscriptionId: 'sub_1',
          customerId: 'ctm_1',
          status: 'trialing',
          priceId: 'pri_1',
          productId: 'pro_1',
        }),
      }),
    );
  });

  it('mirrors scheduled_change on subscription.updated without touching status semantics', async () => {
    const effectiveAt = new Date('2030-05-12T00:00:00Z');
    await service.processEvent({
      eventId: 'evt-3',
      eventType: EventName.SubscriptionUpdated,
      occurredAt: new Date().toISOString(),
      data: {
        id: 'sub_1',
        customerId: 'ctm_1',
        status: 'active',
        scheduledChange: { action: 'cancel', effectiveAt },
        items: [{ price: { id: 'pri_1', productId: 'pro_1' } }],
      },
    } as never);

    expect(prisma.paddleSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'active',
          scheduledChangeAction: 'cancel',
          scheduledChangeAt: effectiveAt,
        }),
      }),
    );
  });

  it('routes subscription.canceled to the same upsert with canceled status', async () => {
    await service.processEvent({
      eventId: 'evt-4',
      eventType: EventName.SubscriptionCanceled,
      occurredAt: new Date().toISOString(),
      data: {
        id: 'sub_1',
        customerId: 'ctm_1',
        status: 'canceled',
        scheduledChange: null,
        items: [{ price: { id: 'pri_1', productId: 'pro_1' } }],
      },
    } as never);

    expect(prisma.paddleSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'canceled' }),
      }),
    );
  });

  it('handles transaction.completed without writing subscription state', async () => {
    await service.processEvent({
      eventId: 'evt-5',
      eventType: EventName.TransactionCompleted,
      occurredAt: new Date().toISOString(),
      data: { id: 'txn_1', customerId: 'ctm_1' },
    } as never);

    expect(prisma.paddleSubscription.upsert).not.toHaveBeenCalled();
  });

  it('safely ignores unknown event types', async () => {
    await expect(
      service.processEvent({
        eventId: 'evt-6',
        eventType: 'discount.created',
        occurredAt: new Date().toISOString(),
        data: {},
      } as never),
    ).resolves.toBeUndefined();
    expect(prisma.paddleCustomer.upsert).not.toHaveBeenCalled();
  });
});
