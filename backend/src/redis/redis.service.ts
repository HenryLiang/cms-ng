import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      try {
        this.client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
        this.client.on('error', (err) => {
          this.logger.warn(`Redis connection error: ${err.message}`);
        });
        this.client.connect().catch((err) => {
          this.logger.warn(`Redis initial connect failed: ${err.message}`);
        });
      } catch (err: any) {
        this.logger.warn(`Redis init failed: ${err.message}`);
        this.client = null;
      }
    } else {
      this.logger.warn('REDIS_URL not configured — Redis disabled');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  get isAvailable(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * Acquire a distributed lock.
   * Returns true if lock acquired, false if already held.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable) return true; // If Redis unavailable, allow operation
    try {
      const result = await this.client!.set(
        `lock:${key}`,
        '1',
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch {
      return true; // Fail open
    }
  }

  /**
   * Release a distributed lock.
   */
  async releaseLock(key: string): Promise<void> {
    if (!this.isAvailable) return;
    try {
      await this.client!.del(`lock:${key}`);
    } catch {
      // ignore
    }
  }

  /**
   * Get a value by key.
   */
  async get(key: string): Promise<string | null> {
    if (!this.isAvailable) return null;
    try {
      return await this.client!.get(key);
    } catch {
      return null;
    }
  }

  /**
   * Set a key-value pair with optional TTL.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable) return;
    try {
      if (ttlSeconds) {
        await this.client!.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client!.set(key, value);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable) return;
    try {
      await this.client!.del(key);
    } catch {
      // ignore
    }
  }
}
