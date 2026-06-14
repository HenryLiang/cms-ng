import {
  parsePaginationParams,
  buildPaginatedResponse,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './pagination';

describe('parsePaginationParams', () => {
  it('returns defaults when input is empty/undefined', () => {
    expect(parsePaginationParams({})).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(parsePaginationParams(undefined)).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('coerces numeric strings', () => {
    expect(parsePaginationParams({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('keeps numbers as-is', () => {
    expect(parsePaginationParams({ page: 3, pageSize: 50 })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('clamps page to >= 1', () => {
    expect(parsePaginationParams({ page: 0 }).page).toBe(1);
    expect(parsePaginationParams({ page: -5 }).page).toBe(1);
  });

  it('clamps pageSize to [1, MAX_PAGE_SIZE]', () => {
    expect(parsePaginationParams({ pageSize: 0 }).pageSize).toBe(1);
    expect(parsePaginationParams({ pageSize: -10 }).pageSize).toBe(1);
    expect(parsePaginationParams({ pageSize: MAX_PAGE_SIZE + 1 }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
  });

  it('uses defaults when value is NaN / non-numeric', () => {
    expect(parsePaginationParams({ page: 'abc' }).page).toBe(DEFAULT_PAGE);
    expect(parsePaginationParams({ pageSize: undefined }).pageSize).toBe(
      DEFAULT_PAGE_SIZE,
    );
    expect(parsePaginationParams({ page: null as any }).page).toBe(
      DEFAULT_PAGE,
    );
  });
});

describe('buildPaginatedResponse', () => {
  it('wraps data with meta (page, pageSize, total, totalPages)', () => {
    const out = buildPaginatedResponse([1, 2, 3], 10, { page: 1, pageSize: 3 });
    expect(out).toEqual({
      data: [1, 2, 3],
      meta: { page: 1, pageSize: 3, total: 10, totalPages: 4 },
    });
  });

  it('handles exact-divisor total (no extra page)', () => {
    const out = buildPaginatedResponse([1, 2], 4, { page: 1, pageSize: 2 });
    expect(out.meta.totalPages).toBe(2);
  });

  it('handles total=0 (totalPages=0, page=1 still valid)', () => {
    const out = buildPaginatedResponse([], 0, { page: 1, pageSize: 20 });
    expect(out.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('handles pageSize=0 (totalPages=0, avoids divide-by-zero)', () => {
    const out = buildPaginatedResponse([], 5, { page: 1, pageSize: 0 });
    expect(out.meta.totalPages).toBe(0);
  });

  it('echoes the requested page even if it is past the end', () => {
    const out = buildPaginatedResponse([], 5, { page: 99, pageSize: 20 });
    expect(out.meta.page).toBe(99);
    expect(out.meta.total).toBe(5);
    expect(out.meta.totalPages).toBe(1);
  });
});
