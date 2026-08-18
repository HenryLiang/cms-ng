# Repository Guidelines

Contributor guide for **01创作大脑 (CMS-NG)**, an AI-driven content creation platform built as a Turbo/npm-workspaces monorepo: Next.js 16 frontend, NestJS 11 backend with Prisma + MySQL, and a shared types package.

## Project Structure & Module Organization

- `frontend/` — Next.js 16 (App Router) + React 19 + Tailwind CSS v4. Routes in `src/app/`, reusable UI in `src/components/`, API clients in `src/lib/`, Zustand stores in `src/store/`, hooks in `src/hooks/`.
- `backend/` — NestJS 11. Feature modules live in `src/<domain>/` (e.g. `auth`, `articles`, `media`, `channels`, `billing`, `auto-publish`). The Prisma schema is at `backend/prisma/schema.prisma`.
- `packages/shared/` — `@cms-ng/shared`: types/enums shared by both apps; change only when the contract is intentional.
- `tests/regression/` — Playwright end-to-end specs. `docs/` holds PRDs and design notes; `scripts/` has dev/prod helpers; `docker-compose.yml` runs dev middleware (RSSHub, Elasticsearch).

## Build, Test, and Development Commands

Prerequisites: Node 24 (`.nvmrc`), MySQL 8, and `backend/.env` copied from `backend/.env.example`.

```bash
npm install          # install all workspaces
npm run dev          # Turbo: start frontend (:3000) + backend (:3001)
npm run dev:start    # via scripts/dev-start.sh (flags: --backend-only, --no-es, --no-migrate)
npm run build        # build all packages (Turbo dependency order)
npm run lint         # lint all packages
npm run test         # run all unit tests (Jest + Vitest)
```

Workspace-specific:

```bash
cd backend && npx prisma migrate dev --name <name>   # create + apply schema migration
cd backend && npm run test:e2e                       # integration tests (real MySQL)
cd frontend && npm run test:watch
npx playwright test                                  # regression suite (services must be running)
```

Always run `npx prisma generate` after editing `schema.prisma`.

## Coding Style & Naming Conventions

TypeScript everywhere, 2-space indentation. ESLint 9 flat config uses type-checked rules; CI fails on any warning. Backend formatting is Prettier (single quotes, trailing commas).

- Backend: kebab-case files, PascalCase classes, feature suffixes — `articles.module.ts`, `articles.controller.ts`, `articles.service.ts`; DTOs under `dto/`.
- Frontend: kebab-case files, PascalCase components, `.tsx` for React, colocated tests.
- Prefix intentionally unused identifiers with `_` (enforced by ESLint).

## Testing Guidelines

- Backend unit tests: Jest, `*.spec.ts` colocated with source.
- Frontend unit tests: Vitest + Testing Library, `*.test.ts(x)` colocated under `frontend/src/`.
- Backend e2e: `backend/test/*.e2e-spec.ts`, run against a real MySQL instance.
- Regression: Playwright specs under `tests/regression/`.
- Name tests after the module they cover (e.g. `auth.service.spec.ts`, `toast-store.test.ts`).

## Commit & Pull Request Guidelines

Commit messages use Conventional Commits: `type(scope): summary` — e.g. `feat(media): add AI tagging`, `fix(ci): fail on lint warnings`. Types in history: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `ci`, `style`.

PRs must link issues, summarize what and why, include test evidence, and add screenshots for UI changes. CI must pass lint, unit tests, build, and backend e2e.

## Security & Configuration Tips

- Never commit `.env` files or secrets; `backend/.env` is the single source of truth for backend config.
- URL-encode special characters in `DATABASE_URL` (`@` → `%40`).
- Elasticsearch binds to `127.0.0.1` only; never expose it publicly.
- AI-generated content must pass human editorial review before publishing.
- For deep architectural detail, see `CLAUDE.md` and the docs in `docs/`.
