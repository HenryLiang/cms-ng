/**
 * Type-safe partial mock creator.
 * Accepts a partial object and returns a full mock with defaults.
 */
export function createMock<T extends Record<string, any>>(
  defaults: T,
  override?: Partial<T>,
): T {
  return { ...defaults, ...override };
}

/** Common timestamp for test fixtures */
export const now = new Date('2026-05-14T00:00:00.000Z');

/** UUID regex for assertions */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
