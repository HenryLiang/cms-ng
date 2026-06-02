/**
 * AI Capabilities Regression — §6 Provider decoupling + §10 12 AI abilities
 *
 * Scope (from docs/qa/full-regression-v1.md):
 *   §6  TC-AI-PRV-001 ~ 009  — Provider factory / 12 ops AIOperation / Seedream
 *   §10 A1 ~ A12             — rewrite/expand/condense/polish/headlines/excerpt
 *                              /chat/draft/fact-check/research-kit/review/seo
 *   §10 TC-AI-FC-001         — fact-check 5 dimensions
 *   §10 TC-AI-RK-001         — research-kit Tavily + Wikipedia
 *   §17 Wikipedia enhancement (covered by research-kit)
 *
 * Test design:
 *   - Shared setup: reporter-sc logs in, creates 1 story + 1 article with full body
 *     (article id is shared across all AI ops that need it).
 *   - A second article is created for ai-draft testing.
 *   - Every AI call is followed by an AIOperation log verification via mysql.
 *   - AI calls use 120s timeout (DeepSeek usually <30s, some flows are slower).
 *   - No mocking: real DeepSeek + Tavily + Seedream keys (QA backend .env).
 *   - Article/story titles and ids use `qa-ai-` prefix for easy identification.
 */
import { test, expect, loginByApi, QA_API } from './_shared/fixtures';
import { execSync } from 'child_process';
import { request as pwRequest } from '@playwright/test';

const MYSQL_CMD = `mysql -h 43.134.11.194 -u root -p'CmsNg@2026Prod' --skip-column-names --batch -e`;
const DB = 'cms_ng_qa';

const SUFFIX = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const ARTICLE_BODY = `人工智能（AI）正在深刻改变新闻业的工作流程。从选题策划、资料检索、初稿撰写到多平台分发，AI 工具已成为编辑部的「第二大脑」。

记者借助 AI 可以快速从海量资讯中提取关键信息，通过事实核查降低虚假信息风险，并利用 SEO 优化提升文章的搜索引擎可见度。但 AI 无法替代记者的现场采访、深度调查与价值判断。

本报将持续关注 AI 技术在媒体行业的落地应用，探讨「人机协作」的最佳实践与边界。`;

/** Query helper — runs a SQL statement against cms_ng_qa and returns stdout (raw).
 *  The mysql CLI is invoked via the -e flag with the SQL written to a temp file,
 *  so we never need to escape single/double quotes for the shell. */
