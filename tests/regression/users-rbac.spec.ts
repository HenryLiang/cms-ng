/**
 * Full regression for §14 (User / RBAC 角色管理) from
 * docs/qa/full-regression-v1.md.
 *
 * Covered TC IDs: TC-USR-LST-001 ~ TC-USR-LST-003, TC-USR-RBAC-001 ~ TC-USR-RBAC-003
 *
 * Scope:
 *   - §14.1 用户 CRUD: ADMIN list (TC-USR-LST-001), editor sub-list (TC-USR-LST-002),
 *     REPORTER forbidden (TC-USR-LST-003).
 *   - §14.2 RBAC: REPORTER cannot approve (TC-USR-RBAC-001),
 *     EDITOR can approve (TC-USR-RBAC-002), ADMIN can approve and
 *     the article shows up in editor's review-queue (TC-USR-RBAC-003).
 *
 * Data isolation:
 *   - All created entities are prefixed qa-users-<random>
 *   - Cleanup runs at the end of every test (best-effort, ignores errors)
 *
 * CRITICAL: NEVER modify the role of any qa-*@01.com test account.
 * TC-USR-RBAC-001/002/003 create a fresh throwaway article (and story) for
 * the workflow and never touch the canonical seeded accounts.
 */
import { test, expect, ACCOUNTS, QA_API, loginByApi } from './_shared/fixtures';
import { request as pwRequest } from '@playwright/test';
import {
  uniqueSuffix,
  bootstrapStory,
  createArticle,
  patchArticle,
  reviewArticle,
  reviewQueue,
} from './_shared/api';

// ==================== helpers ====================

const SUFFIX = uniqueSuffix();
const CANONICAL_EMAILS = [
  'qa-admin@01.com',
  'qa-editor@01.com',
  'qa-reporter-sc@01.com',
  'qa-reporter-en@01.com',
  'qa-reporter-hk@01.com',
  'qa-reporter-none@01.com',
];

// Track created IDs for the afterAll cleanup.
const createdArticleIds: string[] = [];
const createdStoryIds: string[] = [];

function trackArticle(id: string) { createdArticleIds.push(id); }
function trackStory(id: string) { createdStoryIds.push(id); }

