@AGENTS.md

## Key Frontend Conventions

- App Router routes: `app/login`, `app/register`, `app/dashboard/` with nested segments — `articles/`, `stories/`, `review/`, `profile/`, `auto-publish/`, `billing/` — each with their own `page.tsx` + `layout.tsx`.
- Server Components where feasible (root layout, home page, a few presentational panels), but most dashboard pages and components use `'use client'` (~29 of 36 non-test `.tsx` files) because they need hooks/event handlers. Add `'use client'` only when a component needs browser APIs, state, or event handlers.
- All API calls go through `src/lib/api.ts` — an Axios instance that attaches the JWT from `localStorage` and redirects to `/login` on 401.
- Domain-specific API modules wrap the base `api` client: `article-api.ts`, `story-api.ts`, `topic-api.ts`, `channel-api.ts`, `review-api.ts`, `auth-api.ts`, `users-api.ts`, `auto-publish-api.ts`, `billing-api.ts`.
- **Data fetching**: components call the `@/lib/*-api` Axios modules directly, typically inside `useEffect` + `useState` (no caching/dedup/invalidation layer). `@tanstack/react-query` is listed in `frontend/package.json` but is **NOT used anywhere** — there is no `QueryClientProvider`; `AuthProvider` (`frontend/src/components/auth-provider.tsx`, mounted in `app/layout.tsx`) is the only provider and just calls `useAuthStore.fetchUser()` on mount. Zustand (`auth-store`, `toast-store`) is the only state library actually in use.
- **Toast notifications**: `useToastStore` (Zustand) manages a toast queue. Use `reportApiError(error)` from `src/lib/api-error-toast.ts` to map Axios errors to user-facing toasts (handles 403, 404, 5xx, network, and generic 4xx). **401 is NOT toasted** by `reportApiError` — the `api.ts` response interceptor handles 401 by clearing the token and redirecting to `/login`, calling `reportApiError` only for non-401 errors.
- **Error boundary**: `error-boundary.tsx` provides a React error boundary for catching render errors; it (with `ToastHost`) is mounted in `app/dashboard/layout.tsx` wrapping `{children}`.
- `auth-store.ts` uses Zustand with `persist` middleware (localStorage) + a `_hasHydrated` flag to avoid flash-of-login-state on page load. `partialize` persists only `accessToken` + `isAuthenticated` (not `user`), so `user` is null on rehydration until `fetchUser()` resolves.
- **Next.js 16 has breaking changes**: `frontend/CLAUDE.md` re-exports `frontend/AGENTS.md`, so when working in `frontend/` that note loads automatically. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.
