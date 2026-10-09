import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PaddlePortalController } from './paddle-portal.controller';
import { PaddleService } from './paddle.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

describe('PaddlePortalController', () => {
  let controller: PaddlePortalController;
  let prisma: ReturnType<typeof createMockPrismaService>;
  const paddle = { createPortalSession: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaddlePortalController],
      providers: [
        { provide: PaddleService, useValue: paddle },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    controller = module.get(PaddlePortalController);
  });

  it('mints a portal session for the authenticated user and returns only the URL', async () => {
    (prisma.paddleCustomer.findFirst as jest.Mock).mockResolvedValue({
      customerId: 'ctm_1',
      email: 'user@example.com',
      subscriptions: [{ subscriptionId: 'sub_1' }],
    });
    paddle.createPortalSession.mockResolvedValue(
      'https://portal.example.com/s',
    );

    const result = await controller.createPortalSession('user@example.com');

    // customerId 来自服务端 email 解析，SDK 收到的只能是它
    expect(prisma.paddleCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
    expect(paddle.createPortalSession).toHaveBeenCalledWith('ctm_1', ['sub_1']);
    expect(result).toEqual({ url: 'https://portal.example.com/s' });
  });

  it('404s without calling the SDK when the user has no Paddle customer', async () => {
    (prisma.paddleCustomer.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      controller.createPortalSession('new@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(paddle.createPortalSession).not.toHaveBeenCalled();
  });
});
