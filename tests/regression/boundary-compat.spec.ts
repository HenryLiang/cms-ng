/**
 * 01 创作大脑 (CMS-NG) — 边界与兼容性测试
 * 覆盖：docs/qa/full-regression-v1.md §20 (TC-BDY-DB-001 / TC-BDY-DB-002 子集)
 * 范围：边界值（长度 / Unicode / 深度嵌套 / 大数组 / 标题极值）+ Chromium 兼容冒烟
 * TC ID 范围：TC-BND-LEN-001 / TC-BND-UNI-001 / TC-BND-NEST-001 / TC-BND-TAG-001
 *             TC-BND-TITLE-001 / TC-CMP-CHR-001
 *
 * 关键设计：
 *  1. 边界测试为「性质表征」类 — 实际行为可能是 200/201/400，需如实断言并标注。
 *  2. 不跳过失败 case — 任何失败都是真实发现。
 *  3. 数据前缀：qa-bnd-<random>
 *  4. 角色：reporter-sc（内容创建）/ admin（Chromium 冒烟）
 *  5. 不修改任何 qa-*@01.com 角色矩阵账号
 */
import { test, expect, QA_API } from './_shared/fixtures';
import { loginByApi } from './_shared/fixtures';

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const LONG_TIMEOUT = 120_000;
const DEFAULT_TIMEOUT = 60_000;

/** 创建一个 story 作为 article 的容器 */
async function bootstrapStory(token: string, tag: string): Promise<string> {
  const res = await fetch(`${QA_API}/stories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `${tag}-${uniqueSuffix()}` }),
  });
  if (!res.ok) {
    throw new Error(`bootstrapStory failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).id;
}

