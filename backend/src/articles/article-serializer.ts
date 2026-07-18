import { safeJsonParse } from '../common/json.utils';

/**
 * Article columns that are stored as JSON strings in MySQL but should
 * be exposed to callers as arrays. Keep in sync with the Prisma schema
 * (`backend/prisma/schema.prisma` → Article).
 */
export const ARTICLE_JSON_FIELDS = [
  'tags',
  'platforms',
  'aiGeneratedParts',
] as const;

export type ArticleJsonField = (typeof ARTICLE_JSON_FIELDS)[number];

/**
 * Convert a Prisma Article row (or any object containing the JSON-string
 * columns) into the shape callers expect:
 *   - declared JSON fields: string → parsed array (or [] on null/missing/garbage)
 *   - already-parsed arrays: passed through (idempotent)
 *   - everything else: untouched (idels, foreign keys, relations, etc.)
 *
 * Mutates and returns the input for convenience. The mutation is
 * safe because Prisma rows are fresh objects.
 */
export function deserializeArticle<T extends Record<string, unknown>>(
  article: T,
): T {
  if (article == null) return article;
  for (const field of ARTICLE_JSON_FIELDS) {
    const value = article[field];
    if (value == null) {
      // null / undefined → empty array (matches Prisma `@default("[]")`)
      (article as Record<string, unknown>)[field] = [];
    } else if (typeof value === 'string') {
      (article as Record<string, unknown>)[field] = safeJsonParse(value, []);
    }
    // already an array or object: leave alone
  }
  return article;
}

/**
 * Return type of {@link serializeArticleInput}. The three JSON-string
 * fields (`tags`, `platforms`, `aiGeneratedParts`) are stringified, so
 * the output type narrows those to `string` (or omits them when the
 * input had `undefined`). All other fields pass through unchanged.
 */
export type SerializedArticleInput<T> = Omit<
  T,
  (typeof ARTICLE_JSON_FIELDS)[number]
> & {
  [K in (typeof ARTICLE_JSON_FIELDS)[number]]?: string;
};

/**
 * Convert a DTO / update payload into the data shape Prisma expects for
 * the Article model. JSON fields are stringified; everything else is
 * passed through.
 *
 * Semantics per JSON field:
 *   - undefined: the key is left as `undefined` in the returned object so
 *     Prisma treats the field as "do not update" (for `update`) or applies
 *     the column default (for `create`).
 *   - null: kept as `null` (Prisma writes SQL NULL).
 *   - string: kept as-is (idempotent — no double encoding).
 *   - array / object: JSON.stringify.
 *
 * Returns the same object (mutated) for convenience. The return type
 * narrows the three JSON fields to `string` so callers can pass the
 * result directly to `prisma.article.create` / `update` without casts.
 */
export function serializeArticleInput<T extends Record<string, unknown>>(
  input: T,
): SerializedArticleInput<T> {
  for (const field of ARTICLE_JSON_FIELDS) {
    if (!(field in input) || input[field] === undefined) continue;
    const value = input[field];
    if (value === null) continue; // explicit null stays null
    if (typeof value === 'string') continue; // already serialized
    if (Array.isArray(value) || typeof value === 'object') {
      (input as Record<string, unknown>)[field] = JSON.stringify(value);
    }
  }
  return input;
}
