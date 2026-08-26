import { Logger } from '@nestjs/common';
import { PRISMA_KEEPALIVE_INTERVAL_MS, PrismaService } from './prisma.service';

// Mock the real PrismaClient so the service's own lifecycle (keep-alive
// timer) can be tested without a database.
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);
    $queryRaw = jest.fn().mockResolvedValue([]);
  },
}));

describe('PrismaService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('connects on init and pings the pool once per interval', async () => {
    const service = new PrismaService();

    await service.onModuleInit();

    expect(service.$connect).toHaveBeenCalledTimes(1);
    expect(service.$queryRaw).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(PRISMA_KEEPALIVE_INTERVAL_MS);
    expect(service.$queryRaw).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(PRISMA_KEEPALIVE_INTERVAL_MS);
    expect(service.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('swallows keep-alive failures (P1017) instead of rejecting', async () => {
    const service = new PrismaService();
    (service.$queryRaw as unknown as jest.Mock).mockRejectedValue(
      new Error('P1017: Server has closed the connection'),
    );

    await service.onModuleInit();
    // Advances the heartbeat and flushes microtasks - an unhandled
    // rejection would fail the test before these assertions run.
    await jest.advanceTimersByTimeAsync(PRISMA_KEEPALIVE_INTERVAL_MS);

    expect(Logger.prototype.debug).toHaveBeenCalledWith(
      expect.stringContaining('P1017'),
    );
  });

  it('stops pinging after destroy', async () => {
    const service = new PrismaService();

    await service.onModuleInit();
    await jest.advanceTimersByTimeAsync(PRISMA_KEEPALIVE_INTERVAL_MS);
    expect(service.$queryRaw).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(PRISMA_KEEPALIVE_INTERVAL_MS * 2);
    expect(service.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
