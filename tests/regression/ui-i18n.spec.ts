/**
 * UI i18n regression (zh-CN default + en switch, NEXT_LOCALE cookie).
 *
 * Verifies:
 *  1. Default locale is zh-CN (no cookie) - login page renders Chinese.
 *  2. <html lang> follows the locale.
 *  3. LocaleSwitcher on the login page writes NEXT_LOCALE and reloads into English.
 *  4. English persists across navigation (cookie survives) and the dashboard
 *     nav renders English for an authenticated user.
 *  5. Switching back to zh-CN restores Chinese.
 *
 * Data isolation: read-only UI checks; the dashboard check uses the QA backend
 * via pageWithQA (network rewritten :3001 -> :3002) with the admin role.
 */
import { test, expect } from './_shared/fixtures';

test.describe('UI i18n locale switching', () => {
  test('default locale is zh-CN: login page renders Chinese + html lang=zh-CN', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
    await ctx.route('**://localhost:3001/**', async (route) => {
      const original = route.request().url();
      return route.continue({ url: original.replace('localhost:3001', 'localhost:3002') });
    });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    // No NEXT_LOCALE cookie set -> default zh-CN
    const cookie = await ctx.cookies();
    expect(cookie.find((c) => c.name === 'NEXT_LOCALE')).toBeUndefined();
    // html lang follows the locale
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    // Chinese form labels (exact copies from messages/zh-CN/auth.json)
    await expect(page.getByText('登录你的账户', { exact: true })).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test('switch to English on login page: NEXT_LOCALE cookie set, page reloads in English', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
    await ctx.route('**://localhost:3001/**', async (route) => {
      const original = route.request().url();
      return route.continue({ url: original.replace('localhost:3001', 'localhost:3002') });
    });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Open the LocaleSwitcher (top-right) and pick English.
    const switcher = page.getByRole('button', { name: /切换界面语言|Switch language/ });
    await switcher.waitFor({ state: 'visible', timeout: 20_000 });
    await switcher.click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    // location.reload() fires; wait for the English UI.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 20_000 });
    const cookie = await ctx.cookies();
    const localeCookie = cookie.find((c) => c.name === 'NEXT_LOCALE');
    expect(localeCookie?.value).toBe('en');
    // English title from messages/en/auth.json (key auth.login.title)
    await expect(page.getByText('Sign in to your account', { exact: true })).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test('english persists into the dashboard for an authenticated user', async ({ browser }) => {
    // Login via API on the QA backend, seed JWT, set NEXT_LOCALE=en before load.
    const { token, userId, email, role, name } = await (async () => {
      const { loginByApi } = await import('./_shared/fixtures');
      return loginByApi('admin');
    })();
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
    await ctx.route('**://localhost:3001/**', async (route) => {
      const original = route.request().url();
      return route.continue({ url: original.replace('localhost:3001', 'localhost:3002') });
    });
    await ctx.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3000' },
    ]);
    const page = await ctx.newPage();
    await page.addInitScript(({ token, userId, email, role, name }) => {
      localStorage.setItem('accessToken', token);
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { token, user: { id: userId, email, role, name }, isAuthenticated: true, _hasHydrated: true },
        version: 0,
      }));
    }, { token, userId, email, role, name });

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // Sidebar nav renders English (dashboard.nav.* from messages/en/dashboard.json)
    await expect(page.getByRole('link', { name: /^Workbench$/ })).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  test('switch back to zh-CN restores Chinese', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
    await ctx.route('**://localhost:3001/**', async (route) => {
      const original = route.request().url();
      return route.continue({ url: original.replace('localhost:3001', 'localhost:3002') });
    });
    await ctx.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3000' },
    ]);
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const switcher = page.getByRole('button', { name: /切换界面语言|Switch language/ });
    await switcher.waitFor({ state: 'visible', timeout: 20_000 });
    await switcher.click();
    await page.getByRole('button', { name: '简体中文', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN', { timeout: 20_000 });
    await expect(page.getByText('登录你的账户', { exact: true })).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });
});
