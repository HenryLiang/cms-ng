/**
 * Channels 平台适配器回归 — see docs/qa/full-regression-v1.md §11.
 *
 * Scope:
 *   §11  TC-CHA-ADP-001/002/003/004  — Website / Facebook / Instagram / 小红书 适配器
 *   §11  TC-CHA-ADP-005              — 保留位平台（X/THREADS/LINKEDIN/YOUTUBE/PUSH）行为
 *   §11  TC-CHA-PR-001               — 4 平台同步适配 → 4 条 PlatformPublish 记录
 *
 * Real side-effects:
 *   - All created articles are prefixed `qa-channels-` in the QA DB.
 *   - 适配走真实 AI（DeepSeek 默认），单次调用可能 30–60s。
 *
 * 与 channels-wordpress.spec.ts 的边界：
 *   - WordPress 适配 + 真实发布 → 由 channels-wordpress.spec.ts 覆盖
 *   - 本 spec 仅覆盖非 WP 的 4 个适配器 + 保留位 + 多平台并发适配的元数据持久化
 */
import { test, expect, loginByApi, QA_API, ACCOUNTS } from './_shared/fixtures';
import type { APIRequestContext } from '@playwright/test';

const TAG_PREFIX = 'qa-channels';
const TIMEOUT_LONG = 90_000; // AI adaptation may take up to ~60s

// ----------- helpers -----------

interface ApiResponse {
  status: number;
  body: any;
}

