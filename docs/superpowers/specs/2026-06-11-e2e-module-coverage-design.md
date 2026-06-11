# E2E Module Coverage — Design

**Date:** 2026-06-11
**Status:** Approved (verbal, 2026-06-11)
**Author:** Claude (after brainstorming with user)

## 1. Goal

Walk through every core feature of every module in the CMS-NG codebase via browser-based end-to-end tests, parallelized across subagents, with a reproducible Playwright spec suite as the deliverable.

## 2. Why this matters

- `docs/qa/full-regression-v1.md` is the QA Lead's master test plan (2336 lines, 18 sections, 9 modules + 11 key points).
- 7 Playwright specs already exist in `tests/regression/`, covering ~12 of 18 sections partially. The remaining 6+ sections have no E2E coverage.
- The codebase has grown since v1 was written: `billing/` (Credits, latest commit) and `storage/` exist on disk but are not in the plan or in any spec.
- v1's §11 lists 5 platform adapters, but only WordPress has a dedicated spec; the other 4 are uncovered.

## 3. Scope decisions

| Decision | Choice | Why |
|---|---|---|
| Deliverable | Run existing 7 specs + add 10 new specs to fill gaps | "完整走一遍各模块" means coverage, not just execution |
| New spec scope | 1:1 alignment with v1 plan §4-§20 | v1 plan is the spec source of truth; user picked this option |
| Environment | Main agent starts :3000/:3001 via `dev-start.sh`, starts :3002 QA backend separately, resets `cms_ng_qa` | User chose to delegate env setup to the agent |
| AI calls | Real (DeepSeek + Tavily + Seedream) | User chose; matches existing `ai-capabilities.spec.ts` |
| Test data | Reset to known seed before run; tests use `qa-<chapter>-<id>` prefix | Matches existing convention; reproducible across runs |
| §13 safeJsonParse | E2E for the persistence path + suggested Jest unit test (out of E2E spec) | safeJsonParse is fundamentally a unit-level concern |
| §21 Non-functional (perf/security) | Excluded from E2E | k6/OWASP ZAP not naturally expressed in Playwright; v1 §1.3 calls E2E "端到端冒烟" |
| §15 rebrand | Text-scanning E2E (regex over rendered pages) | Cheap; catches regressions in copy updates |

## 4. Architecture

### 4.1 Environment topology (unchanged from existing infra)

```
┌──────────────────────────────────────────────────────────────┐
│  Host                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Dev frontend │  │ Dev backend  │  │ QA backend   │         │
│  │ Next.js 16   │  │ NestJS 11    │  │ NestJS 11    │         │
│  │ :3000        │  │ :3001        │  │ :3002        │         │
│  │ (existing)   │  │ (existing)   │  │ (test-only)  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         └──────┬───────────┘                 │                  │
│                │ :3001 calls rewritten → :3002                   │
│                │ via Playwright `pageWithQA` fixture route()     │
│                                                                │
│  ┌──────────────────────────┐  ┌─────────────────────────┐   │
│  │ Remote MySQL 8           │  │ External APIs           │   │
│  │ 43.134.11.194:3306       │  │ DeepSeek / Tavily /     │   │
│  │  ├─ cms_ng (dev)         │  │ Seedream / Google       │   │
│  │  └─ cms_ng_qa (test)     │  │ Trends / RSSHub :1200   │   │
│  └──────────────────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- Frontend stays on dev (`:3000`) for `pageWithQA` fixture compatibility.
- Dev backend (`:3001`) runs but is **not used by tests** — fixture rewrites every `:3001` call to `:3002`.
- QA backend (`:3002`) reads `DATABASE_URL` pointing at `cms_ng_qa`.

### 4.2 Test data

- **6 pre-seeded accounts** (in `cms_ng_qa` after `seed-qa.ts`):
  - `qa-admin@01.com`, `qa-editor@01.com`, `qa-reporter-sc@01.com`, `qa-reporter-en@01.com`, `qa-reporter-hk@01.com`, `qa-reporter-none@01.com` — all password `Test@2026`
- **Test artifacts**: each spec creates its own stories/articles/users with `qa-<chapter>-<uuid>` prefix; spec fixtures define unique SUFFIX per test run.
- **Cleanup**: relies on QA DB being reset before the full run; no per-test teardown required (except the A8 final report run which is on a fresh DB).

### 4.3 Dispatch topology

```
                ┌──────────────────────────────────┐
                │  Main agent                       │
                │  1. dev-start.sh → :3000/:3001    │
                │  2. start :3002 QA backend        │
                │  3. reset cms_ng_qa + seed-qa.ts  │
                │  4. probe all three ports 200/401 │
                │  5. dispatch 8 worktree subagents │
                │  6. merge spec branches           │
                │  7. npx playwright test (full)    │
                │  8. write regression report       │
                └────────────┬─────────────────────┘
                             │
   ┌────────────┬────────────┬┼────────────┬────────────┐
   ▼            ▼            ▼            ▼            ▼
 8 worktree-isolated subagents, each writes spec files in parallel
   │            │            │            │            │
   A1           A2           A3           A4           A5  A6  A7  A8