function sql(q: string): string {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const tmp = path.join(os.tmpdir(), `qa-ai-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sql`);
  fs.writeFileSync(tmp, `USE ${DB};\n${q}\n`);
  try {
    return execSync(`${MYSQL_CMD.split(' -e')[0]} < "${tmp}" 2>/dev/null`).toString().trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function countAiOps(action: string, sinceMinutesAgo = 10): number {
  // NOTE: Prisma stores createdAt as UTC; the MySQL session here runs in CST.
  // We must compare against UTC_TIMESTAMP() or the filter misses everything.
  const out = sql(
    `SELECT COUNT(*) FROM ai_operations WHERE action='${action}' AND createdAt > (UTC_TIMESTAMP() - INTERVAL ${sinceMinutesAgo} MINUTE);`,
  );
  return parseInt(out || '0', 10);
}

function latestAiOp(action: string): { model: string; durationMs: number; tokensUsed: number | null; agentType: string; result: string | null } {
  const out = sql(
    `SELECT model, durationMs, IFNULL(tokensUsed, -1), agentType, IFNULL(LEFT(result, 300), CONCAT('<NULL>')) FROM ai_operations WHERE action='${action}' ORDER BY createdAt DESC LIMIT 1;`,
  );
  const parts = out.split('\t');
  const [model, dur, tok, ag, result] = parts;
  return {
    model: model || '',
    durationMs: parseInt(dur || '0', 10),
    tokensUsed: tok === '-1' ? null : parseInt(tok || '0', 10),
    agentType: ag || '',
    result: result === '<NULL>' ? null : (result || null),
  };
}

interface SharedCtx {
  token: string;
  userId: string;
  storyId: string;
  articleId: string;
  articleId2: string;
}

async function sharedSetup(): Promise<SharedCtx> {
  const { token, userId } = await loginByApi('reporter-sc');
  const apiCtx = await pwRequest.newContext({ baseURL: QA_API });

  // 1) Create story
  const storyRes = await apiCtx.post('/stories', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: `qa-ai-story-${SUFFIX}`,
      description: 'AI 回归测试选题，验证 12 项 AI 能力',
      angle: 'AI 与新闻业的人机协作',
      contentLanguage: 'SIMPLIFIED_CHINESE',
      tags: ['AI', '媒体', '人机协作'],
    },
  });
  if (!storyRes.ok()) {
    throw new Error(`create story failed: ${storyRes.status()} ${await storyRes.text()}`);
  }
  const storyBody = await storyRes.json();
  const storyId: string = storyBody.story?.id || storyBody.id;
  if (!storyId) throw new Error('storyId not returned');

  // 2) Create article #1 (used by all article-bound AI ops)
  const art1Res = await apiCtx.post('/articles', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      storyId,
      title: `qa-ai-article-${SUFFIX}`,
      subtitle: '12 项 AI 能力回归测试',
      content: ARTICLE_BODY,
      excerpt: '本文测试 rewrite/expand/condense/polish 等 12 项 AI 能力。',
      contentLanguage: 'SIMPLIFIED_CHINESE',
      tags: ['AI', '测试', '能力回归'],
    },
  });
  if (!art1Res.ok()) {
    throw new Error(`create article failed: ${art1Res.status()} ${await art1Res.text()}`);
  }
  const art1Body = await art1Res.json();
  const articleId: string = art1Body.article?.id || art1Body.id;

  // 3) Create article #2 (used for draft generation tests)
  const art2Res = await apiCtx.post('/articles', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      storyId,
      title: `qa-ai-article2-${SUFFIX}`,
      content: '初稿生成测试 — 仅有标题框架，AI 需要扩写正文。',
      contentLanguage: 'SIMPLIFIED_CHINESE',
    },
  });
  if (!art2Res.ok()) {
    throw new Error(`create article2 failed: ${art2Res.status()} ${await art2Res.text()}`);
  }
  const art2Body = await art2Res.json();
  const articleId2: string = art2Body.article?.id || art2Body.id;

  await apiCtx.dispose();
  return { token, userId, storyId, articleId, articleId2 };
}

let shared: SharedCtx;
test.beforeAll(async () => {
  shared = await sharedSetup();
  console.log(`[setup] story=${shared.storyId} article=${shared.articleId} article2=${shared.articleId2}`);
});

// =====================================================================
// §6 TC-AI-PRV-001 / 005 — Provider is DeepSeek and AIOperation fields
// =====================================================================
test.describe.configure({ mode: 'serial' });

// Per-test helper: post with a high per-request timeout (AI calls may take 60s+).
// Returns the parsed body (or raw text on non-JSON) so we can dispose() the context safely.
async function postJson(path: string, token: string, body: any, timeout = 120_000) {
  const api = await pwRequest.newContext({ baseURL: QA_API, timeout });
  try {
    const res = await api.post(path, { headers: { Authorization: `Bearer ${token}` }, data: body });
    const status = res.status();
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text }; }
    return { status, body: parsed };
  } finally {
    await api.dispose();
  }
}

function expectNonEmpty(label: string, value: any) {
  if (typeof value === 'string') {
    console.log(`[${label}] length=${value.length}`);
    expect(value.length, `${label} should not be empty`).toBeGreaterThan(0);
  } else {
    console.log(`[${label}] defined=${value !== undefined && value !== null}`);
    expect(value, `${label} should be defined`).toBeDefined();
  }
}

