/**
 * Shared Playwright fixtures for the full-project regression suite.
 *
 * Key behaviors:
 *  - loginAs(role) → logs in via UI, returns storageState with JWT in localStorage
 *  - apiContext → a Playwright APIRequestContext pinned to QA backend :3002
 *  - page      → dev frontend :3000 with network route() that rewrites :3001 → :3002
 *
 * Routes (QA) bases:
 *  - Frontend (existing dev):  http://localhost:3000
 *  - Backend  (QA, fresh DB):  http://localhost:3002
 *  - Dev backend (NOT USED):   http://localhost:3001  (intentionally bypassed)
 */
import { test as base, expect, Page, APIRequestContext, request as pwRequest } from '@playwright/test';

export type Role = 'admin' | 'editor' | 'reporter-sc' | 'reporter-en' | 'reporter-hk' | 'reporter-none';

export interface AccountMap {
  email: string;
  password: string;
}

export const ACCOUNTS: Record<Role, AccountMap> = {
  admin:           { email: 'qa-admin@01.com',          password: 'Test@2026' },
  editor:          { email: 'qa-editor@01.com',         password: 'Test@2026' },
  'reporter-sc':   { email: 'qa-reporter-sc@01.com',    password: 'Test@2026' },
  'reporter-en':   { email: 'qa-reporter-en@01.com',    password: 'Test@2026' },
  'reporter-hk':   { email: 'qa-reporter-hk@01.com',    password: 'Test@2026' },
  'reporter-none': { email: 'qa-reporter-none@01.com',  password: 'Test@2026' },
};

export const QA_API = 'http://localhost:3002';

/**
 * Acquire a JWT by hitting the QA backend directly.
 * Faster and more deterministic than driving the login form.
 */
export async function loginByApi(role: Role): Promise<{ token: string; userId: string; email: string }> {
  const ctx = await pwRequest.newContext({ baseURL: QA_API });
  const res = await ctx.post('/auth/login', { data: ACCOUNTS[role] });
  if (!res.ok()) {
    throw new Error(`loginByApi(${role}) failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  await ctx.dispose();
  return { token: body.accessToken, userId: body.user.id, email: body.user.email };
}

type Fixtures = {
  api: APIRequestContext;
  loginAs: (role: Role) => Promise<{ token: string; userId: string; email: string }>;
  pageWithQA: Page;
};

export const test = base.extend<Fixtures>({
  api: async ({}, use) => {
    const ctx = await pwRequest.newContext({ baseURL: QA_API });
    await use(ctx);
    await ctx.dispose();
  },
  loginAs: async ({}, use) => {
    await use(async (role) => loginByApi(role));
  },
  /**
   * A Page that:
   *  - points at the dev frontend (:3000)
   *  - has every call to :3001 silently rewritten to :3002 (QA backend)
   *  - has the JWT pre-seeded into localStorage if `as` is provided via test.use()
   */
  pageWithQA: async ({ browser, baseURL }, use, testInfo) => {
    const roleAnnotation = (testInfo.annotations.find((a) => a.type === 'role')?.type || '') as Role | '';
    const ctx = await browser.newContext({ baseURL });

    // Rewrite every dev-backend call to the QA backend.
    await ctx.route('**://localhost:3001/**', async (route) => {
      const original = route.request().url();
      const rewritten = original.replace('localhost:3001', 'localhost:3002');
      return route.continue({ url: rewritten });
    });

    const page = await ctx.newPage();

    if (roleAnnotation && ACCOUNTS[roleAnnotation as Role]) {
      const { token, userId, email } = await loginByApi(roleAnnotation as Role);
      // Seed JWT into localStorage before any app code runs.
      // Keys match frontend/src/store/auth-store.ts: name='auth-storage' + 'accessToken' raw key.
      await page.addInitScript(({ token, userId, email }) => {
        try {
          localStorage.setItem('accessToken', token);
          localStorage.setItem('auth-storage', JSON.stringify({
            state: { token, user: { id: userId, email }, isAuthenticated: true, _hasHydrated: true },
            version: 0,
          }));
        } catch {}
      }, { token, userId, email });
    }

    await use(page);
    await ctx.close();
  },
});

export { expect };
