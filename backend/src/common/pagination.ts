/**
 * Shared pagination helpers used by all list endpoints.
 *
 * Why: stories.service.findAll() already used skip/take + meta, but the
 * shape was reinvented in every call site. Centralising:
 *   - the default page / pageSize / cap (so the whole API has one
 *     "what's a sensible default" answer)
 *   - the parse / clamp logic (so query strings like ?page=abc or
 *     ?pageSize=-1 don't crash or surprise the DB)
 *   - the response shape (`{ data, meta: { page, pageSize, total,
 *     totalPages } }` — matches what the ApiResponse docs and the
 *     stories endpoint already use)
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta extends PaginationParams {
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface RawPaginationInput {
  page?: number | string | null;
  pageSize?: number | string | null;
}

/**
 * Parse + clamp raw query input into safe PaginationParams. Always
 * returns a value, even for missing/garbage input, so callers never
 * have to do their own `?? DEFAULT`.
 */
export function parsePaginationParams(
  raw: RawPaginationInput | undefined | null,
): PaginationParams {
  const r = raw ?? {};
  const page = toPositiveInt(r.page, DEFAULT_PAGE);
  const pageSize = clamp(
    toPositiveInt(r.pageSize, DEFAULT_PAGE_SIZE),
    1,
    MAX_PAGE_SIZE,
  );
  return { page, pageSize };
}

/**
 * Wrap a data array + total count into the standard paginated response.
 *
 * totalPages is 0 when total or pageSize is 0 (avoids 0/0 = NaN, and
 * matches the user-facing semantic of "no results"). The requested
 * page is echoed even if it's past the end, so the client can still
 * tell what it asked for.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  const { page, pageSize } = params;
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  };
}

// ===== internals =====

function toPositiveInt(
  value: number | string | null | undefined,
  fallback: number,
): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