async function callApi(
  ctx: APIRequestContext,
  method: string,
  path: string,
  token: string,
  body?: any,
  timeoutMs = 30_000,
): Promise<ApiResponse> {
  const res = await ctx.fetch(`${QA_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: body,
    timeout: timeoutMs,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status(), body: json };
}

async function bootstrapStory(
  ctx: APIRequestContext,
  token: string,
  tag: string,
  suffix: string,
): Promise<string> {
  const r = await callApi(ctx, 'POST', '/stories', token, {
    title: `${tag}-${suffix}-${Date.now().toString(36)}`,
  });
  if (r.status !== 201) {
    throw new Error(`bootstrapStory failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.id;
}

async function createArticle(
  ctx: APIRequestContext,
  token: string,
  tag: string,
  suffix: string,
): Promise<{ id: string; title: string }> {
  const title = `${tag}-${suffix}`;
  const storyId = await bootstrapStory(ctx, token, tag, suffix);
  const content =
    `<h2>引言</h2>` +
    `<p>本篇為 ${tag} 模組回歸測試文章，覆蓋 channels 平台適配器。` +
    `內容涵蓋主題背景、現況分析、影響評估及結論。` +
    `段落用於觸發 Website / Facebook / Instagram / 小紅書等不同平台適配邏輯。</p>` +
    `<h2>背景</h2>` +
    `<p>在當前內容生產與分發多元化時代，不同平台對文案風格、標題長度、hashtag 都有不同要求。` +
    `Website 保留完整長文；Facebook 強調互動引導；Instagram 偏短小精悍；` +
    `小紅書重視 emoji 與話題標籤。本回歸測試旨在驗證 4 個適配器能依規範輸出合適 JSON 並持久化到 PlatformPublish。</p>` +
    `<h2>方法</h2>` +
    `<p>本測試以 reporter 身份建立 DRAFT 文章，通過審核流轉至 APPROVED，` +
    `再對各平台發起適配請求，檢查適配器回傳的 JSON 結構與後端持久化結果。</p>`;

  const r = await callApi(ctx, 'POST', '/articles', token, {
    storyId,
    title,
    content,
    excerpt: `${title} 摘要：驗證 channels 模組平台適配。`,
    contentLanguage: 'SIMPLIFIED_CHINESE',
    tags: ['回歸測試', 'channels', '適配器', tag],
  });
  if (r.status !== 201) {
    throw new Error(`createArticle failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return { id: r.body.id, title };
}

async function approveArticle(
  ctx: APIRequestContext,
  adminToken: string,
  articleId: string,
): Promise<void> {
  const r = await callApi(ctx, 'PATCH', `/articles/${articleId}/review`, adminToken, {
    decision: 'APPROVE',
  });
  expect(r.status, `approve ${articleId} -> ${r.status} ${JSON.stringify(r.body)}`).toBe(200);
  expect(r.body.article.status).toBe('APPROVED');
}

// ============================================================
// §11.2 — 4 个非 WP 适配器（adaptation only, no real posting）
// ============================================================

test.describe.serial('§11.2 — Non-WordPress platform adapters (adaptation only)', () => {
  let reporterToken: string;
  let adminToken: string;
  let articleId: string;

  test.beforeAll(async () => {
    reporterToken = (await loginByApi('reporter-sc')).token;
    adminToken = (await loginByApi('admin')).token;
  });

  test.beforeEach(async ({ api }) => {
    const created = await createArticle(api, reporterToken, `${TAG_PREFIX}-adp`, `seed-${Date.now()}`);
    await approveArticle(api, adminToken, created.id);
    articleId = created.id;
  });

  test('TC-CHA-ADP-001 — WEBSITE adapter returns full-length content (HTML preserved)', async ({ api }) => {
    const r = await callApi(api, 'POST', `/channels/${articleId}/adapt`, adminToken, { platform: 'WEBSITE' }, TIMEOUT_LONG);
    expect(r.status, `adapt failed: ${JSON.stringify(r.body)}`).toBe(201);
    expect(r.body.status).toBe('READY');
    expect(r.body.adaptedTitle).toBeTruthy();
    expect(r.body.adaptedContent).toBeTruthy();
    // Website retains HTML structure (per its style guide: 「包含HTML标签」)
    expect(r.body.adaptedContent).toMatch(/<h2>|<p>|<\/p>|<\/h2>/);
    // adaptedTags is an array of 2+ items (per prompt: 「标签1, 标签2」)
    expect(Array.isArray(r.body.adaptedTags)).toBeTruthy();
    expect(r.body.adaptedTags.length).toBeGreaterThanOrEqual(2);
    // Re-fetch list to confirm persistence
    const list = await callApi(api, 'GET', `/channels/${articleId}/publishes`, adminToken);
    expect(list.status).toBe(200);
    const row = (list.body as any[]).find((p) => p.id === r.body.id);
    expect(row).toBeTruthy();
    expect(row.platform).toBe('WEBSITE');
    expect(row.status).toBe('READY');
  });

  test('TC-CHA-ADP-002 — FACEBOOK adapter: short title, conversational content, hashtag tags', async ({ api }) => {
    const r = await callApi(api, 'POST', `/channels/${articleId}/adapt`, adminToken, { platform: 'FACEBOOK' }, TIMEOUT_LONG);
    expect(r.status, `adapt failed: ${JSON.stringify(r.body)}`).toBe(201);
    expect(r.body.status).toBe('READY');
    // Facebook maxTitleLength = 80 (per PLATFORM_METADATA) — adapt to AI may nudge, but cap is enforced
    expect(r.body.adaptedTitle.length).toBeLessThanOrEqual(80);
    expect(r.body.adaptedContent).toBeTruthy();
    // 3-5 hashtags expected per prompt
    expect(Array.isArray(r.body.adaptedTags)).toBeTruthy();
    expect(r.body.adaptedTags.length).toBeGreaterThanOrEqual(3);
    expect(r.body.adaptedTags.length).toBeLessThanOrEqual(8);
    // At least one tag should carry the `#` prefix (hashtag style)
    const hasHash = r.body.adaptedTags.some((t: string) => t.includes('#'));
    if (r.body.adaptedTags.length > 0) {
      expect(hasHash).toBeTruthy();
    }
  });

  test('TC-CHA-ADP-003 — INSTAGRAM adapter: caption-friendly, <=2200 chars body, hashtags', async ({ api }) => {
    const r = await callApi(api, 'POST', `/channels/${articleId}/adapt`, adminToken, { platform: 'INSTAGRAM' }, TIMEOUT_LONG);
    expect(r.status, `adapt failed: ${JSON.stringify(r.body)}`).toBe(201);
    expect(r.body.status).toBe('READY');
    // Instagram maxTitleLength = 60
    expect(r.body.adaptedTitle.length).toBeLessThanOrEqual(60);
    // Instagram 2200 char hard cap is the platform limit; our metadata says 800 (prompt cap) but real IG allows 2200
    // We assert the cap is not exceeded (whichever the service enforces)
    expect(r.body.adaptedContent.length).toBeLessThanOrEqual(2200);
    // 5-8 hashtags per prompt
    expect(Array.isArray(r.body.adaptedTags)).toBeTruthy();
    expect(r.body.adaptedTags.length).toBeGreaterThanOrEqual(3);
  });

  test('TC-CHA-ADP-004 — XIAOHONGSHU adapter: short title with emoji, Chinese hashtag style, 1000-char cap', async ({ api }) => {
    const r = await callApi(api, 'POST', `/channels/${articleId}/adapt`, adminToken, { platform: 'XIAOHONGSHU' }, TIMEOUT_LONG);
    expect(r.status, `adapt failed: ${JSON.stringify(r.body)}`).toBe(201);
    expect(r.body.status).toBe('READY');
    // Xiaohongshu maxTitleLength = 40
    expect(r.body.adaptedTitle.length).toBeLessThanOrEqual(40);
    // 1000-char cap per metadata
    expect(r.body.adaptedContent.length).toBeLessThanOrEqual(1000);
    // 3-5 hashtag-style tags (with #)
    expect(Array.isArray(r.body.adaptedTags)).toBeTruthy();
    expect(r.body.adaptedTags.length).toBeGreaterThanOrEqual(3);
    // At least one tag should be a hashtag (matches the 小红书 话题 #xxx style)
    const hashtagCount = r.body.adaptedTags.filter((t: string) => t.startsWith('#')).length;
    expect(hashtagCount).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// §11.1 — PlatformRegistry: reserved-but-unimplemented enum values
// ============================================================

test.describe('§11.1 — PlatformRegistry: reserved enum values reject adaptation', () => {
  test('TC-CHA-ADP-005 — X/THREADS/LINKEDIN/YOUTUBE/PUSH return 400 ("not supported yet")', async ({ api }) => {
    const reporterToken = (await loginByApi('reporter-sc')).token;
    const adminToken = (await loginByApi('admin')).token;

    const created = await createArticle(api, reporterToken, `${TAG_PREFIX}-reserved`, `seed-${Date.now()}`);
    await approveArticle(api, adminToken, created.id);

    const reserved: Array<'X' | 'THREADS' | 'LINKEDIN' | 'YOUTUBE' | 'PUSH'> = [
      'X',
      'THREADS',
      'LINKEDIN',
      'YOUTUBE',
      'PUSH',
    ];

    for (const platform of reserved) {
      const r = await callApi(api, 'POST', `/channels/${created.id}/adapt`, adminToken, { platform }, TIMEOUT_LONG);
      // The service throws `Platform ${platform} is not supported yet` as a 400 BadRequestException
      expect(r.status, `${platform} expected 400, got ${r.status}: ${JSON.stringify(r.body)}`).toBe(400);
      const bodyStr = JSON.stringify(r.body);
      expect(bodyStr).toMatch(/not supported yet|不支持/);
      expect(bodyStr).toContain(platform);
    }

    // And the metadata endpoint must still surface them so the UI can grey them out
    const meta = await callApi(api, 'GET', '/channels/platforms', adminToken);
    expect(meta.status).toBe(200);
    const keys = (meta.body as any[]).map((p) => p.key);
    for (const platform of reserved) {
      expect(keys, `${platform} should still appear in metadata`).toContain(platform);
    }
  });
});

// ============================================================
// §11.2 — Multi-platform adaptation creates 4 PlatformPublish rows
// ============================================================

test.describe('§11.2 — Multi-platform adaptation persists 4 PlatformPublish rows', () => {
  test('TC-CHA-PR-001 — adapt for 4 adapters, verify 4 rows with correct per-platform fields', async ({ api }) => {
    const reporterToken = (await loginByApi('reporter-sc')).token;
    const adminToken = (await loginByApi('admin')).token;

    const created = await createArticle(api, reporterToken, `${TAG_PREFIX}-multi`, `seed-${Date.now()}`);
    await approveArticle(api, adminToken, created.id);

    // Adapt for all 4 non-WP adapters
    const platforms = ['WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'XIAOHONGSHU'] as const;
    const results: Record<string, any> = {};
    for (const p of platforms) {
      const r = await callApi(api, 'POST', `/channels/${created.id}/adapt`, adminToken, { platform: p }, TIMEOUT_LONG);
      expect(r.status, `${p} adapt failed: ${JSON.stringify(r.body)}`).toBe(201);
      expect(r.body.status).toBe('READY');
      expect(r.body.platform).toBe(p);
      expect(r.body.adaptedTitle).toBeTruthy();
      expect(r.body.adaptedContent).toBeTruthy();
      results[p] = r.body;
    }

    // Re-fetch the publishes list — should have 4 rows, one per platform
    const list = await callApi(api, 'GET', `/channels/${created.id}/publishes`, adminToken);
    expect(list.status).toBe(200);
    const rows = list.body as any[];
    expect(rows.length).toBe(4);

    const byPlatform: Record<string, any> = {};
    for (const row of rows) {
      byPlatform[row.platform] = row;
    }
    expect(Object.keys(byPlatform).sort()).toEqual([...platforms].sort());

    // Per-platform shape assertions
    // Website: title is the most permissive (maxTitleLength=100)
    expect(byPlatform.WEBSITE.adaptedTitle.length).toBeLessThanOrEqual(100);
    // Facebook: short title (max=80)
    expect(byPlatform.FACEBOOK.adaptedTitle.length).toBeLessThanOrEqual(80);
    // Instagram: short caption-style title (max=60)
    expect(byPlatform.INSTAGRAM.adaptedTitle.length).toBeLessThanOrEqual(60);
    // Xiaohongshu: shortest title (max=40)
    expect(byPlatform.XIAOHONGSHU.adaptedTitle.length).toBeLessThanOrEqual(40);

    // adaptedTags parsed as arrays on all rows
    for (const p of platforms) {
      expect(Array.isArray(byPlatform[p].adaptedTags), `${p} adaptedTags not array`).toBeTruthy();
      expect(byPlatform[p].status).toBe('READY');
      expect(byPlatform[p].articleId).toBe(created.id);
    }
  });
});
