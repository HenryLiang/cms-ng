/**
 * Regression for the admin-controlled registration on/off switch.
 *
 * Verifies:
 *  - GET /auth/registration/status is public and reflects default-open (true)
 *  - POST /auth/register works while open, returns 403 (Chinese msg) when closed
 *  - POST /auth/registration/toggle is ADMIN-only (REPORTER → 403)
 *  - closing registration does NOT block login (gate is register-only)
 *  - admin can reopen and registration works again
 *
 * Data isolation:
 *  - Throwaway users are prefixed qa-reg-<suffix>@01.com
 *  - afterAll always restores registration to OPEN (the QA default) so other
 *    specs that register users are unaffected, even if a test fails midway.
 *
 * NOTE: the backend register() uses the dev DEFAULT_PASSWORD_HASH ("123456")
 * regardless of the submitted password, so this spec never logs in as a freshly
 * registered user — it uses the canonical seeded accounts to assert login works.
 */
import { test, expect, loginByApi, QA_API } from './_shared/fixtures';
import { request as pwRequest } from '@playwright/test';
import { uniqueSuffix } from './_shared/api';

const SUFFIX = uniqueSuffix();

/** Always leave the QA env with registration OPEN (its default state). */
async function ensureRegistrationOpen() {
  const ctx = await pwRequest.newContext({ baseURL: QA_API });
  try {
    const { token } = await loginByApi('admin');
    await ctx.post('/auth/registration/toggle', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: true },
    });
  } finally {
    await ctx.dispose();
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('Registration switch (admin-controlled)', () => {
  test.afterAll(async () => {
    await ensureRegistrationOpen();
  });

  test('status is public and default-open', async ({ api }) => {
    const res = await api.get('/auth/registration/status');
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ registrationOpen: true });
  });

  test('registration succeeds while open', async ({ api }) => {
    const res = await api.post('/auth/register', {
      data: {
        email: `qa-reg-open-${SUFFIX}@01.com`,
        name: 'QA Reg Open',
        password: 'Test@2026',
      },
    });
    expect(res.status()).toBe(201);
  });

  test('admin can close registration', async ({ api }) => {
    const { token } = await loginByApi('admin');
    const res = await api.post('/auth/registration/toggle', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: false, reason: 'e2e 收口' },
    });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ registrationOpen: false });
  });

  test('registration is rejected (403) while closed', async ({ api }) => {
    const res = await api.post('/auth/register', {
      data: {
        email: `qa-reg-closed-${SUFFIX}@01.com`,
        name: 'QA Reg Closed',
        password: 'Test@2026',
      },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.message).toContain('注册功能已关闭');
  });

  test('non-admin cannot toggle (403)', async ({ api }) => {
    const { token } = await loginByApi('reporter-sc');
    const res = await api.post('/auth/registration/toggle', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test('login still works while registration is closed', async () => {
    // Canonical seeded account — proves the gate is register-only, not login.
    await expect(loginByApi('reporter-sc')).resolves.toEqual(
      expect.objectContaining({ token: expect.any(String) }),
    );
  });

  test('admin can reopen and registration works again', async ({ api }) => {
    const { token } = await loginByApi('admin');
    const res = await api.post('/auth/registration/toggle', {
      headers: { Authorization: `Bearer ${token}` },
      data: { enabled: true },
    });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ registrationOpen: true });

    const reg = await api.post('/auth/register', {
      data: {
        email: `qa-reg-reopen-${SUFFIX}@01.com`,
        name: 'QA Reg Reopen',
        password: 'Test@2026',
      },
    });
    expect(reg.status()).toBe(201);
  });
});