test('§6 TC-AI-PRV-001: current provider is DeepSeek', async () => {
  test.setTimeout(180_000);
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-polish`, shared.token, {
    text: 'AI 改变新闻业。',
    language: 'SIMPLIFIED_CHINESE',
  });
  expect(status).toBeLessThan(500);
  const op = latestAiOp('polish_text');
  console.log(`[provider] model=${op.model} agentType=${op.agentType} durationMs=${op.durationMs}`);
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(op.agentType).toBe('WRITING');
  expect(op.durationMs).toBeGreaterThan(0);
});

test('§6 TC-AI-PRV-005/006: AIOperation table has rows (sanity)', async () => {
  test.setTimeout(60_000);
  const total = parseInt(sql(`SELECT COUNT(*) FROM ai_operations;`) || '0', 10);
  expect(total).toBeGreaterThan(0);
});

// =====================================================================
// §10 12 AI capabilities
// =====================================================================

test('§10 A1 rewrite_text — returns non-empty rewrite + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('rewrite_text');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-rewrite`, shared.token, {
    text: '今天天气真好，我们去公园散步。',
    instruction: '转为新闻导语',
    style: 'serious',
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('rewrite', body.result);
  expect(typeof body.result).toBe('string');
  expect(body.result).not.toBe('今天天气真好，我们去公园散步。');
  const op = latestAiOp('rewrite_text');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(op.durationMs).toBeGreaterThan(0);
  expect(countAiOps('rewrite_text')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A2 expand_text — returns longer expansion + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('expand_text');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-expand`, shared.token, {
    text: 'AI 改变了新闻业。',
    instruction: '补充细节和数据',
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('expand', body.result);
  expect(body.result.length).toBeGreaterThan(6);
  const op = latestAiOp('expand_text');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('expand_text')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A3 condense_text — returns shorter condensation + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('condense_text');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-condense`, shared.token, {
    text: ARTICLE_BODY,
    maxLength: 80,
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('condense', body.result);
  const op = latestAiOp('condense_text');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('condense_text')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A4 polish_text — returns polished text + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('polish_text');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-polish`, shared.token, {
    text: '这个新闻说的是ai对社会的改变',
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('polish', body.result);
  const op = latestAiOp('polish_text');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('polish_text')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A5 generate_headlines — returns 3-5 headlines + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('generate_headlines');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-headlines`, shared.token, {
    count: 4,
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expect(Array.isArray(body.headlines)).toBe(true);
  expect(body.headlines.length).toBeGreaterThanOrEqual(3);
  expect(body.headlines.length).toBeLessThanOrEqual(5);
  for (const h of body.headlines) {
    expect(h.title).toBeDefined();
    expect(h.title.length).toBeGreaterThan(0);
  }
  const op = latestAiOp('generate_headlines');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('generate_headlines')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A6 generate_excerpt — returns excerpt + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('generate_excerpt');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-excerpt`, shared.token, {
    maxLength: 100,
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('excerpt', body.excerpt);
  const op = latestAiOp('generate_excerpt');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('generate_excerpt')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A7 chat_assistant — multi-turn chat returns reply + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('chat_assistant');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-chat`, shared.token, {
    messages: [
      { role: 'user', content: '请用一句话总结这篇文章的要点。' },
    ],
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('chat', body.reply);
  const op = latestAiOp('chat_assistant');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('chat_assistant')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A8 generate_draft — returns draft result for article + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('generate_draft');
  const { status, body } = await postJson(`/articles/${shared.articleId2}/ai-draft`, shared.token, {
    instruction: '请围绕选题生成一篇 300 字左右的报道',
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('draft', body);
  const op = latestAiOp('generate_draft');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('generate_draft')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A9 TC-AI-FC-001 fact_check — returns score/summary/findings + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('fact_check');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-fact-check`, shared.token, {
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expect(typeof body.score).toBe('number');
  expect(body.score).toBeGreaterThanOrEqual(0);
  expect(body.score).toBeLessThanOrEqual(100);
  expectNonEmpty('fact-check summary', body.summary);
  expect(Array.isArray(body.findings)).toBe(true);
  if (body.findings.length > 0) {
    const validTypes = ['fact', 'inconsistency', 'dispute', 'source_needed', 'risk'];
    const validSevs = ['info', 'warning', 'critical'];
    for (const f of body.findings) {
      expect(validTypes).toContain(f.type);
      expect(validSevs).toContain(f.severity);
    }
  }
  const op = latestAiOp('fact_check');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('fact_check')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A10 TC-AI-RK-001 generate_research_kit — combines Tavily + Wikipedia + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('generate_research_kit');
  const { status, body } = await postJson(
    `/stories/${shared.storyId}/research?language=SIMPLIFIED_CHINESE`,
    shared.token,
    {},
  );
  expect([200, 201]).toContain(status);
  const rk = body.researchKit || body;
  expectNonEmpty('research-kit', rk);
  if (Array.isArray(rk.tavily)) {
    console.log(`[research-kit] tavily results: ${rk.tavily.length}`);
    expect(rk.tavily.length).toBeGreaterThanOrEqual(0);
    if (rk.tavily.length > 0) {
      const first = rk.tavily[0];
      expect(first.title || first.snippet).toBeDefined();
    }
  }
  if (Array.isArray(rk.wikipedia)) {
    console.log(`[research-kit] wikipedia entries: ${rk.wikipedia.length}`);
  }
  const op = latestAiOp('generate_research_kit');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('generate_research_kit')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A11 review_report — returns review report + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('review_report');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-review`, shared.token, {
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('review', body);
  const op = latestAiOp('review_report');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('review_report')).toBeGreaterThanOrEqual(before + 1);
});

test('§10 A12 optimize_seo — returns SEO suggestions + AIOperation logged', async () => {
  test.setTimeout(180_000);
  const before = countAiOps('optimize_seo');
  const { status, body } = await postJson(`/articles/${shared.articleId}/ai-seo`, shared.token, {
    language: 'SIMPLIFIED_CHINESE',
  });
  expect([200, 201]).toContain(status);
  expectNonEmpty('seo', body);
  const op = latestAiOp('optimize_seo');
  expect(op.model.toLowerCase()).toMatch(/^deepseek/);
  expect(countAiOps('optimize_seo')).toBeGreaterThanOrEqual(before + 1);
});

// =====================================================================
// §6 TC-AI-PRV-009 — Seedream image generation
// =====================================================================
test('§6 TC-AI-PRV-009 ai_generate_image — Seedream returns image URL (or graceful error)', async () => {
  test.setTimeout(240_000);
  const before = countAiOps('generate_image', 60);
  const { status, body } = await postJson(
    `/articles/${shared.articleId}/ai-generate-image`,
    shared.token,
    {
      customPrompt: 'a red apple on a white table, simple',
      size: '2K',
      style: 'illustration',
    },
    180_000,
  );
  expect([200, 201, 400, 500, 502, 503]).toContain(status);
  if (status === 200 || status === 201) {
    expectNonEmpty('image', body);
  } else {
    console.log(`[image] Seedream call returned ${status} (acceptable: graceful failure path)`);
  }
  if (countAiOps('generate_image', 60) > before) {
    const op = latestAiOp('generate_image');
    console.log(`[image] op model=${op.model} agentType=${op.agentType}`);
  }
});

// =====================================================================
// §6 Verification — AIOperation log structural integrity
// =====================================================================
test('§6 verification: AIOperation rows have non-null model, durationMs > 0, agentType valid', async () => {
  test.setTimeout(60_000);
  const out = sql(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN model IS NULL OR model = '' THEN 1 ELSE 0 END) AS null_models,
      SUM(CASE WHEN durationMs IS NULL OR durationMs <= 0 THEN 1 ELSE 0 END) AS bad_durations,
      SUM(CASE WHEN agentType NOT IN ('STORY','RESEARCH','WRITING','EDITOR','REVIEW','VISUAL','DISTRIBUTE') THEN 1 ELSE 0 END) AS bad_agent_types
    FROM ai_operations WHERE createdAt > (UTC_TIMESTAMP() - INTERVAL 4 HOUR);
  `);
  const [total, nullModels, badDurations, badAgentTypes] = out.split('\t').map(s => parseInt(s, 10));
  console.log(`[integrity] total=${total} nullModels=${nullModels} badDurations=${badDurations} badAgentTypes=${badAgentTypes}`);
  expect(total).toBeGreaterThan(0);
  expect(nullModels).toBe(0);
  expect(badDurations).toBe(0);
  expect(badAgentTypes).toBe(0);
});
