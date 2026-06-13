import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEV_DEFAULT_ORIGINS = ['http://localhost:3000'];

/**
 * Build NestJS CORS options from the process environment.
 *
 * - Production: only origins listed in CORS_ORIGINS are allowed. With no
 *   CORS_ORIGINS set, every explicit cross-origin request is denied (safe
 *   default). The same-origin case (no Origin header) is always allowed.
 * - Development: http://localhost:3000 is always allowed; CORS_ORIGINS
 *   (if set) extends the allowlist.
 *
 * The CORS_ORIGINS value is a comma-separated list. Whitespace is trimmed
 * and empty entries are ignored.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const isProd = env.NODE_ENV === 'production';
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowlist = isProd ? configured : [...DEV_DEFAULT_ORIGINS, ...configured];

  return {
    origin: (origin, callback) => {
      // No Origin header → same-origin request or curl. Always allowed.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowlist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not allowed`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  };
}
