import { describe, it, expect } from '@jest/globals';
import { buildCorsOptions } from './cors.config';

describe('buildCorsOptions', () => {
  it('development env without CORS_ORIGINS allows http://localhost:3000', () => {
    const opts = buildCorsOptions({ NODE_ENV: 'development' });
    const origin = (opts.origin as (o: string | undefined, cb: (e: Error | null, ok: boolean) => void) => void)(
      'http://localhost:3000',
      () => {},
    );
    // origin is a function; check it via the helper below
    expect(checkOrigin(opts, 'http://localhost:3000')).toBe(true);
  });

  it('development env without CORS_ORIGINS blocks a foreign origin', () => {
    const opts = buildCorsOptions({ NODE_ENV: 'development' });
    expect(checkOrigin(opts, 'http://evil.example.com')).toBe(false);
  });

  it('production env without CORS_ORIGINS denies all cross-origin requests (safe default)', () => {
    const opts = buildCorsOptions({ NODE_ENV: 'production' });
    // No origin header (same-origin or curl) is allowed
    expect(checkOrigin(opts, undefined)).toBe(true);
    // Any explicit origin in production without explicit whitelist is denied
    expect(checkOrigin(opts, 'http://localhost:3000')).toBe(false);
    expect(checkOrigin(opts, 'https://example.com')).toBe(false);
  });

  it('CORS_ORIGINS with a single origin is honored in production', () => {
    const opts = buildCorsOptions({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
    });
    expect(checkOrigin(opts, 'https://app.example.com')).toBe(true);
    expect(checkOrigin(opts, 'https://other.example.com')).toBe(false);
  });

  it('CORS_ORIGINS with a comma-separated list is honored', () => {
    const opts = buildCorsOptions({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.com,https://b.com , https://c.com',
    });
    expect(checkOrigin(opts, 'https://a.com')).toBe(true);
    expect(checkOrigin(opts, 'https://b.com')).toBe(true);
    expect(checkOrigin(opts, 'https://c.com')).toBe(true);
    expect(checkOrigin(opts, 'https://d.com')).toBe(false);
  });

  it('CORS_ORIGINS in development extends the default localhost list', () => {
    const opts = buildCorsOptions({
      NODE_ENV: 'development',
      CORS_ORIGINS: 'https://staging.example.com',
    });
    // Default localhost still works
    expect(checkOrigin(opts, 'http://localhost:3000')).toBe(true);
    // Extra origin from env also works
    expect(checkOrigin(opts, 'https://staging.example.com')).toBe(true);
    // Other origins blocked
    expect(checkOrigin(opts, 'https://other.com')).toBe(false);
  });

  it('allows credentials and the documented HTTP methods', () => {
    const opts = buildCorsOptions({ NODE_ENV: 'development' });
    expect(opts.credentials).toBe(true);
    expect(opts.methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']));
  });
});

// Helper to invoke the origin callback (which can be a function in NestJS CORS options)
function checkOrigin(opts: ReturnType<typeof buildCorsOptions>, origin: string | undefined): boolean {
  // When opts.origin is a function, call it with the origin and a callback
  if (typeof opts.origin === 'function') {
    let allowed = false;
    (opts.origin as any)(origin, (_err: Error | null, ok: boolean) => {
      allowed = ok;
    });
    return allowed;
  }
  // Static array
  if (Array.isArray(opts.origin)) {
    return origin !== undefined && opts.origin.includes(origin);
  }
  // Wildcard
  if (opts.origin === '*' || opts.origin === true) return true;
  return false;
}
