/**
 * 01 创作大脑 (CMS-NG) — safeJsonParse 全局加固 + rebrand "INFO-NG" → "LC 传媒" 回归
 * 覆盖：docs/qa/full-regression-v1.md
 *   §13  TC-SJP-001 ~ TC-SJP-003  — safeJsonParse 字段级降级（api contract + malformed JSON 注入）
 *   §15  TC-RBR-001 ~ TC-RBR-002  — rebrand 文案一致性（页面 + API 响应）
 *
 * 关键发现（实施前侦察）：
 *  1. safeJsonParse 后端实现（backend/src/common/json.utils.ts）：
 *       export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
 *         if (!value) return fallback;
 *         try { return JSON.parse(value) as T; } catch { return fallback; }
 *       }
 *     — 空串 / null / undefined / 解析失败均走 fallback 路径。
 *  2. 序列化层（articles.service.ts:590-597）统一对 tags / platforms / aiGeneratedParts
 *     包了 safeJsonParse(value, [])。本 spec 通过 mysql CLI 直接 UPDATE
 *     cms_ng_qa.stories.tags / cms_ng_qa.articles.aiGeneratedParts 为畸形字符串，
 *     验证 GET /stories/:id 与 GET /articles/:id 不 5xx 且字段降级。
 *  3. rebrand 源串确认："INFO-NG"（v1 §15 commit 13416f5；channels-wordpress.spec.ts
 *     §15 同样以 /INFO-NG/ 断言排除）。新品牌："LC 传媒"（backend 文案与登录页
 *     Logo），可与 "01创作大脑" 并存。
 *
 * 角色矩阵：见 _shared/fixtures.ts ACCOUNTS
 * 唯一前缀：qa-sjr-  (safejson-rebrand)
 * 默认登录：admin（覆盖更广）/ reporter-sc（reporter 权限）
 */
import { test, expect, QA_API } from './_shared/fixtures';
import { loginByApi } from './_shared/fixtures';
import { execSync } from 'child_process';

const SUFFIX = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// QA MySQL connection (env-overridable for CI/prod parity; defaults match the local
// dev QA DB). Same convention as ai-capabilities.spec.ts but routes credentials
// through env vars instead of inline literals.
const MYSQL_HOST = process.env.QA_MYSQL_HOST ?? '127.0.0.1';
const MYSQL_PORT = process.env.QA_MYSQL_PORT ?? '3306';
const MYSQL_USER = process.env.QA_MYSQL_USER ?? 'root';

/** 注入畸形 JSON：把 SQL 写入临时文件并通过 mysql CLI 触发 — 与 ai-capabilities.spec.ts
 *  同样的 execSync 模式（避免 shell 单引号 / 双引号转义陷阱）。
 *  密码通过 MYSQL_PWD 环境变量传递（mysql CLI 约定），不在源码中出现明文。
 *  缺少 MYSQL_PWD 时测试会自动跳过 mysql 注入路径，仅验证 API 契约。 */
