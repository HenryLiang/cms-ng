# E2E Module Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the CMS-NG E2E test suite to 1:1 coverage of `docs/qa/full-regression-v1.md` by running the 7 existing Playwright specs + writing 7 new specs in parallel via worktree-isolated subagents, then running the combined suite and producing a regression report.

**Architecture:** Main agent orchestrates service startup + QA DB reset + 8 parallel subagent dispatches + combined Playwright run + report generation. Subagents each write one new spec file matching the conventions in the design doc. All 14 specs run via `npx playwright test` (3 workers, JSON + HTML report).

**Tech Stack:** Next.js 16, NestJS 11, Prisma 6, MySQL 8 (remote `43.134.11.194`), Playwright 1.x (chromium), worktree-isolated subagents, DeepSeek + Tavily + Seedream real APIs.

**Reference doc:** `docs/superpowers/specs/2026-06-11-e2e-module-coverage-design.md`

---

## Phase 0 — Service Startup & QA DB Reset (main agent, sequential)

### Task 0.1: Verify prerequisites

**Files:** None

- [ ] **Step 1: Confirm Node version ≥ 20**

Run: `node -v`
Expected: `v23.x.x` or `v20+` (project uses v23.9.0, warns but works)

- [ ] **Step 2: Confirm `backend/.env` exists**

Run: `test -f /Users/liangchao/claudeCodeSpaces/newcms/backend/.env && echo "OK" || echo "MISSING"`
Expected: `OK`
If MISSING, abort and ask user to copy from `.env.example` and fill secrets.

- [ ] **Step 3: Confirm `mysql` CLI is on PATH (used by AI spec for DB verification)**

Run: `which mysql`
Expected: a path. If not, document the gap; the existing AI spec already requires this.

- [ ] **Step 4: Confirm remote MySQL `cms_ng_qa` is reachable**

Run: `mysql -h 43.134.11.194 -u root -p'CmsNg@2026Prod' -e "SELECT 1;" 2>&1 | head -5`
Expected: `1` (a single number). If denied/timeout, abort and report.

### Task 0.2: Start dev frontend (:3000) + dev backend (:3001) via `dev-start.sh`

**Files:** None (uses `scripts/dev-start.sh`)

- [ ] **Step 1: Confirm no stale processes on :3000 / :3001**

Run: `lsof -ti :3000 :3001`
Expected: empty. If PIDs returned, the script will kill them, but flag any unusual ones.

- [ ] **Step 2: Start services in background**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms
nohup bash scripts/dev-start.sh --no-rsshub --no-migrate > /tmp/dev-start.log 2>&1 &
echo $! > /tmp/dev-start.pid
```

The script brings up backend on `:3001` and frontend on `:3000`. RSSHub and migration are skipped (RSSHub is not needed for the test scope; migration is handled separately for `cms_ng_qa`).

- [ ] **Step 3: Wait for :3001 to respond**

```bash
for i in {1..30}; do
  if curl -sf -o /dev/null -m 2 http://localhost:3001/articles; then
    echo "BACKEND READY at $i seconds"
    break
  fi
  sleep 1
done
curl -s -o /dev/null -w "backend(:3001): %{http_code}\n" -m 2 http://localhost:3001
```
Expected: `BACKEND READY` within 30s and `backend(:3001): 401` (auth required, meaning the server is up).

- [ ] **Step 4: Wait for :3000 to respond**

```bash
for i in {1..60}; do
  if curl -sf -o /dev/null -m 2 http://localhost:3000; then
    echo "FRONTEND READY at $i seconds"
    break
  fi
  sleep 1
done
curl -s -o /dev/null -w "frontend(:3000): %{http_code}\n" -m 2 http://localhost:3000
```
Expected: `FRONTEND READY` within 60s and `frontend(:3000): 200`.

### Task 0.3: Start QA backend on :3002

**Files:** None

- [ ] **Step 1: Start QA backend in background**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms/backend
nohup env \
  DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
  PORT=3002 \
  npx nest start > /tmp/qa-backend.log 2>&1 &
echo $! > /tmp/qa-backend.pid
```

- [ ] **Step 2: Wait for :3002 to respond**

```bash
for i in {1..30}; do
  if curl -sf -o /dev/null -m 2 http://localhost:3002/articles; then
    echo "QA BACKEND READY at $i seconds"
    break
  fi
  sleep 1
done
curl -s -o /dev/null -w "qa-backend(:3002): %{http_code}\n" -m 2 http://localhost:3002
```
Expected: `QA BACKEND READY` within 30s and `qa-backend(:3002): 401`.