/** 创建一篇文章，返回 id（不检查 status — 由调用方断言） */
async function postArticle(
  token: string,
  body: any,
): Promise<{ status: number; responseJson: any; text: string }> {
  const res = await fetch(`${QA_API}/articles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* 留空 */ }
  return { status: res.status, responseJson: json, text };
}

/** GET /articles/:id — 返回完整响应 */
async function getArticleRaw(token: string, id: string): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${QA_API}/articles/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* 留空 */ }
  return { status: res.status, body, text };
}

// ===========================================================================
// §20.1 长度边界 — TC-BND-LEN-001
// ===========================================================================

test.describe('§20.1 长度边界 — 文章 content 10000 字符', () => {
  test('TC-BND-LEN-001: POST /articles with 10,000-char body → 持久化保留', async () => {
    test.setTimeout(LONG_TIMEOUT);
    const { token } = await loginByApi('reporter-sc');
    const storyId = await bootstrapStory(token, 'qa-bnd-len');
    const longBody = 'A'.repeat(10_000);
    const r = await postArticle(token, {
      storyId,
      title: `qa-bnd-len-10000`,
      content: longBody,
      status: 'DRAFT',
    });
    expect(r.status, `POST /articles must accept 10k body; got ${r.status} ${r.text.slice(0, 200)}`)
      .toBeLessThan(400);
    expect(r.responseJson?.id, 'response should contain article id').toBeTruthy();
    const id = r.responseJson.id;

    const got = await getArticleRaw(token, id);
    expect(got.status, `GET /articles/:id must succeed; got ${got.status}`).toBeLessThan(400);
    expect(typeof got.body?.content).toBe('string');
    expect(
      got.body.content.length,
      `body length should be >= 10,000; actual=${got.body?.content?.length}`,
    ).toBeGreaterThanOrEqual(10_000);
    // 强校验：前 100 字符 + 后 100 字符应原样保留（确认非截断）
    expect(got.body.content.slice(0, 100)).toBe('A'.repeat(100));
    expect(got.body.content.slice(-100)).toBe('A'.repeat(100));
  });
});

// ===========================================================================
// §20.1 Unicode 边界 — TC-BND-UNI-001
// ===========================================================================

test.describe('§20.1 Unicode 边界 — CJK + emoji + RTL 混合', () => {
  test('TC-BND-UNI-001: 标题/正文混合 Unicode 字符 → 字节级往返', async () => {
    test.setTimeout(DEFAULT_TIMEOUT);
    const { token } = await loginByApi('reporter-sc');
    const storyId = await bootstrapStory(token, 'qa-bnd-uni');
    const title = 'AI 编辑器 📝 阿拉伯文：مرحبا';
    const body =
      'AI 平台测试 ✓ 中文 ✓ English ✓ Emoji 🚀🎉💡 RTL: مرحبا بالعالم ' +
      '日本語：こんにちは 한국어：안녕하세요 ' +
      '混合：AI 编辑器 + AI Editor + محرر ذكي ' +
      '4-byte 字符：𝕐𝕆𝕌 𝕎𝕀𝕃𝕃 𝔹𝔼 𝕊𝕌ℂℂ𝔼𝔼𝔻𝔼𝔻';
    const r = await postArticle(token, {
      storyId,
      title,
      content: body,
      status: 'DRAFT',
    });
    expect(r.status, `POST /articles with Unicode must succeed; got ${r.status} ${r.text.slice(0, 200)}`)
      .toBeLessThan(400);
    const id = r.responseJson.id;

    const got = await getArticleRaw(token, id);
    expect(got.status).toBeLessThan(400);
    // 字节级往返
    expect(got.body?.title, 'title UTF-8 round-trip').toBe(title);
    expect(got.body?.content, 'content UTF-8 round-trip').toBe(body);
    // 长度一致
    expect(got.body.title.length).toBe(title.length);
    expect(got.body.content.length).toBe(body.length);
    // 编码正确性
    expect(got.body.title).toContain('📝');
    expect(got.body.title).toContain('مرحبا');
    expect(got.body.content).toContain('🚀');
    expect(got.body.content).toContain('𝕎𝕀𝕃𝕃');
  });
});

// ===========================================================================
// §20.1 深度嵌套 — TC-BND-NEST-001
// ===========================================================================

test.describe('§20.1 深度嵌套 — Story description', () => {
  test('TC-BND-NEST-001: Story description 含 10 层嵌套 JSON → 嵌套深度保留', async () => {
    test.setTimeout(DEFAULT_TIMEOUT);
    const { token } = await loginByApi('reporter-sc');
    // 构造 10 层嵌套：{a:{a:{a:...{a:"leaf"}...}}}
    const DEPTH = 10;
    type Nested = { a: Nested | string };
    let nested: any = 'qa-bnd-nest-leaf';
    for (let i = 0; i < DEPTH; i++) {
      nested = { a: nested, level: i };
    }
    const description = JSON.stringify(nested);

    const res = await fetch(`${QA_API}/stories`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `qa-bnd-nest-${uniqueSuffix()}`,
        description,
      }),
    });
    expect(res.status, `POST /stories must accept deep description; got ${res.status}`)
      .toBeLessThan(400);
    const created = await res.json();
    const id = created.id;

    // GET 回读
    const get = await fetch(`${QA_API}/stories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(get.status).toBeLessThan(400);
    const body = await get.json();

    // 验证 description 字段仍为字符串（如 JSON 解析失败被改写则 desc 可能为空）
    expect(typeof body.description).toBe('string');
    expect(body.description.length, 'description should not be empty').toBeGreaterThan(0);
    // 验证能解析为 10 层嵌套
    let parsed: any;
    try {
      parsed = JSON.parse(body.description);
    } catch (e: any) {
      throw new Error(`description not valid JSON after round-trip: ${e?.message}`);
    }
    // 沿 .a 链下钻 10 层
    let cur = parsed;
    let depth = 0;
    while (cur && typeof cur === 'object' && 'a' in cur) {
      depth++;
      cur = cur.a;
    }
    expect(depth, `expected 10-level nesting, got ${depth}`).toBe(DEPTH);
    expect(cur, 'leaf value should match').toBe('qa-bnd-nest-leaf');
  });
});

// ===========================================================================
// §20.1 大数组边界 — TC-BND-TAG-001
// ===========================================================================

test.describe('§20.1 大数组边界 — Article.tags 1000 项', () => {
  test('TC-BND-TAG-001: POST /articles with 1000 tags → safeJsonParse 路径保留全部', async () => {
    test.setTimeout(LONG_TIMEOUT);
    const { token } = await loginByApi('reporter-sc');
    const storyId = await bootstrapStory(token, 'qa-bnd-tag');
    const tags: string[] = [];
    for (let i = 0; i < 1000; i++) {
      tags.push(`qa-bnd-tag-${i.toString().padStart(4, '0')}`);
    }
    expect(tags.length).toBe(1000);

    const r = await postArticle(token, {
      storyId,
      title: `qa-bnd-tag-1000`,
      content: 'qa-bnd-tag content with 1000 tags',
      tags,
      status: 'DRAFT',
    });
    expect(r.status, `POST /articles with 1000 tags must succeed; got ${r.status} ${r.text.slice(0, 200)}`)
      .toBeLessThan(400);
    const id = r.responseJson.id;

    const got = await getArticleRaw(token, id);
    expect(got.status).toBeLessThan(400);
    expect(Array.isArray(got.body?.tags), 'tags should be an array').toBe(true);
    expect(got.body.tags.length, `tags length should be 1000; actual=${got.body.tags?.length}`)
      .toBe(1000);
    // 抽样：首/中/末
    expect(got.body.tags[0]).toBe('qa-bnd-tag-0000');
    expect(got.body.tags[499]).toBe('qa-bnd-tag-0499');
    expect(got.body.tags[999]).toBe('qa-bnd-tag-0999');
  });
});

