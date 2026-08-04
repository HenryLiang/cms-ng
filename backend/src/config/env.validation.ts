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

import { redactConnectionString } from '../common/redact.utils';

const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET'] as const;
const MIN_JWT_SECRET_LENGTH = 16;
const VALID_AI_PROVIDERS = ['deepseek', 'gemini', 'kimi', 'openai'] as const;
type AiProvider = (typeof VALID_AI_PROVIDERS)[number];
// 视觉链路与文本完全隔离:deepseek 无视觉能力,不接受;未配置时打标降级关闭(不 fail-fast)
const VALID_VISION_PROVIDERS = ['gemini', 'kimi', 'openai'] as const;

export interface ValidatedEnv {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  AI_PROVIDER: AiProvider;
  // Optional — surfaced if the matching provider is selected
  DEEPSEEK_API_KEY?: string;
  GEMINI_API_KEY?: string;
  KIMI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  [key: string]: string | number | undefined;
}

export type ValidationResult =
  | { success: true; data: ValidatedEnv }
  | { success: false; errors: string[] };

export function validateEnv(
  env: NodeJS.ProcessEnv = process.env,
): ValidationResult {
  const errors: string[] = [];

  for (const key of REQUIRED_VARS) {
    const v = env[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push(`  - ${key}: required but missing`);
    }
  }

  if (
    env.JWT_SECRET !== undefined &&
    env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH
  ) {
    errors.push(
      `  - JWT_SECRET: must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${env.JWT_SECRET.length})`,
    );
  }

  if (
    env.DATABASE_URL !== undefined &&
    env.DATABASE_URL.length > 0 &&
    !/^mysql:\/\//.test(env.DATABASE_URL)
  ) {
    // 脱敏后展示(公开仓库 CI 日志全公开,严禁打印含凭证连接串)
    errors.push(
      `  - DATABASE_URL: must start with mysql:// (got "${redactConnectionString(env.DATABASE_URL)}")`,
    );
  }

  const aiProvider = env.AI_PROVIDER;
  if (
    aiProvider !== undefined &&
    !(VALID_AI_PROVIDERS as readonly string[]).includes(aiProvider)
  ) {
    errors.push(
      `  - AI_PROVIDER: must be one of [${VALID_AI_PROVIDERS.join(', ')}] (got "${aiProvider}")`,
    );
  } else if (aiProvider) {
    // If a provider is selected, the matching API key must be present
    const keyMap: Record<AiProvider, string> = {
      deepseek: 'DEEPSEEK_API_KEY',
      gemini: 'GEMINI_API_KEY',
      kimi: 'KIMI_API_KEY',
      openai: 'OPENAI_API_KEY',
    };
    const requiredKey = keyMap[aiProvider as AiProvider];
    if (!env[requiredKey]) {
      errors.push(
        `  - ${requiredKey}: required when AI_PROVIDER=${aiProvider}`,
      );
    }
  }

  // 视觉 provider 仅做格式校验(枚举合法);未配置或缺 key 的降级关闭由
  // MediaTaggingService.onModuleInit 处理,不在此 fail-fast(与可选变量惯例一致)
  const visionProvider = env.AI_VISION_PROVIDER;
  if (
    visionProvider !== undefined &&
    visionProvider !== '' &&
    !(VALID_VISION_PROVIDERS as readonly string[]).includes(visionProvider)
  ) {
    errors.push(
      `  - AI_VISION_PROVIDER: must be one of [${VALID_VISION_PROVIDERS.join(', ')}] (got "${visionProvider}")`,
    );
  }

  // Elasticsearch 仅做格式校验;未配置或不可达的降级由 SearchService.onModuleInit
  // 处理,不在此 fail-fast,不进 REQUIRED_VARS(与可选变量惯例一致,PRD §7.1)
  const esEnabled =
    env.ELASTICSEARCH_ENABLED !== undefined &&
    env.ELASTICSEARCH_ENABLED.toLowerCase() === 'true';
  if (
    esEnabled &&
    (!env.ELASTICSEARCH_NODE || !/^https?:\/\//.test(env.ELASTICSEARCH_NODE))
  ) {
    errors.push(
      `  - ELASTICSEARCH_NODE: must be a http(s) URL when ELASTICSEARCH_ENABLED=true (got "${redactConnectionString(env.ELASTICSEARCH_NODE ?? '')}")`,
    );
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
      JWT_SECRET: env.JWT_SECRET!,
      PORT: env.PORT ? Number(env.PORT) : 3001,
      NODE_ENV: (env.NODE_ENV as ValidatedEnv['NODE_ENV']) || 'development',
      AI_PROVIDER: (aiProvider as AiProvider) || 'deepseek',
    },
  };
}

/**
 * Print a friendly startup error for validation failures.
 */
export function formatValidationErrors(errors: string[]): string {
  return `\n❌ Invalid environment configuration:\n${errors.join('\n')}\n\nFix the variables above in backend/.env and restart.\n`;
}
