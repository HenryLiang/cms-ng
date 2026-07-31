/**
 * Process-local TTL cache for trending-topics external-source results.
 *
 * Replaces the previous Redis-backed cache. The deployment is single-instance
 * (single `node dist/src/main` process), so an in-process Map has equivalent
 * cache-hit behavior to Redis. On process restart the cache is lost, which is
 * acceptable -- the next request simply re-fetches from the upstream source.
 *
 * Mirrors the shape of the old RedisService cache methods (get/set/del with
 * optional TTL in seconds) so call sites need minimal changes.
 */
export class InMemoryCache {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  /**
   * Get a cached value by key. Returns null on miss or expiry (expired
   * entries are lazily evicted).
   */
  get(key: string): string | null {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a key-value pair with a TTL in seconds. If `ttlSeconds` is omitted
   * the entry does not expire (matches the old RedisService.set semantics);
   * all current call sites pass a TTL.
   */
  set(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt =
      ttlSeconds !== undefined
        ? Date.now() + ttlSeconds * 1000
        : Number.MAX_SAFE_INTEGER;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Delete a key. Safe to call when absent (no-op).
   */
  del(key: string): void {
    this.store.delete(key);
  }
}