```

### 4.4 Per-agent chapter assignment

| Agent | v1 § | Spec file | New vs audit | Why grouped |
|---|---|---|---|---|
| **A1** | §11 + §5 audit | `channels-adapters.spec.ts` | New | 5 adapters; WordPress is "audit existing"; others are new |
| **A2** | §14 + §9 RBAC bits | `users-rbac.spec.ts` | New | RBAC is cross-cutting with auth (§9 already partial) |
| **A3** | §12 + §16 | `trending-rss-proxy.spec.ts` | New | Trending + RSS proxy are both RSS-infrastructure |
| **A4** | §13 + §15 | `safejson-rebrand.spec.ts` | New | Both are "global concern" type tests, not feature-flow |
| **A5** | §7 audit + §17 | `wikipedia-research.spec.ts` + audit `auth-i18n.spec.ts` | New + audit | i18n audit and Wikipedia research share "language + external API" theme |
| **A6** | §18 + §19 | `cross-module-flows.spec.ts` | New | Both are integration-flavor; A6 needs A1-A5 done so it can chain |
| **A7** | §20 | `boundary-compat.spec.ts` | New | Self-contained: large inputs, unicode, deep nesting |
| **A8** | reporting only | (no new spec) | — | Runs all 17 specs + generates report |

**8 agents, 7 new spec files (A1–A7 each write one; A8 is reporting-only), 17 total after merge (7 existing + 7 new + 3 from other agents who extend existing files via audit — but audit produces no new file, only notes).**

**Self-correction:** the count is **7 new spec files**, not 10.

### 4.5 Spec file conventions (mandatory)

1. **Path**: `tests/regression/<chapter>.spec.ts` — kebab-case, sibling of existing 7 specs
2. **Header JSDoc**: lists v1 section + TC ID range, e.g.:
   ```ts
   /**
    * Channels Adapters Regression — §11 平台分发与适配器
    * Scope: TC-CHA-ADP-001 ~ 005 (Website/Facebook/Instagram/小红书 + platform-registry)
    */
   ```
3. **Imports**: from `./_shared/fixtures` (`test`, `expect`, `ACCOUNTS`, `loginByApi`, `pageWithQA`, `QA_API`) and `./_shared/api` for typed wrappers
4. **Login strategy**: `loginByApi(role)` by default; `pageWithQA` only when asserting UI behavior
5. **Real AI calls**: matches `ai-capabilities.spec.ts`; no mocking of DeepSeek/Tavily/Seedream
6. **MySQL verification** (optional): `execSync` + temp SQL files when asserting side effects (e.g., `AIOperation` log written); `DATABASE` constant is `cms_ng_qa`
7. **Test data prefix**: `qa-<chapter>-<random>` — e.g., `qa-billing-` for A2, `qa-trending-` for A3
8. **Timeouts**: 120s for AI/WordPress/external; 60s for plain UI (inherits from `playwright.config.ts`)
9. **Test accounts are read-only**: specs may log in as any of the 6 `qa-*@01.com` accounts but **must not modify their `role`**
10. **No new mocking infra**: no nock/msw; matches existing suite

### 4.6 Coordination rules

- **Write order matters**: A6 (cross-module) **last** in the write phase because it depends on knowing the adapter/RBAC/AI spec APIs are stable.
- **No spec may depend on another spec's data**: each spec must create its own fixtures (stories, articles, etc.) so any spec can run in isolation if needed.
- **Worker count is 3** (`playwright.config.ts`); execution is naturally parallel up to 3 simultaneous spec files. With 14 spec files, total runtime ≈ ceil(14/3) × slowest-spec-runtime. The slowest specs are the AI-driven ones (real DeepSeek/Tavily/Seedream calls can take 30-120s per operation, and a single spec may chain 5-10 such operations); realistic total runtime estimate is **20-40 minutes** for the combined run.
- **QA DB reset between**: A8 resets `cms_ng_qa` once before the final combined run. No mid-run resets.

## 5. Execution flow

### 5.1 Phase 0: Service startup (main agent, sequential)

1. `cd /Users/liangchao/claudeCodeSpaces/newcms && bash scripts/dev-start.sh --no-rsshub --no-migrate` (RSSHub not needed; migration handled separately for QA)
2. Start QA backend on :3002:
   ```bash
   cd backend
   DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
   PORT=3002 \
   npx nest start > /tmp/qa-backend.log 2>&1 &
   ```
3. Wait until both :3001 and :3002 are reachable (poll `curl` for non-5xx).
4. Reset `cms_ng_qa`:
   ```bash
   cd backend
   DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
     npx prisma db push --skip-generate --accept-data-loss
   DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
     npx tsx seed-qa.ts
   ```
5. Verify `loginByApi('admin')` returns a valid JWT (smoke check).

### 5.2 Phase 1: Parallel spec writing (8 subagents, worktree-isolated)

Each subagent receives:
- Its chapter assignment (table in §4.4)
- Pointer to `tests/regression/_shared/fixtures.ts` and `_shared/api.ts` for shared helpers
- Pointer to the v1 plan section to read (`docs/qa/full-regression-v1.md`)
- Pointer to the relevant existing spec as a template
- The convention list in §4.5

Subagent output: a single `*.spec.ts` file in its worktree's `tests/regression/`.

Main agent merges all worktrees back to main branch.

### 5.3 Phase 2: Combined execution (main agent)

```bash
cd /Users/liangchao/claudeCodeSpaces/newcms
# QA DB is already in known state from Phase 0
DATABASE_URL='mysql://root:CmsNg%402026Prod@43.134.11.194:3306/cms_ng_qa' \
QA_API='http://localhost:3002' \
npx playwright test --reporter=list,json,html
```

Outputs (configured in `playwright.config.ts`):
- `tests/regression/results/run-summary.json`
- `tests/regression/results/html/` (HTML report)
- `tests/regression/results/artifacts/` (traces, screenshots, videos on failure)

### 5.4 Phase 3: Report generation (main agent)

Write `docs/qa/regression-report-2026-06-11.md` containing:
- Date, environment, commit SHA
- Per-spec pass/fail summary with TC counts
- Failed test details with stack traces + paths to trace/screenshot artifacts
- Per-module coverage map (which v1 sections are now covered)
- Recommended follow-ups for any new failures

## 6. Error handling

- **Service startup failure**: main agent surfaces the log and aborts before dispatching subagents. No spec writing happens on a broken environment.
- **QA DB reset failure**: main agent aborts; user must fix before retry. Existing data preserved.
- **Subagent spec compilation failure**: that subagent's work is not merged; main agent retries up to 2 times, then reports the failure to user.
- **Spec runtime failure**: Playwright trace + screenshot already auto-captured; report includes the artifact path.
- **Real AI API failure** (rate limit, key expired): the affected test fails with a clear timeout/network error; subagent notes that the test is AI-API-dependent and would need to be re-run on stable network.
- **WordPress API failure**: same as AI; spec is real-API dependent.

## 7. Out of scope

- §21 Non-functional (perf/security) — k6 / OWASP ZAP, not Playwright
- Visual regression testing — not requested, no baseline images
- Load testing the pipeline — beyond E2E scope
- Modifying any of the 6 `qa-*@01.com` test accounts' role
- Adding new test accounts beyond what `seed-qa.ts` provides
- Adding new mocking infrastructure (nock/msw)
- CI integration (the work is local execution; CI wiring is a separate task)

## 8. Success criteria

- All 18 v1 sections have at least one Playwright spec covering them (or an explicit audit-confirms-existing-coverage note)
- 7 existing specs + 7 new specs = 14 spec files, all passing
- `docs/qa/regression-report-2026-06-11.md` is written
- HTML report archived in `tests/regression/results/html/`
- `billing/`, `storage/`, and 4 non-WordPress adapters have at least 1 TC each
- 4 ContentLanguages each have a test creating and reading a localized story/article