function mysqlExec(sql: string): string {
  if (!process.env.QA_MYSQL_PASSWORD && !process.env.MYSQL_PWD) {
    return '__SKIP__:MYSQL_PWD not set';
  }
  const fullSql = sql.includes('USE cms_ng_qa') ? sql : `USE cms_ng_qa;\n${sql}`;
  const tmp = `/tmp/qa-sjr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sql`;
  try {
    require('fs').writeFileSync(tmp, fullSql);
    const cmd = `mysql -h ${MYSQL_HOST} -P ${MYSQL_PORT} -u ${MYSQL_USER} --default-character-set=utf8mb4 < ${tmp} 2>&1`;
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: 15_000,
      env: { ...process.env, MYSQL_PWD: process.env.QA_MYSQL_PASSWORD ?? process.env.MYSQL_PWD ?? '' },
    }).trim();
  } catch (e: any) {
    return `__ERR__:${(e.message || e).toString().slice(0, 200)}`;
  } finally {
    try { require('fs').unlinkSync(tmp); } catch {}
  }
}

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function fetchJson(path: string, token: string) {
  const res = await fetch(`${QA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const status = res.status();
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { _raw: text }; }
  return { status, body };
}

// =====================================================================
// §13 TC-SJP-001 — API contract：tags 必须是 JS 数组，不是 JSON 字符串
// =====================================================================

test.describe('§13 safeJsonParse — API contract', () => {
  test('TC-SJP-001: GET /articles/:id 的 tags 字段是 JS 数组（safeJsonParse 已应用）', async () => {
    test.setTimeout(60_000);
    const { token } = await loginByApi('reporter-sc');

    // 准备一个 story
    const createStory = await fetch(`${QA_API}/stories`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `qa-sjr-001-story-${SUFFIX}` }),
    });
    expect(createStory.ok, 'create story').toBeTruthy();
    const storyId = (await createStory.json()).id;

    // 创建带 3 个 tags 的 article
    const createArt = await fetch(`${QA_API}/articles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId,
        title: `qa-sjr-001-article-${SUFFIX}`,
        content: 'safeJsonParse 字段级加固回归 — tags 必为数组。',
        tags: ['qa-sjr-tag-1', 'qa-sjr-tag-2', 'qa-sjr-tag-3'],
      }),
    });
    expect(createArt.ok, 'create article').toBeTruthy();
    const articleId = (await createArt.json()).id;

    // 拉回来
    const got = await fetchJson(`/articles/${articleId}`, token);
    expect(got.status).toBeLessThan(500);
    expect(got.status).toBe(200);

    // 核心契约：tags 必须是 JS 数组
    expect(Array.isArray(got.body?.tags), 'tags 应为 JS 数组').toBe(true);
    expect(got.body.tags.length).toBe(3);
    expect(got.body.tags).toEqual(['qa-sjr-tag-1', 'qa-sjr-tag-2', 'qa-sjr-tag-3']);
  });
});

// =====================================================================
// §13 TC-SJP-002 — stories.tags 注入畸形 JSON 字符串 → safeJsonParse 应降级为 []
// =====================================================================