// ===========================================================================
// §20.1 标题极值 — TC-BND-TITLE-001（性质表征）
// ===========================================================================

test.describe('§20.1 标题极值 — 500 字符 title', () => {
  test('TC-BND-TITLE-001: 500-char title → 接受 / 拒绝 行为表征', async () => {
    test.setTimeout(DEFAULT_TIMEOUT);
    // 侦察发现：CreateArticleDto.title 仅 @IsString() 无 @MaxLength；
    //           Prisma schema 中 title 字段类型为 String（默认 VARCHAR(191)）。
    //           预期：MySQL 列定义可能成为隐式上限。
    // 本用例为「性质表征」测试 — 不论接受/拒绝都通过，仅如实记录。
    const { token } = await loginByApi('reporter-sc');
    const storyId = await bootstrapStory(token, 'qa-bnd-title');
    const longTitle = 'T'.repeat(500);

    const r = await postArticle(token, {
      storyId,
      title: longTitle,
      content: 'qa-bnd-title content',
      status: 'DRAFT',
    });
    // 接受路径：200/201
    if (r.status >= 200 && r.status < 300) {
      test.info().annotations.push({
        type: 'bnd-title-outcome',
        description: `ACCEPTED (status=${r.status})`,
      });
      const id = r.responseJson.id;
      const got = await getArticleRaw(token, id);
      expect(got.status).toBeLessThan(400);
      // 标题应被存为原样（无 @MaxLength 截断）
      expect(
        got.body?.title?.length,
        `stored title length; expected 500, got ${got.body?.title?.length}`,
      ).toBe(500);
      expect(got.body.title).toBe(longTitle);
    } else {
      // 拒绝路径：400/422 等
      test.info().annotations.push({
        type: 'bnd-title-outcome',
        description: `REJECTED (status=${r.status})`,
      });
      // 不强求具体状态码 — 接受任何 4xx
      expect(r.status, `unexpected status: ${r.status} ${r.text}`).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
  });
});

// ===========================================================================
// §20.3 兼容性 — TC-CMP-CHR-001（Chromium 冒烟）
// ===========================================================================

test.describe('§20.3 兼容性 — Chromium dashboard 渲染', () => {
  test('TC-CMP-CHR-001: /dashboard/articles 在 Chromium 渲染且无 console.error', async ({
    pageWithQA,
  }) => {
    test.setTimeout(DEFAULT_TIMEOUT);
    // 用 admin 登录（注入 JWT 到 localStorage）
    const { token, userId, email } = await loginByApi('admin');
    await pageWithQA.addInitScript(({ token, userId, email }) => {
      try {
        localStorage.setItem('accessToken', token);
        localStorage.setItem('auth-storage', JSON.stringify({
          state: { token, user: { id: userId, email }, isAuthenticated: true, _hasHydrated: true },
          version: 0,
        }));
      } catch {}
    }, { token, userId, email });

    // 收集 console 消息
    const consoleErrors: string[] = [];
    pageWithQA.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    // 同时捕获 pageerror（未捕获的 JS 异常）
    const pageErrors: string[] = [];
    pageWithQA.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const resp = await pageWithQA.goto('/dashboard/articles', { waitUntil: 'networkidle' });
    expect(resp, 'navigation response should exist').not.toBeNull();
    expect(resp!.status(), `GET /dashboard/articles should be 2xx/3xx; got ${resp!.status()}`).toBeLessThan(400);

    // 等待主容器渲染（dashboard layout 必有 main 元素）
    await expect(pageWithQA.locator('main').first()).toBeVisible({ timeout: 15_000 });

    // 网络空闲后再等 1s — 捕获延迟 console.error
    await pageWithQA.waitForTimeout(1000);

    test.info().annotations.push({
      type: 'cmp-chr-console',
      description: `errors=${consoleErrors.length} pageerrors=${pageErrors.length}`,
    });

    // 断言：无 console.error
    if (consoleErrors.length > 0) {
      // 把每条 error 写到 annotations 里便于报告排查
      consoleErrors.forEach((e, i) => {
        test.info().annotations.push({
          type: `cmp-chr-console-error-${i}`,
          description: e.slice(0, 500),
        });
      });
    }
    expect(
      consoleErrors,
      `page should render with no console.error; found ${consoleErrors.length}: ${consoleErrors.join(' | ').slice(0, 500)}`,
    ).toEqual([]);

    // 同时：未捕获的 JS 异常也不应有
    expect(
      pageErrors,
      `page should have no uncaught pageerror; found ${pageErrors.length}: ${pageErrors.join(' | ').slice(0, 500)}`,
    ).toEqual([]);
  });
});
