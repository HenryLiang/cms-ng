/**
 * SMOKE: confirms the test harness works end-to-end.
 *  - QA backend :3002 is reachable
 *  - dev frontend :3000 is reachable
 *  - login API returns a JWT for qa-admin@01.com
 *  - /dashboard loads with auth
 */
import { test, expect, ACCOUNTS, QA_API } from './_shared/fixtures';
import { loginByApi } from './_shared/fixtures';

test('smoke: backend health', async ({ request }) => {
  const r = await request.get(`${QA_API}/auth/login`, { failOnStatusCode: false });
  // any non-5xx response means the server is up
  expect([400, 401, 404, 405]).toContain(r.status());
});

test('smoke: login as qa-admin returns JWT', async () => {
  const { token, userId, email } = await loginByApi('admin');
  expect(token).toMatch(/^eyJ/);
  expect(userId).toMatch(/[0-9a-f-]{36}/i);
  expect(email).toBe(ACCOUNTS.admin.email);
});

test('smoke: dashboard renders for admin', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
  await ctx.route('**://localhost:3001/**', async (route) => {
    const original = route.request().url();
    return route.continue({ url: original.replace('localhost:3001', 'localhost:3002') });
  });
  const { token, userId, email } = await loginByApi('admin');
  const page = await ctx.newPage();
  await page.addInitScript(({ token, userId, email }) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { token, user: { id: userId, email }, isAuthenticated: true, _hasHydrated: true },
      version: 0,
    }));
  }, { token, userId, email });

  await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: 'tests/regression/screenshots/smoke-dashboard.png', fullPage: true });

  // Page should NOT redirect to /login (would happen on JWT failure)
  expect(page.url()).not.toMatch(/\/login$/);
  await ctx.close();
});