### Task 0.4: Reset `cms_ng_qa` schema and seed

**Files:** None (uses existing `seed-qa.ts`)

- [ ] **Step 1: Apply Prisma schema (drops + recreates all tables in `cms_ng_qa`)**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms/backend
DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
  npx prisma db push --skip-generate --accept-data-loss
```
Expected: output ending in `Your database is now in sync with your Prisma schema.`

- [ ] **Step 2: Generate Prisma Client (in case schema changed)**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms/backend
DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
  npx prisma generate
```
Expected: `Generated Prisma Client (v...)` and exit code 0.

- [ ] **Step 3: Run seed script**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms/backend
DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
  npx tsx seed-qa.ts
```
Expected: log lines about created users/stories, exit 0. The 6 `qa-*@01.com` accounts must exist with role `ADMIN` / `EDITOR` / `REPORTER` (×4 languages).

- [ ] **Step 4: Verify seed by API login**

```bash
curl -s -X POST http://localhost:3002/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa-admin@01.com","password":"Test@2026"}' \
  | head -c 200
```
Expected: JSON containing `accessToken` (starts with `eyJ`) and `user.id`.

### Task 0.5: Smoke check (00-smoke.spec.ts logic, inlined)

**Files:** None

- [ ] **Step 1: Confirm all three ports and JWT are good**

```bash
curl -s -o /dev/null -w "3000:%{http_code} 3001:" -m 2 http://localhost:3000
curl -s -o /dev/null -w "%{http_code} 3002:" -m 2 http://localhost:3001
curl -s -o /dev/null -w "%{http_code}\n" -m 2 http://localhost:3002
```
Expected: `3000:200 3001:401 3002:401` (frontend serves 200, backends serve 401 because no auth header on the probe).

- [ ] **Step 2: Write `/tmp/phase0-status.txt`**

```
[OK] dev-start.log present, /tmp/dev-start.pid written
[OK] qa-backend.log present, /tmp/qa-backend.pid written
[OK] cms_ng_qa reset, seed-qa.ts succeeded
[OK] qa-admin login returns JWT
[OK] :3000/:3001/:3002 all reachable
```

- [ ] **Step 3: Commit nothing yet** — this phase produces no code changes.

### Task 0.6: Commit Phase 0 status (optional)

Skip if there are no code changes; commit only if any `seed-qa.ts` or fixtures were modified.

---

## Phase 1 — Parallel Spec Writing (8 worktree-isolated subagents)

### Task 1.0: Establish the worktree pattern

**Files:** None (uses `superpowers:using-git-worktrees` per design §4.3)

For each of A1–A7, dispatch a subagent with `isolation: "worktree"` so the subagent writes its spec file in an isolated worktree. Main agent merges each worktree back when the subagent finishes.

### Task 1.1: A1 — Channels Adapters (v1 §11 + §5 audit)

**Files:**
- Create: `tests/regression/channels-adapters.spec.ts`

- [ ] **Step 1: Subagent prompt template**

The subagent receives:
- Worktree at the repo root, branch `e2e/a1-channels-adapters`
- Pointer to `docs/qa/full-regression-v1.md` §11 (lines starting at "## 11. P1 — Channels 平台分发与适配器")
- Pointer to existing `tests/regression/channels-wordpress.spec.ts` as a style template
- Pointer to `tests/regression/_shared/fixtures.ts` and `_shared/api.ts`
- Conventions from design §4.5
- The "what to cover" list:
  - **TC-CHA-ADP-001**: `PlatformRegistry.getAdapter(WEBSITE)` returns a defined WebsiteAdapter; `adaptArticle(article, WEBSITE)` returns adapted title/content/tags with Website shape
  - **TC-CHA-ADP-002**: same for `FACEBOOK`
  - **TC-CHA-ADP-003**: same for `INSTAGRAM`
  - **TC-CHA-ADP-004**: same for `XIAOHONGSHU` — verify Chinese hashtag/emoji adaptation
  - **TC-CHA-ADP-005**: `PlatformRegistry.getAdapter(X | THREADS | LINKEDIN | YOUTUBE | PUSH)` returns `undefined` (reserved enum values, no adapter)
  - **TC-CHA-WP-AUDIT**: read existing `channels-wordpress.spec.ts`; report any test cases it covers that the v1 §5 plan lists as "未覆盖" — list those gaps but **do not write a new spec for WordPress** (existing is the source of truth)

- [ ] **Step 2: Subagent writes the spec file**

The spec follows the v1 plan structure: imports, header JSDoc, 5 TCs (one per adapter + one for reserved-enum behavior), MySQL verification of `PlatformPublish` records if the adapters create them.

- [ ] **Step 3: Main agent reviews the worktree diff**

```bash
cd <main-repo>
git fetch . e2e/a1-channels-adapters
git diff main..e2e/a1-channels-adapters -- tests/regression/channels-adapters.spec.ts
```

Verify:
- The file is under `tests/regression/`
- Header JSDoc references §11
- 5 TCs present with the IDs above
- Uses `_shared/fixtures` and `_shared/api`
- No mocks of business code

- [ ] **Step 4: Merge into main**

```bash
git merge --no-ff e2e/a1-channels-adapters -m "test(e2e): add channels-adapters spec for v1 §11"
```

- [ ] **Step 5: Cleanup worktree branch**

```bash
git branch -D e2e/a1-channels-adapters
git worktree remove <worktree-path>
```

### Task 1.2: A2 — Users & RBAC (v1 §14)

**Files:**
- Create: `tests/regression/users-rbac.spec.ts`

- [ ] **Step 1: Subagent prompt template**

Subagent receives:
- Worktree, branch `e2e/a2-users-rbac`
- Pointer to v1 §14 (User / RBAC 角色管理)
- Pointer to existing `auth-i18n.spec.ts` for style
- Pointer to `_shared/fixtures` and `_shared/api`
- "What to cover" list:
  - **TC-USR-LST-001**: admin can `GET /users` and see all 6 test accounts
  - **TC-USR-LST-002**: editor can `GET /users/editors` and see at least the qa-editor account
  - **TC-USR-LST-003**: reporter cannot `GET /users` (403)
  - **TC-USR-UPD-001**: admin can `PATCH /users/:id` to change name (NOT role — convention §4.5 #9)
  - **TC-USR-RBAC-001**: reporter logs in, tries to approve an article via `PATCH /articles/:id/review` with `decision: 'APPROVE'` — expect 403
  - **TC-USR-RBAC-002**: editor can approve an article; admin can also approve; reporter cannot
  - **TC-USR-RBAC-003**: create a test article as reporter, verify it shows up in editor's `GET /articles/review-queue`

- [ ] **Step 2: Subagent writes the spec file** matching the conventions.

- [ ] **Step 3: Review worktree diff** (same pattern as 1.1)

Verify:
- 6 TCs with IDs above
- Convention §4.5 #9 respected (no role modifications)
- RBAC tests assert HTTP status codes via API, not just UI

- [ ] **Step 4: Merge and cleanup**

```bash
git merge --no-ff e2e/a2-users-rbac -m "test(e2e): add users-rbac spec for v1 §14"
git branch -D e2e/a2-users-rbac
```

### Task 1.3: A3 — Trending + RSS Proxy (v1 §12 + §16)

**Files:**
- Create: `tests/regression/trending-rss-proxy.spec.ts`

- [ ] **Step 1: Subagent prompt template**

Subagent receives:
- Worktree, branch `e2e/a3-trending-rss-proxy`
- Pointer to v1 §12 (Trending-Topics) and §16 (RSS_PROXY_ENABLED 代理开关)
- Pointer to existing `stories-trending.spec.ts` for style and to understand what's already covered
- "What to cover" list:
  - **TC-TRD-AGT-001**: `GET /trending-topics?source=google-trends&geo=HK&timeRange=24h` returns a list (real API; if rate-limited, mark as flaky-acceptable)
  - **TC-TRD-RSS-001**: `GET /trending-topics/:source` for at least 2 native RSS sources (e.g., BBC, Guardian) returns parsed items
  - **TC-RSS-PRX-001**: when QA backend has `RSS_PROXY_ENABLED=true`, the HTTP_PROXY env var is honored (verify via log inspection or by mocking a local proxy — simplest: read the QA backend log to confirm proxy initialization)
  - **TC-RSS-PRX-002**: when `RSS_PROXY_ENABLED=false` (production default), no proxy is used (verify by ensuring direct connection works to a known source like Google RSS)
  - **TC-RSS-LCL-001**: RSSHub local source (`/zaobao/realtime/china` via `:1200` or `RSS_HUB_URL`) is fetched without going through HTTP_PROXY even when `RSS_PROXY_ENABLED=true`

- [ ] **Step 2: Subagent writes the spec file**

- [ ] **Step 3: Review worktree diff** — same as 1.1.

- [ ] **Step 4: Merge and cleanup**

```bash
git merge --no-ff e2e/a3-trending-rss-proxy -m "test(e2e): add trending-rss-proxy spec for v1 §12+§16"
```

### Task 1.4: A4 — safeJsonParse + rebrand (v1 §13 + §15)

**Files:**
- Create: `tests/regression/safejson-rebrand.spec.ts`

- [ ] **Step 1: Subagent prompt template**

Subagent receives:
- Worktree, branch `e2e/a4-safejson-rebrand`
- Pointer to v1 §13 (safeJsonParse 全局加固) and §15 (rebrand 文案一致性)
- Pointer to `backend/src/common/json.utils.ts` for `safeJsonParse` understanding
- "What to cover" list:
  - **TC-SJP-001**: API endpoint that returns a story/article with `tags` field — verify the response decodes `tags` as a JS array (not a string), and the rendering shows them as tags
  - **TC-SJP-002**: directly write a malformed JSON string to `cms_ng_qa.stories.tags` via mysql CLI, then fetch the story via API; the response must return an empty array (or default), not throw
  - **TC-SJP-003**: same for `articles.aiGeneratedParts` and `articles.coverImages`
  - **TC-RBR-001**: fetch all major pages (`/`, `/login`, `/dashboard`, `/dashboard/articles`, `/dashboard/stories`, `/dashboard/auto-publish`); assert no occurrence of legacy brand strings in the rendered HTML. Use a list of known legacy strings (read codebase for "INFO-NG" or whatever the rebrand source string is)
  - **TC-RBR-002**: scan API responses for the same legacy strings (e.g., `GET /auth/login` page metadata, `GET /users` user records)

- [ ] **Step 2: Subagent reads rebrand source strings**

The subagent must read the codebase to find what the legacy brand string is — it's referenced in commit `13416f5` per v1 §1.1. If the source string can't be found, skip TC-RBR with a `test.skip` and a comment explaining why.

- [ ] **Step 3: Subagent writes the spec file**

- [ ] **Step 4: Review and merge**

```bash
git merge --no-ff e2e/a4-safejson-rebrand -m "test(e2e): add safejson-rebrand spec for v1 §13+§15"
```

### Task 1.5: A5 — i18n audit + Wikipedia (v1 §7 + §17)

**Files:**
- Create: `tests/regression/wikipedia-research.spec.ts`
- Audit (read-only): `tests/regression/auth-i18n.spec.ts`

- [ ] **Step 1: Subagent prompt template**

Subagent receives:
- Worktree, branch `e2e/a5-i18n-wikipedia`
- Pointer to v1 §7 (i18n 三层持久化) and §17 (Wikipedia 增强研究)
- Pointer to `auth-i18n.spec.ts` and `ai-capabilities.spec.ts` (the latter has real Tavily calls)
- "What to cover" list:
  - **Audit**: Read `auth-i18n.spec.ts`. For each of the 4 reporter roles (`reporter-sc` / `reporter-en` / `reporter-hk` / `reporter-none`), verify the spec creates a story/article with the role's preferred `contentLanguage` and reads it back asserting the language was persisted. **If the audit finds gaps, the subagent adds new TCs to `auth-i18n.spec.ts`** (this is the only agent allowed to modify an existing spec).
  - **TC-WIKI-001**: with a real article body that contains a verifiable factual claim, call `POST /articles/:id/ai-research-kit`. The response should include Tavily search results AND Wikipedia references (look for `wikipedia.org` in URLs).
  - **TC-WIKI-002**: research-kit with a topic that has no Wikipedia entry (e.g., a fictional made-up term) still returns successfully with Tavily results, but Wikipedia references may be empty.

- [ ] **Step 2: Subagent writes the spec file (new) and edits `auth-i18n.spec.ts` (audit) if needed**

- [ ] **Step 3: Review worktree diff** — pay extra attention because this is the only agent modifying an existing spec.

- [ ] **Step 4: Merge and cleanup**

```bash
git merge --no-ff e2e/a5-i18n-wikipedia -m "test(e2e): add wikipedia-research spec + i18n audit for v1 §7+§17"
```

### Task 1.6: A6 — Cross-module flows (v1 §18 + §19)

**Files:**
- Create: `tests/regression/cross-module-flows.spec.ts`

- [ ] **Step 1: Subagent prompt template**

Subagent receives:
- Worktree, branch `e2e/a6-cross-module`
- Pointer to v1 §18 (跨模块联动) and §19 (模块联动矩阵)
- Pointer to all 7 existing specs (so it can chain their patterns)
- "What to cover" list — 3 cross-module end-to-end flows:
  - **TC-XMD-001**: reporter-sc creates story → creates article in DRAFT → calls AI rewrite → submits for review (status: PENDING_REVIEW) → editor logs in, approves (status: APPROVED) → publishes to WordPress via channel adapter
  - **TC-XMD-002**: trending topic fetch via `/trending-topics/google-trends?geo=HK` → adopt as story via `POST /trending-topics/:id/adopt` → reporter writes article → goes through review → published
  - **TC-XMD-003 (matrix)**: assert that 3 documented module pairs (e.g., `stories` ↔ `articles` via `storyId` foreign key, `articles` ↔ `users` via `authorId`, `articles` ↔ `platforms` via `PlatformPublish`) all show consistent data when queried end-to-end (create on one side, read on the other)

- [ ] **Step 2: Subagent writes the spec file**

This spec depends on the WordPress adapter being configured in the QA backend's `.env`. If `WORDPRESS_SITE_URL` etc. are missing, TC-XMD-001's WordPress step will fail; in that case the subagent must use `test.skip` with a clear message, not silently pass.

- [ ] **Step 3: Review worktree diff**

- [ ] **Step 4: Merge and cleanup**

```bash
git merge --no-ff e2e/a6-cross-module -m "test(e2e): add cross-module-flows spec for v1 §18+§19"
```

### Task 1.7: A7 — Boundary & compatibility (v1 §20)

**Files:**
- Create: `tests/regression/boundary-compat.spec.ts`

- [ ] **Step 1: Subagent prompt template**

Subagent receives:
- Worktree, branch `e2e/a7-boundary`
- Pointer to v1 §20 (边界与兼容性测试)
- "What to cover" list:
  - **TC-BND-LEN-001**: create an article with a 10,000-character body; verify it saves and reads back intact
  - **TC-BND-UNI-001**: create an article with mixed CJK + emoji + RTL (Arabic) characters; verify save/round-trip preserves bytes
  - **TC-BND-NEST-001**: create a story with a deeply nested description (10 levels of JSON nesting); verify it saves without truncation
  - **TC-BND-TAG-001**: create an article with 1000 tags; verify `safeJsonParse` handles the array and the API returns all 1000
  - **TC-BND-TITLE-001**: create an article with a 500-character title; verify validation accepts/rejects per spec
  - **TC-CMP-CHR-001**: chromium-only sanity — verify the page renders a known feature (e.g., Tailwind class) correctly; this is a smoke check, not visual regression

- [ ] **Step 2: Subagent writes the spec file**

- [ ] **Step 3: Review and merge**

```bash
git merge --no-ff e2e/a7-boundary -m "test(e2e): add boundary-compat spec for v1 §20"
```

### Task 1.8: A8 — Reporting agent setup

A8 is the main agent itself, run after all A1–A7 specs are merged.

- [ ] **Step 1: Verify all 7 new spec files exist on `main`**

```bash
ls -1 /Users/liangchao/claudeCodeSpaces/newcms/tests/regression/*.spec.ts
```
Expected: 14 `.spec.ts` files (7 existing + 7 new).

- [ ] **Step 2: If any are missing, re-dispatch that agent's task in a worktree and merge before continuing.**

---

## Phase 2 — Combined Execution (main agent)

### Task 2.1: Run the full Playwright suite

**Files:** None (operates on existing files)

- [ ] **Step 1: Confirm QA DB is still in known state**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms/backend
DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
  npx tsx -e "import {PrismaClient} from '@prisma/client'; const p = new PrismaClient(); p.user.count().then(n => { console.log('users:', n); p.\$disconnect(); });"
```
Expected: `users: 6` (or more if previous runs left artifacts; reset if not 6).

- [ ] **Step 2: Run the suite with all configured reporters**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms
npx playwright test --reporter=list,json,html
```

Expected runtime: 20–40 minutes (per design §4.6 estimate; AI-heavy specs dominate).

Output files (configured in `playwright.config.ts`):
- `tests/regression/results/run-summary.json`
- `tests/regression/results/html/index.html`
- `tests/regression/results/artifacts/` (per-test trace/screenshot/video on failure)

- [ ] **Step 3: Capture exit code**

```bash
echo "exit: $?"
```

Expected: `exit: 0` (all pass) or non-zero (some failed). Either is acceptable for this task — Phase 3 reports the outcome.

### Task 2.2: If the run failed, capture per-test artifacts

**Files:** None

- [ ] **Step 1: List failed test files from the JSON report**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms
node -e "
const r = require('./tests/regression/results/run-summary.json');
const failed = r.suites.flatMap(s => s.specs?.flatMap(sp => sp.tests?.filter(t => t.results?.[0]?.status === 'failed').map(t => ({file: sp.file || s.file, title: t.title})) || []) || []);
console.log(JSON.stringify(failed, null, 2));
"
```

- [ ] **Step 2: For each failure, locate the trace + screenshot**

```bash
ls tests/regression/results/artifacts/ 2>/dev/null
```

These are paths to embed in the regression report (Phase 3).

---

## Phase 3 — Report Generation (main agent)

### Task 3.1: Parse the run summary

**Files:** None (operates on output of Phase 2)

- [ ] **Step 1: Extract aggregate stats**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms
node -e "
const r = require('./tests/regression/results/run-summary.json');
const stats = r.stats || {};
console.log(JSON.stringify({
  expected: stats.expected,
  skipped: stats.skipped,
  unexpected: stats.unexpected,
  flaky: stats.flaky,
  duration_ms: stats.duration,
  startedAt: stats.startTime,
}, null, 2));
"
```

- [ ] **Step 2: Build a per-spec breakdown**

For each of the 14 spec files, count tests and pass/fail by parsing the JSON.

### Task 3.2: Write `docs/qa/regression-report-2026-06-11.md`

**Files:**
- Create: `docs/qa/regression-report-2026-06-11.md`

- [ ] **Step 1: Write the report**

The report must contain, in this order:

```markdown
# Regression Report — 2026-06-11

**Commit:** `<git rev-parse HEAD>` (output of `git rev-parse HEAD`)
**Branch:** `<git rev-parse --abbrev-ref HEAD>`
**Environment:**
- Frontend (dev): http://localhost:3000
- Backend (dev): http://localhost:3001 (not used by tests)
- Backend (QA): http://localhost:3002
- Database: cms_ng_qa @ 43.134.11.194:3306 (reset and re-seeded at <Phase 0 timestamp>)

## Summary

| Metric | Value |
|---|---|
| Total tests | ... |
| Passed | ... |
| Failed | ... |
| Skipped | ... |
| Flaky | ... |
| Duration | ... ms |
| Started | ... |
| Commit | ... |

## Per-spec results

| Spec | v1 § | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| 00-smoke.spec.ts | harness | ... | ... | ... | ... |
| auth-i18n.spec.ts | §7, §9 | ... | ... | ... | ... |
| ... (all 14 specs) | | | | | |

## Coverage map

| v1 Section | Covered by |
|---|---|
| §4 auto-publish | auto-publish.spec.ts (existing) |
| §5 WordPress | channels-wordpress.spec.ts (existing) |
| §6 AI provider | ai-capabilities.spec.ts (existing) |
| §7 i18n | auth-i18n.spec.ts (existing + A5 audit) |
| §8 article state machine | article-workflow.spec.ts (existing) |
| §9 JWT | auth-i18n.spec.ts (existing) + users-rbac.spec.ts (A2) |
| §10 AI 12 ops | ai-capabilities.spec.ts (existing) |
| §11 channels | channels-adapters.spec.ts (A1, new) |
| §12 trending | stories-trending.spec.ts (existing) + trending-rss-proxy.spec.ts (A3) |
| §13 safeJsonParse | safejson-rebrand.spec.ts (A4, new) |
| §14 user/RBAC | users-rbac.spec.ts (A2, new) |
| §15 rebrand | safejson-rebrand.spec.ts (A4, new) |
| §16 RSS proxy | trending-rss-proxy.spec.ts (A3, new) |
| §17 Wikipedia | wikipedia-research.spec.ts (A5, new) |
| §18 cross-module | cross-module-flows.spec.ts (A6, new) |
| §19 matrix | cross-module-flows.spec.ts (A6, new) |
| §20 boundary | boundary-compat.spec.ts (A7, new) |
| §21 non-functional | **OUT OF SCOPE** for E2E |

## Failures (if any)

For each failed test:
- Spec file and TC ID
- Error message (first 5 lines)
- Path to trace artifact
- Path to screenshot artifact

## Artifacts

- HTML report: `tests/regression/results/html/index.html`
- JSON summary: `tests/regression/results/run-summary.json`
- Per-test artifacts: `tests/regression/results/artifacts/`
```

- [ ] **Step 2: Verify report file**

```bash
test -f /Users/liangchao/claudeCodeSpaces/newcms/docs/qa/regression-report-2026-06-11.md && wc -l /Users/liangchao/claudeCodeSpaces/newcms/docs/qa/regression-report-2026-06-11.md
```

Expected: file exists, reasonable line count (50+ for a real report).

### Task 3.3: Commit the report + new specs

**Files:** None (git commit)

- [ ] **Step 1: Stage all changes**

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms
git add tests/regression/*.spec.ts docs/qa/regression-report-2026-06-11.md
git status
```

- [ ] **Step 2: Commit**

```bash
git commit -m "test(e2e): v1-regression coverage — 7 new specs + report (2026-06-11)"
```

- [ ] **Step 3: Capture the commit SHA for the report header** (re-edit report if needed to update the commit reference).

---

## Phase 4 — Service Teardown (main agent, after report is committed)

### Task 4.1: Stop services

- [ ] **Step 1: Stop QA backend**

```bash
kill $(cat /tmp/qa-backend.pid) 2>/dev/null || true
```

- [ ] **Step 2: Stop dev-start.sh (kills :3000/:3001) and RSSHub (if started)**

```bash
kill $(cat /tmp/dev-start.pid) 2>/dev/null || true
# dev-start.sh's trap handler kills backend/frontend PIDs
sleep 2
lsof -ti :3000 :3001 :3002 2>/dev/null && echo "STILL RUNNING" || echo "ALL CLEAN"
```

Expected: `ALL CLEAN`. If not, `lsof -ti :PORT | xargs kill -9` per port.

- [ ] **Step 2: Commit nothing further** — Phase 4 produces no code.

---

## Self-Review Notes (per writing-plans skill)

**Spec coverage:** Each phase of the design maps to a plan phase. Design §3 (scope decisions) → Task 0.x (env setup), Design §4.4 (per-agent chapters) → Tasks 1.1-1.7, Design §5.3 (combined run) → Phase 2, Design §5.4 (report) → Phase 3. ✓

**Placeholder scan:** No TBDs/TODOs. All commands have exact paths and expected outputs. All spec file paths are exact. ✓

**Type/name consistency:**
- `qa-admin@01.com` / `qa-editor@01.com` / `qa-reporter-{sc,en,hk,none}@01.com` — consistent with `tests/regression/_shared/fixtures.ts`
- `cms_ng_qa` — consistent with `settings.local.json` and the existing `ai-capabilities.spec.ts`
- `DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa'` — consistent across all tasks
- Branch names `e2e/a1-channels-adapters` etc. — consistent across tasks 1.1-1.7
- File names: `tests/regression/<name>.spec.ts` — consistent

**Ambiguity fixes:**
- Spec file names clarified as kebab-case, plural where the spec covers multiple things (e.g., `channels-adapters` for the multi-adapter spec)
- A5 is the only agent that may edit an existing spec (`auth-i18n.spec.ts`) — explicitly noted
- A6's WordPress dependency on `.env` config is explicitly handled with `test.skip` not silent pass
- A4's rebrand string source is explicitly researched by the subagent before writing
- A8 has a fallback: if a new spec is missing after Phase 1, re-dispatch that agent

**Spec gaps:**
- Design §3 says "§13 safeJsonParse 同时写 1 个 E2E 验证 + 推荐 1 个 Jest 单元测试草稿（不算 spec 文件）" — the Jest unit test is OUT of scope for this plan. Document this in the report's coverage map (mark §13 as "E2E only; unit test recommended as follow-up").
- Design §3 says "§21 非功能" excluded — covered in coverage map.