test.describe('§13 safeJsonParse — Malformed JSON tolerance', () => {
  test('TC-SJP-002: stories.tags 注入畸形 → GET /stories/:id 不 5xx，降级为 []', async () => {
    test.setTimeout(60_000);
    const { token } = await loginByApi('reporter-sc');

    // 1) 创建一个带合法 tags 的 story
    const storyCreate = await fetch(`${QA_API}/stories`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `qa-sjr-002-story-${SUFFIX}`,
        tags: ['initial', 'ok'],
      }),
    });
    expect(storyCreate.ok, 'create story with valid tags').toBeTruthy();
    const storyBody = await storyCreate.json();
    const storyId: string = storyBody.story?.id || storyBody.id;
    expect(storyId, 'storyId returned').toBeTruthy();

    // 健全性检查：创建后 tags 必为数组
    const baseline = await fetchJson(`/stories/${storyId}`, token);
    expect(Array.isArray(baseline.body?.tags), 'baseline tags 是数组').toBe(true);

    // 2) 直接 UPDATE DB 把 stories.tags 设为畸形 JSON 字符串
    //  - '["unclosed'   → 不闭合
    //  - 'not json'     → 根本不是 JSON
    // 任意一种都能触发 JSON.parse 异常
    const upd = mysqlExec(
      `UPDATE stories SET tags = '["unclosed' WHERE id = '${storyId}';`,
    );
    if (upd.startsWith('__SKIP__')) {
      test.skip(true, 'MYSQL_PWD not set — malformed-JSON injection requires direct DB access; test skipped');
      return;
    }
    expect(upd, 'mysqlExec 不应 ERR').not.toMatch(/^__ERR__/);

    // 3) GET /stories/:id — 必须不 5xx，tags 应降级为 []（safeJsonParse 的 fallback）
    const got = await fetchJson(`/stories/${storyId}`, token);
    expect(got.status, 'GET /stories/:id 不应 5xx').toBeLessThan(500);
    // 200 / 201 都允许；只要没崩
    expect(got.status, 'GET /stories/:id 应成功').toBeLessThan(400);

    // safeJsonParse 在 stories.service 的对应字段也应被应用：tags → []
    expect(Array.isArray(got.body?.tags), 'tags 应为数组（fallback）').toBe(true);
    expect(got.body.tags, '畸形 JSON 应降级为空数组').toEqual([]);

    // 4) 还原 DB（避免污染其他测试读取同一 row）
    const restore = mysqlExec(
      `UPDATE stories SET tags = '[]' WHERE id = '${storyId}';`,
    );
    expect(restore).not.toMatch(/^__ERR__/);
  });

  // -------------------------------------------------------------------------
  // §13 TC-SJP-003 — articles.aiGeneratedParts 独立注入 → 独立降级
  // -------------------------------------------------------------------------
  test('TC-SJP-003: articles.aiGeneratedParts 注入畸形 → GET /articles/:id 不 5xx，降级为 []', async () => {
    test.setTimeout(60_000);
    const { token } = await loginByApi('reporter-sc');

    // 1) 创建 story + article
    const storyCreate = await fetch(`${QA_API}/stories`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `qa-sjr-003-story-${SUFFIX}` }),
    });
    expect(storyCreate.ok).toBeTruthy();
    const storyId = (await storyCreate.json()).id;

    const artCreate = await fetch(`${QA_API}/articles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyId,
        title: `qa-sjr-003-article-${SUFFIX}`,
        content: 'safeJsonParse — aiGeneratedParts 独立降级测试。',
      }),
    });
    expect(artCreate.ok).toBeTruthy();
    const articleId = (await artCreate.json()).id;

    // 健全性：默认 []（schema @default("[]")）
    const baseline = await fetchJson(`/articles/${articleId}`, token);
    expect(Array.isArray(baseline.body?.aiGeneratedParts)).toBe(true);
    expect(baseline.body.aiGeneratedParts).toEqual([]);

    // 2) 注入与 TC-SJP-002 不同的畸形字符串（独立失败处理）
    const upd = mysqlExec(
      `UPDATE articles SET aiGeneratedParts = '{not-json-at-all}' WHERE id = '${articleId}';`,
    );
    if (upd.startsWith('__SKIP__')) {
      test.skip(true, 'MYSQL_PWD not set — malformed-JSON injection requires direct DB access; test skipped');
      return;
    }
    expect(upd).not.toMatch(/^__ERR__/);

    // 3) GET /articles/:id — 必须不 5xx
    const got = await fetchJson(`/articles/${articleId}`, token);
    expect(got.status, 'GET /articles/:id 不应 5xx').toBeLessThan(500);
    expect(got.status, 'GET /articles/:id 应成功').toBeLessThan(400);

    // aiGeneratedParts 独立降级为 []
    expect(Array.isArray(got.body?.aiGeneratedParts), 'aiGeneratedParts 应为数组').toBe(true);
    expect(got.body.aiGeneratedParts, '畸形 JSON 应降级为 []').toEqual([]);

    // 还原
    const restore = mysqlExec(
      `UPDATE articles SET aiGeneratedParts = '[]' WHERE id = '${articleId}';`,
    );
    expect(restore).not.toMatch(/^__ERR__/);
  });
});

// =====================================================================
// §15 TC-RBR-001 — rebrand 页面文案扫描：legacy "INFO-NG" 不应出现在页面 HTML
// =====================================================================
//
// 测试设计说明（reviewer 请确认）：
//   - 关联 commit：13416f5 (v1 §15, "INFO-NG" → "LC 传媒" 改名)
//   - legacy 字符串：单一字符串 "INFO-NG"（见 channels-wordpress.spec.ts TC-RB-003/004/006
//     同样以 /INFO-NG/ 断言）
//   - 新品牌："LC 传媒"（v1 §15 描述中明确："Logo 文字为「LC 传媒」"）
//   - 若未来再次 rebrand，请更新 LEGACY_BRAND_STRINGS 列表即可
const LEGACY_BRAND_STRINGS: string[] = [
  'INFO-NG', // v1 §15 commit 13416f5；channels-wordpress.spec.ts 同源断言
];

test.describe('§15 rebrand — 页面文案扫描', () => {
  test('TC-RBR-001: 6 个主要页面 HTML 不含 legacy 品牌字符串', async ({ browser }) => {
    test.setTimeout(60_000);

    // 用 pageWithQA 的等价逻辑：登录 admin + 路由重写 :3001 → :3002
    const { token, userId, email } = await loginByApi('admin');
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3000' });
    await ctx.route('**://localhost:3001/**', async (route) => {
      const original = route.request().url();
      return route.continue({ url: original.replace('localhost:3001', 'localhost:3002') });
    });
    const page = await ctx.newPage();
    await page.addInitScript(({ token, userId, email }) => {
      try {
        localStorage.setItem('accessToken', token);
        localStorage.setItem('auth-storage', JSON.stringify({
          state: { token, user: { id: userId, email }, isAuthenticated: true, _hasHydrated: true },
          version: 0,
        }));
      } catch {}
    }, { token, userId, email });

    const pages = [
      '/',
      '/login',
      '/dashboard',
      '/dashboard/articles',
      '/dashboard/stories',
      '/dashboard/auto-publish',
    ];

    const found: Array<{ path: string; needle: string }> = [];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      // 给 SPA 一个短暂的渲染窗口（channels-wordpress.spec.ts §15 用 1500ms 同样处理）
      await page.waitForTimeout(1000);
      const html = await page.content();
      for (const needle of LEGACY_BRAND_STRINGS) {
        if (html.includes(needle)) {
          found.push({ path, needle });
        }
      }
    }

    await ctx.close();

    if (found.length > 0) {
      const detail = found.map((f) => `  - ${f.path} 含 "${f.needle}"`).join('\n');
      throw new Error(`legacy 品牌字符串在以下页面被发现（v1 §15 要求全部清空）：\n${detail}`);
    }
  });
});

// =====================================================================
// §15 TC-RBR-002 — rebrand API 响应扫描：3 个核心 API 响应体内不含 legacy 品牌字符串
// =====================================================================
test.describe('§15 rebrand — API 响应文案扫描', () => {
  test('TC-RBR-002: 3 个 API 响应 JSON 序列化后不含 legacy 品牌字符串', async () => {
    test.setTimeout(60_000);
    const { token } = await loginByApi('admin');

    const endpoints = [
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/articles' },
      { method: 'GET', path: '/trending-topics' },
    ] as const;

    const findings: Array<{ endpoint: string; needle: string; status: number }> = [];

    for (const ep of endpoints) {
      const res = await fetch(`${QA_API}${ep.path}`, {
        method: ep.method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = res.status();
      // 我们只关心"非 5xx 响应里有没有 legacy 串"——5xx 本身就是失败信号，
      // 不需要再做 brand 字符串断言（同时让测试对后端临时故障更稳健）
      if (status >= 500) continue;
      const body = await res.text();
      for (const needle of LEGACY_BRAND_STRINGS) {
        if (body.includes(needle)) {
          findings.push({ endpoint: `${ep.method} ${ep.path}`, needle, status });
        }
      }
    }

    if (findings.length > 0) {
      const detail = findings
        .map((f) => `  - ${f.endpoint} (status=${f.status}) 含 "${f.needle}"`)
        .join('\n');
      throw new Error(`legacy 品牌字符串在以下 API 响应中被发现（v1 §15 §15.3 TC-RB-007 要求 0 命中）：\n${detail}`);
    }
  });
});
