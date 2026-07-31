import { Injectable } from '@nestjs/common';

/**
 * Process-local mutex used by the auto-publish pipeline to prevent the same
 * task from running twice concurrently.
 *
 * Replaces the previous Redis-based distributed lock. The deployment is
 * single-instance (single `node dist/src/main` process fronted by nginx;
 * `@nestjs/schedule` cron jobs are in-process state), so an in-process lock
 * is sufficient. If the process crashes the Map is lost, which is equivalent
 * to the old Redis lock's TTL-based self-healing.
 *
 * Note: there is no "unavailable" state -- unlike Redis, an in-process Map
 * cannot be down, so the previous fail-closed branch is unnecessary.
 */
@Injectable()
export class MemoryLockService {
  private readonly locks = new Map<string, number>(); // key -> expiresAt (ms epoch)

  /**
   * Try to acquire a lock for `key`. Returns true if acquired, false if
   * already held (and not yet expired).
   */
  acquireLock(key: string, ttlSeconds: number): boolean {
    const now = Date.now();
    const expiresAt = this.locks.get(key);
    if (expiresAt !== undefined && expiresAt > now) {
      return false; // still held
    }
    this.locks.set(key, now + ttlSeconds * 1000);
    return true;
  }

  /**
   * Release a lock. Safe to call when not held (no-op).
   */
  releaseLock(key: string): void {
    this.locks.delete(key);
  }
}
