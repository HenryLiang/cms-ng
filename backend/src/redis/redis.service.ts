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
   * Returns true if lock acquired, false if already held or Redis unavailable.
   *
   * 关键路径默认拒绝（fail-closed）— see issue #48 P0：
   * Redis 不可用或网络错误时返 false，绝不静默放过并发触发。
   * 失败会打 error 日志，便于运维发现并告警。
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable) {
      this.logger.error(
        `[FAIL-CLOSED] Redis unavailable — refusing to acquire lock: ${key}`,
      );
      return false;
    }
    try {
      const result = await this.client!.set(
        `lock:${key}`,
        '1',
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (err: any) {
      this.logger.error(
        `[FAIL-CLOSED] Redis SET NX failed for ${key}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Release a distributed lock.
   * 释放失败无需 fail-closed — 锁有 TTL 自愈到时自然过期。
   */
  async releaseLock(key: string): Promise<void> {
    if (!this.isAvailable) return;
    try {
      await this.client!.del(`lock:${key}`);
    } catch (err: any) {
      this.logger.warn(
        `Redis DEL failed for ${key}: ${err.message} — lock will expire via TTL`,
      );
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
