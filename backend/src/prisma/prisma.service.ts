import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * How often the connection pool is pinged with `SELECT 1`. Prisma 6's MySQL
 * connector has no idle-connection eviction and no checkout health-check, so
 * a pooled connection reset by the network path (P1017 "Server has closed
 * the connection", e.g. over a WAN link to a remote DB) only surfaces when
 * the next query reuses it - typically right after a minutes-long AI
 * generation call. A pool heartbeat keeps idle connections warm and reaps
 * dead ones here instead of failing a user request.
 */
export const PRISMA_KEEPALIVE_INTERVAL_MS = 60_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private keepAliveTimer?: ReturnType<typeof setInterval>;

  async onModuleInit() {
    await this.$connect();
    this.startKeepAlive();
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
    await this.$disconnect();
  }

  private startKeepAlive(): void {
    const timer = setInterval(() => {
      void this.$queryRaw`SELECT 1`.catch((error: unknown) => {
        // Self-heals on the next beat: Prisma discards the broken pooled
        // connection, so debug level is enough.
        this.logger.debug(
          `Prisma pool keep-alive ping failed (retrying next interval): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, PRISMA_KEEPALIVE_INTERVAL_MS);
    // Do not hold the event loop open if shutdown skips onModuleDestroy.
    timer.unref?.();
    this.keepAliveTimer = timer;
  }
}
