/**
 * Environment variable validation, run at startup by @nestjs/config.
 *
 * Returns either `{ success: true, data }` (the validated+coerced env) or
 * `{ success: false, errors }` (a list of human-readable failure messages).
 *
 * Validates only the variables that MUST be present for the app to boot.
 * Optional variables (e.g. SMTP_*, billing keys) are left untouched and
 * surface their own errors at the module that needs them.
 */

const REQUIRED_VARS = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const;
const MIN_JWT_SECRET_LENGTH = 16;
const VALID_AI_PROVIDERS = ['deepseek', 'kimi', 'openai'] as const;
type AiProvider = (typeof VALID_AI_PROVIDERS)[number];

export interface ValidatedEnv {
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  AI_PROVIDER: AiProvider;
  // Optional — surfaced if the matching provider is selected
  DEEPSEEK_API_KEY?: string;
  KIMI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  [key: string]: string | number | undefined;
}

export type ValidationResult =
  | { success: true; data: ValidatedEnv }
  | { success: false; errors: string[] };

export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidationResult {
  const errors: string[] = [];

  for (const key of REQUIRED_VARS) {
    const v = env[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push(`  - ${key}: required but missing`);
    }
  }

  if (env.JWT_SECRET !== undefined && env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(
      `  - JWT_SECRET: must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${env.JWT_SECRET.length})`,
    );
  }

  if (
    env.DATABASE_URL !== undefined &&
    env.DATABASE_URL.length > 0 &&
    !/^mysql:\/\//.test(env.DATABASE_URL)
  ) {
    errors.push(`  - DATABASE_URL: must start with mysql:// (got "${env.DATABASE_URL.slice(0, 20)}...")`);
  }

  const aiProvider = env.AI_PROVIDER;
  if (aiProvider !== undefined && !(VALID_AI_PROVIDERS as readonly string[]).includes(aiProvider)) {
    errors.push(
      `  - AI_PROVIDER: must be one of [${VALID_AI_PROVIDERS.join(', ')}] (got "${aiProvider}")`,
    );
  } else if (aiProvider) {
    // If a provider is selected, the matching API key must be present
    const keyMap: Record<AiProvider, string> = {
      deepseek: 'DEEPSEEK_API_KEY',
      kimi: 'KIMI_API_KEY',
      openai: 'OPENAI_API_KEY',
    };
    const requiredKey = keyMap[aiProvider as AiProvider];
    if (!env[requiredKey]) {
      errors.push(`  - ${requiredKey}: required when AI_PROVIDER=${aiProvider}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Coerce + return the validated env
  return {
    success: true,
    data: {
      ...env,
      DATABASE_URL: env.DATABASE_URL!,
      REDIS_URL: env.REDIS_URL!,
      JWT_SECRET: env.JWT_SECRET!,
      PORT: env.PORT ? Number(env.PORT) : 3001,
      NODE_ENV: (env.NODE_ENV as ValidatedEnv['NODE_ENV']) || 'development',
      AI_PROVIDER: (aiProvider as AiProvider) || 'deepseek',
    } as ValidatedEnv,
  };
}

/**
 * Print a friendly startup error for validation failures.
 */
export function formatValidationErrors(errors: string[]): string {
  return `\n❌ Invalid environment configuration:\n${errors.join('\n')}\n\nFix the variables above in backend/.env and restart.\n`;
}
