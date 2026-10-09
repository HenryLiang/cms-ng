import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddleService } from './paddle.service';
import { PaddleSyncService } from './paddle-sync.service';

describe('PaddleWebhookController', () => {
  let controller: PaddleWebhookController;
  const paddle = { verifyWebhook: jest.fn() };
  const sync = { processEvent: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaddleWebhookController],
      providers: [
        { provide: PaddleService, useValue: paddle },
        { provide: PaddleSyncService, useValue: sync },
      ],
    }).compile();
    controller = module.get(PaddleWebhookController);
  });

  const reqWith = (rawBody?: string) =>
    ({
      rawBody: rawBody === undefined ? undefined : Buffer.from(rawBody, 'utf8'),
    }) as never;

  it('rejects requests without signature or body with 400', async () => {
    await expect(
      controller.handleWebhook(reqWith('{}'), undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.handleWebhook(reqWith(undefined), 'ts=1;h1=abc'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paddle.verifyWebhook).not.toHaveBeenCalled();
  });

  it('returns 200 and routes verified events', async () => {
    const event = { eventId: 'evt-1', eventType: 'customer.created' };
    paddle.verifyWebhook.mockResolvedValue(event);

    await expect(
      controller.handleWebhook(reqWith('{"x":1}'), 'ts=1;h1=abc'),
    ).resolves.toEqual({ received: true });
    expect(paddle.verifyWebhook).toHaveBeenCalledWith('{"x":1}', 'ts=1;h1=abc');
    expect(sync.processEvent).toHaveBeenCalledWith(event);
  });

  it('returns 500 (never 2xx) when signature verification fails', async () => {
    paddle.verifyWebhook.mockRejectedValue(new Error('bad signature'));

    await expect(
      controller.handleWebhook(reqWith('{"x":1}'), 'ts=1;h1=bad'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(sync.processEvent).not.toHaveBeenCalled();
  });

  it('acks 200 even when async handling fails (Paddle must not retry processed deliveries)', async () => {
    paddle.verifyWebhook.mockResolvedValue({
      eventId: 'evt-2',
      eventType: 'subscription.updated',
    });
    sync.processEvent.mockRejectedValueOnce(new Error('db down'));

    // 处理是异步的：投递立即确认，handler 失败只记日志（见 controller 注释）
    await expect(
      controller.handleWebhook(reqWith('{}'), 'ts=1;h1=abc'),
    ).resolves.toEqual({ received: true });
    // 让微任务跑完，确认 rejection 被吞掉而不是炸掉进程
    await new Promise((r) => setImmediate(r));
  });
});
