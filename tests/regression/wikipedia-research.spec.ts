/**
 * Wikipedia Enhancement Regression — v1 §17 (P2 Wikipedia 增强研究)
 *
 * Scope (from docs/qa/full-regression-v1.md §17):
 *   TC-WIKI-001 — A factual claim surfaces at least one Wikipedia reference
 *                  in the research-kit (Tavily search + Wikipedia enhancement)
 *   TC-WIKI-002 — A fictional / non-existent topic does not crash the research-kit
 *                  endpoint; Wikipedia enhancement is allowed to return zero
 *                  references while the rest of the kit (timeline/people/data)
 *                  still returns a well-formed response
 *
 * Test design:
 *   - Login as reporter-sc (real AI + Tavily + Wikipedia network calls — no mocks)
 *   - Create a story with a factual title (TC-WIKI-001) or a clearly fictional one
 *     (TC-WIKI-002); both share the qa-wiki- prefix
 *   - POST /stories/:id/research?language=... (see stories.controller.ts:78)
 *   - 120s timeout per AI/network call; the parallel Wikipedia + Tavily + LLM
 *     structuring can take 60-90s on a cold DeepSeek session
 *   - Assert at least one wikipedia.org URL on the factual-claim case;
 *     on the fictional case the API must still 2xx with a structured kit
 */
import { test, expect, loginByApi, QA_API } from './_shared/fixtures';
import { request as pwRequest } from '@playwright/test';

const SUFFIX = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function createStory(token: string, title: string): Promise<string> {
  const api = await pwRequest.newContext({ baseURL: QA_API });
  try {
    const res = await api.post('/stories', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title,
        description: 'Wikipedia enhancement regression test story',
        angle: 'factual claim → Wikipedia cross-reference',
        contentLanguage: 'SIMPLIFIED_CHINESE',
        tags: ['QA', 'wiki', 'regression'],
      },
    });
    if (!res.ok()) {
      throw new Error(`createStory failed: ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();
    const id: string = body.story?.id || body.id;
    if (!id) throw new Error('storyId not returned');
    return id;
  } finally {
    await api.dispose();
  }
}

async function deleteStory(token: string, id: string): Promise<void> {
  const api = await pwRequest.newContext({ baseURL: QA_API });
  try {
    await api.delete(`/stories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } finally {
    await api.dispose();
  }
}

interface WikipediaEntry {
  title: string;
  extract: string;
  url: string;
  language: 'zh' | 'en';
}

async function callResearchKit(
  token: string,
  storyId: string,
  language = 'SIMPLIFIED_CHINESE',
): Promise<{ status: number; body: any }> {
  const api = await pwRequest.newContext({ baseURL: QA_API, timeout: 120_000 });
  try {
    const res = await api.post(
      `/stories/${storyId}/research?language=${encodeURIComponent(language)}`,
      { headers: { Authorization: `Bearer ${token}` }, data: {} },
    );
    const status = res.status();
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { _raw: text }; }
    return { status, body };
  } finally {
    await api.dispose();
  }
}

// =============================================================
// §17 TC-WIKI-001 — factual claim → Wikipedia reference present
// =============================================================
test('§17 TC-WIKI-001 factual-claim story → research-kit includes >=1 wikipedia.org reference', async () => {
  test.setTimeout(180_000);
  const { token } = await loginByApi('reporter-sc');

  // Verifiable factual claim: Eiffel Tower height is a well-known fact with a
  // corresponding Wikipedia article. The Wikipedia enhancement is expected to
  // attach at least one zh/en entry.
  const title = `qa-wiki-001-eiffel-tower-${SUFFIX}`;
  let storyId: string | null = null;
  try {
    storyId = await createStory(token, title);
    const { status, body } = await callResearchKit(token, storyId);
    expect([200, 201]).toContain(status);

    // The research-kit must return a well-formed result with the wikipedia field.
    expect(body).toBeDefined();
    const rk = body.researchKit || body;
    expect(Array.isArray(rk.timeline)).toBe(true);
    expect(Array.isArray(rk.people)).toBe(true);
    expect(Array.isArray(rk.data)).toBe(true);
    expect(Array.isArray(rk.opinions)).toBe(true);

    // Wikipedia enhancement: at least one wikipedia.org URL.
    const wiki: WikipediaEntry[] = Array.isArray(rk.wikipedia) ? rk.wikipedia : [];
    console.log(`[TC-WIKI-001] wikipedia entries returned: ${wiki.length}`);
    for (const w of wiki) {
      console.log(`[TC-WIKI-001]  - ${w.language} | ${w.title} | ${w.url}`);
    }
    expect(wiki.length).toBeGreaterThanOrEqual(1);
    for (const w of wiki) {
      expect(w.url).toMatch(/^https?:\/\/[a-z]+\.wikipedia\.org\/wiki\//i);
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.extract.length).toBeGreaterThan(0);
    }
  } finally {
    if (storyId) await deleteStory(token, storyId);
  }
});

// =============================================================
// §17 TC-WIKI-002 — fictional topic → no crash, wikipedia may be empty
// =============================================================
test('§17 TC-WIKI-002 fictional-topic story → research-kit still 2xx; wikipedia may be empty', async () => {
  test.setTimeout(180_000);
  const { token } = await loginByApi('reporter-sc');

  // A clearly fictional / non-existent topic. The qa- prefix plus a random
  // suffix ensures the term has no real Wikipedia article. The endpoint must
  // not fail; Wikipedia may return an empty array while the LLM-structured
  // timeline/people/data/opinions may still be non-empty.
  const title = `qa-wiki-002-zzz-fictional-xyz-${SUFFIX}`;
  let storyId: string | null = null;
  try {
    storyId = await createStory(token, title);
    const { status, body } = await callResearchKit(token, storyId);
    expect([200, 201]).toContain(status);

    expect(body).toBeDefined();
    const rk = body.researchKit || body;
    // Structural integrity regardless of Wikipedia result
    expect(Array.isArray(rk.timeline)).toBe(true);
    expect(Array.isArray(rk.people)).toBe(true);
    expect(Array.isArray(rk.data)).toBe(true);
    expect(Array.isArray(rk.opinions)).toBe(true);

    // Wikipedia field is present and is an array (may be empty for fictional topics)
    expect(rk.wikipedia === undefined || Array.isArray(rk.wikipedia)).toBe(true);
    const wiki: WikipediaEntry[] = Array.isArray(rk.wikipedia) ? rk.wikipedia : [];
    console.log(`[TC-WIKI-002] wikipedia entries returned: ${wiki.length} (expected 0 for fictional topic)`);
    if (wiki.length > 0) {
      // If any entries are returned for a fictional topic, they must still be
      // well-formed wikipedia.org URLs (no garbage) and obviously not
      // specifically about the fictional title.
      for (const w of wiki) {
        expect(w.url).toMatch(/^https?:\/\/[a-z]+\.wikipedia\.org\/wiki\//i);
      }
    }
    // No wikipedia.org URL is allowed to point at the fictional term itself
    for (const w of wiki) {
      expect(w.url.toLowerCase()).not.toContain('fictional-xyz');
      expect(w.url.toLowerCase()).not.toContain('qa-wiki-002');
    }
  } finally {
    if (storyId) await deleteStory(token, storyId);
  }
});
