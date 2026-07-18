import { describe, it, expect } from '@jest/globals';
import { validateEnv, formatValidationErrors } from './env.validation';

const goodBase = {
  DATABASE_URL: 'mysql://root:root123@localhost:3306/cms_ng',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(32),
  AI_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'sk-test',
  NODE_ENV: 'development',
};

describe('validateEnv', () => {
  it('passes for a fully populated development env', () => {
    const result = validateEnv(goodBase);
    expect(result.success).toBe(true);
  });

  it('coerces PORT to a number and defaults to 3001', () => {
    const r1 = validateEnv({ ...goodBase, PORT: '4000' });
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.PORT).toBe(4000);

    const r2 = validateEnv(goodBase);
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.PORT).toBe(3001);
  });

  it('fails when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = goodBase;
    const r = validateEnv(rest);
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
  });

  it('fails when JWT_SECRET is missing', () => {
    const { JWT_SECRET: _omit, ...rest } = goodBase;
    const r = validateEnv(rest);
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
  });

  it('fails when JWT_SECRET is too short (< 16 chars)', () => {
    const r = validateEnv({ ...goodBase, JWT_SECRET: 'short' });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.errors.some((e) => e.includes('at least 16'))).toBe(true);
  });

  it('fails when DATABASE_URL does not start with mysql://', () => {
    const r = validateEnv({ ...goodBase, DATABASE_URL: 'postgres://x/y' });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.errors.some((e) => e.includes('mysql://'))).toBe(true);
  });

  it('fails when AI_PROVIDER is not in the allowed list', () => {
    const r = validateEnv({ ...goodBase, AI_PROVIDER: 'gpt5' });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.errors.some((e) => e.includes('AI_PROVIDER'))).toBe(true);
  });

  it('fails when AI_PROVIDER=deepseek but DEEPSEEK_API_KEY is missing', () => {
    const { DEEPSEEK_API_KEY: _omit, ...rest } = goodBase;
    const r = validateEnv(rest);
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.errors.some((e) => e.includes('DEEPSEEK_API_KEY'))).toBe(true);
  });

  it('passes when AI_PROVIDER=kimi with KIMI_API_KEY', () => {
    const r = validateEnv({
      ...goodBase,
      AI_PROVIDER: 'kimi',
      KIMI_API_KEY: 'kimi-test',
    });
    expect(r.success).toBe(true);
  });

  it('passes when AI_PROVIDER=openai with OPENAI_API_KEY', () => {
    const r = validateEnv({
      ...goodBase,
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-openai',
    });
    expect(r.success).toBe(true);
  });

  it('reports all errors at once (does not short-circuit)', () => {
    const r = validateEnv({ JWT_SECRET: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) {
      // Should report missing DATABASE_URL, missing REDIS_URL, short JWT_SECRET
      expect(r.errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('formatValidationErrors produces a readable multi-line string', () => {
    const out = formatValidationErrors(['  - FOO: bad', '  - BAR: also bad']);
    expect(out).toContain('❌');
    expect(out).toContain('FOO: bad');
    expect(out).toContain('BAR: also bad');
    expect(out).toContain('backend/.env');
  });
});
