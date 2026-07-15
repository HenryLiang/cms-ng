/**
 * Shared helpers for the per-user "active" flag cache consumed by JwtStrategy
 * (per-request enforcement of account disable) and invalidated by UsersService
 * on enable/disable. Keeping the key + TTL in one place keeps the two call
 * sites in sync.
 */
export const USER_ACTIVE_CACHE_TTL = 60; // seconds

export function userActiveCacheKey(userId: string): string {
  return `user:active:${userId}`;
}