test.afterAll(async () => {
  const { token } = await loginByApi('admin');
  const r = await pwRequest.newContext({ baseURL: QA_API });
  try {
    for (const id of createdArticleIds) {
      await r.delete(`/articles/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    for (const id of createdStoryIds) {
      await r.delete(`/stories/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    }
  } finally { await r.dispose(); }
});

/**
 * Build an article that is sitting in PENDING_REVIEW (the state the article
 * enters immediately after a reporter submits it for review). The
 * /articles/review-queue endpoint reads `PENDING_REVIEW | IN_REVIEW`, so
 * PENDING_REVIEW is the minimum state the article must reach to appear in
 * the queue.
 */
async function createPendingReviewArticle(api: any, reporterToken: string, tag: string): Promise<string> {
  const storyId = await bootstrapStory(api, reporterToken, `qa-users-${tag}-story`);
  trackStory(storyId);
  const createRes = await createArticle(api, reporterToken, {
    storyId,
    title: `qa-users-${tag}-article`,
    content: '<p>Body for RBAC test</p>',
    status: 'DRAFT',
  });
  if (!createRes.ok()) {
    throw new Error(`createArticle failed: ${createRes.status()} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const articleId: string = created.id;
  trackArticle(articleId);
  // Reporter submits the article for review (DRAFT → PENDING_REVIEW).
  const submitRes = await patchArticle(api, reporterToken, articleId, { status: 'PENDING_REVIEW' });
  if (!submitRes.ok()) {
    throw new Error(`submit for review failed: ${submitRes.status()} ${await submitRes.text()}`);
  }
  return articleId;
}

/**
 * Move the article from PENDING_REVIEW → IN_REVIEW as the editor. This is
 * the state from which /articles/:id/review { decision: 'APPROVE' } is
 * accepted by the state machine (see articles.service.ts:54 VALID_TRANSITIONS
 * — only IN_REVIEW → APPROVED is allowed).
 */
async function moveToInReview(api: any, editorToken: string, articleId: string): Promise<void> {
  const r = await patchArticle(api, editorToken, articleId, { status: 'IN_REVIEW' });
  if (!r.ok()) {
    throw new Error(`PENDING_REVIEW → IN_REVIEW failed: ${r.status()} ${await r.text()}`);
  }
}

// =============================================================
// §14.1 用户列表 — TC-USR-LST-001 ~ TC-USR-LST-003
// =============================================================
test.describe('USR §14.1 user listing', () => {
  test('TC-USR-LST-001 ADMIN can GET /users (200) and response includes all 6 canonical qa-*@01.com accounts', async () => {
    const { token } = await loginByApi('admin');
    const r = await pwRequest.newContext({ baseURL: QA_API });
    try {
      const res = await r.get('/users', { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(6);
      // No passwordHash leaked
      for (const u of body) expect(u.passwordHash).toBeUndefined();
      // All 6 canonical accounts present
      const emails: string[] = body.map((u: any) => u.email);
      for (const email of CANONICAL_EMAILS) {
        expect(emails, `expected ${email} in /users list`).toContain(email);
      }
    } finally { await r.dispose(); }
  });

  test('TC-USR-LST-002 EDITOR can GET /users/editors (200) and the response includes qa-editor@01.com', async () => {
    const { token } = await loginByApi('editor');
    const r = await pwRequest.newContext({ baseURL: QA_API });
    try {
      const res = await r.get('/users/editors', { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      // All entries must be EDITOR role
      for (const u of body) expect(u.role).toBe('EDITOR');
      // qa-editor@01.com must be in the list
      const emails: string[] = body.map((u: any) => u.email);
      expect(emails).toContain('qa-editor@01.com');
    } finally { await r.dispose(); }
  });

  test('TC-USR-LST-003 REPORTER gets non-2xx from GET /users (403/401 forbidden by Roles guard)', async () => {
    const { token } = await loginByApi('reporter-sc');
    const r = await pwRequest.newContext({ baseURL: QA_API });
    try {
      const res = await r.get('/users', { headers: { Authorization: `Bearer ${token}` } });
      // UsersController declares @Roles(EDITOR, ADMIN) — REPORTER is rejected.
      // NestJS RolesGuard typically returns 403 Forbidden; 401 is also acceptable.
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      expect([401, 403]).toContain(res.status());
    } finally { await r.dispose(); }
  });
});

// =============================================================
// §14.2 RBAC — TC-USR-RBAC-001 ~ TC-USR-RBAC-003
// =============================================================
test.describe('USR §14.2 RBAC boundaries on /articles/:id/review', () => {
  test('TC-USR-RBAC-001 REPORTER PATCH /articles/:id/review {decision:APPROVE} → 403', async ({ api }) => {
    const { token: reporterToken } = await loginByApi('reporter-sc');
    // Use a fresh article so the test is isolated from any concurrent /articles/:id/review runs.
    const articleId = await createPendingReviewArticle(api, reporterToken, `rbac001-${SUFFIX}`);
    // Reporter calls the review endpoint — must be rejected by the Roles guard
    // (controller declares @Roles(EDITOR, ADMIN)).
    const r = await reviewArticle(api, reporterToken, articleId, { decision: 'APPROVE' });
    expect(r.status()).toBe(403);
    // The article must remain in PENDING_REVIEW (or wherever it was) — the
    // rejected request must NOT have advanced the state.
    const after = await api.get(`/articles/${articleId}`, {
      headers: { Authorization: `Bearer ${reporterToken}` },
    });
    expect(after.ok()).toBeTruthy();
    const body = await after.json();
    expect(body.status).not.toBe('APPROVED');
  });

  test('TC-USR-RBAC-002 EDITOR PATCH /articles/:id/review {decision:APPROVE} → 200', async ({ api }) => {
    const { token: reporterToken } = await loginByApi('reporter-sc');
    const { token: editorToken } = await loginByApi('editor');
    const articleId = await createPendingReviewArticle(api, reporterToken, `rbac002-${SUFFIX}`);
    // Move to IN_REVIEW so the state machine accepts APPROVE.
    await moveToInReview(api, editorToken, articleId);
    const r = await reviewArticle(api, editorToken, articleId, { decision: 'APPROVE' });
    expect(r.status()).toBe(200);
    const after = await api.get(`/articles/${articleId}`, {
      headers: { Authorization: `Bearer ${reporterToken}` },
    });
    const body = await after.json();
    expect(body.status).toBe('APPROVED');
  });

  test('TC-USR-RBAC-003 ADMIN can approve AND the submitted article shows up in editor review-queue', async ({ api }) => {
    const { token: reporterToken } = await loginByApi('reporter-sc');
    const { token: adminToken } = await loginByApi('admin');
    const { token: editorToken } = await loginByApi('editor');

    // 1) Reporter creates + submits the article (PENDING_REVIEW).
    const articleId = await createPendingReviewArticle(api, reporterToken, `rbac003-${SUFFIX}`);

    // 2) Editor's review-queue must list the newly-submitted article.
    const queueRes = await reviewQueue(api, editorToken);
    expect(queueRes.status()).toBe(200);
    const queueBody = await queueRes.json();
    const queue: any[] = Array.isArray(queueBody)
      ? queueBody
      : Array.isArray(queueBody?.data)
        ? queueBody.data
        : [];
    const queueIds: string[] = queue.map((a: any) => a.id);
    expect(queueIds, `expected article ${articleId} in editor review-queue`).toContain(articleId);

    // 3) Admin moves PENDING_REVIEW → IN_REVIEW and approves. ADMIN bypasses
    //    the editor-assignment check (see articles.service.ts:325 isAdmin()).
    const toInReview = await patchArticle(api, adminToken, articleId, { status: 'IN_REVIEW' });
    expect(toInReview.ok()).toBeTruthy();
    const approveRes = await reviewArticle(api, adminToken, articleId, { decision: 'APPROVE' });
    expect(approveRes.status()).toBe(200);
    const after = await api.get(`/articles/${articleId}`, {
      headers: { Authorization: `Bearer ${reporterToken}` },
    });
    const body = await after.json();
    expect(body.status).toBe('APPROVED');
  });
});
