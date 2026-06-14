import { z } from 'zod';

/**
 * Zod schemas for the 7 LLM JSON parse sites in ai.service.ts.
 *
 * Why: previously the code did `const parsed = JSON.parse(response.content)`
 * and then read `parsed.foo` fields without runtime validation. If the LLM
 * returned malformed JSON, `JSON.parse` would throw; if it returned well-
 * formed but un-schema-conforming JSON, fields would be silently undefined
 * and propagate downstream. Zod gives us runtime shape checking + clear
 * error logs, with the type system still happy via `z.infer`.
 *
 * Each schema matches the corresponding TypeScript interface in
 * `frontend/src/lib/article-api.ts` — when one changes, the other should too.
 *
 * Failure mode: if a schema doesn't match, the call site catches the
 * ZodError and falls back to the static `fallback` object in
 * `AIOperationLogger.run` (see the `fn` closure pattern in ai.service.ts).
 * We log the raw response + Zod issues at warn level for observability.
 */

// ===== Shared building blocks =====

/** Severity enum for FactCheck findings (mirrors FactCheckFinding['type']). */
const factCheckTypeSchema = z.enum([
  'fact',
  'inconsistency',
  'dispute',
  'source_needed',
  'risk',
]);

const factCheckSeveritySchema = z.enum(['info', 'warning', 'critical']);

const factCheckFindingSchema = z.object({
  type: factCheckTypeSchema,
  text: z.string(),
  message: z.string(),
  severity: factCheckSeveritySchema,
});

/**
 * Enum-shaped fields for downstream normalization are kept as `z.string()` so
 * that the existing per-element guards in ai.service.ts (e.g.
 * `['high', 'medium', 'low'].includes(x) ? x : 'medium'`) can still normalize
 * LLM drift (e.g. `priority: 'urgent'`) without throwing — which would
 * trigger a hard fallback. Schemas still reject non-strings.
 */
const prioritySchema = z.enum(['high', 'medium', 'low']).nullish();
const searchVolumeSchema = z.enum(['high', 'medium', 'low']).nullish();

// ===== Site 1: generateStorySuggestions =====
// LLM may return either an array directly, or { suggestions: [...] }.
// Site falls back to `parsed.suggestions || []` if not an array.

const storySuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  suggestedAngle: z.string(),
  reason: z.string(),
});

export const storySuggestionsSchema = z.union([
  z.array(storySuggestionSchema),
  z.object({ suggestions: z.array(storySuggestionSchema) }),
]);

// ===== Site 2: generateHeadlines =====
const headlineOptionSchema = z.object({
  title: z.string(),
  style: z.string(),
  reasoning: z.string(),
});

export const headlinesSchema = z.union([
  z.array(headlineOptionSchema),
  z.object({ headlines: z.array(headlineOptionSchema) }),
  z.object({ titles: z.array(headlineOptionSchema) }),
]);

// ===== Site 3: generateDraft =====
export const draftResultSchema = z.object({
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  content: z.string().nullish(),
});

// ===== Site 4: factCheck =====
export const factCheckResultSchema = z.object({
  score: z.number().nullish(),
  summary: z.string().nullish(),
  findings: z.array(factCheckFindingSchema).nullish(),
});

// ===== Site 5: generateResearchKit =====
// Note: timeline/people/data/opinions arrays are typed as `z.unknown()` so the
// downstream `Array.isArray` guard can still tolerate LLM drift (e.g.
// `people: 'invalid'` → empty []). The downstream code in ai.service.ts does
// the per-entry coercion. Wikipedia is enriched separately.
export const researchKitResultSchema = z.object({
  timeline: z.unknown().nullish(),
  people: z.unknown().nullish(),
  data: z.unknown().nullish(),
  opinions: z.unknown().nullish(),
  // wikipedia is enriched separately by the Wikipedia helper, not the LLM.
  wikipedia: z.array(z.unknown()).nullish(),
});

// ===== Site 6: generateReviewReport =====
const reviewDimensionSchema = z.object({
  name: z.string().optional(),
  score: z.number().optional(),
  maxScore: z.number().optional(),
  comment: z.string().optional(),
});

const reviewSuggestionSchema = z.object({
  dimension: z.string().nullish(),
  priority: prioritySchema.nullish(),
  suggestion: z.string().nullish(),
});

export const reviewReportResultSchema = z.object({
  overallScore: z.number().nullish(),
  summary: z.string().nullish(),
  dimensions: z.array(reviewDimensionSchema).nullish(),
  suggestions: z.array(reviewSuggestionSchema).nullish(),
});

// ===== Site 7: optimizeSEO =====
const seoOptimizedTitleSchema = z.object({
  title: z.string().nullish(),
  reasoning: z.string().nullish(),
});

const seoKeywordSchema = z.object({
  keyword: z.string().nullish(),
  searchVolume: searchVolumeSchema.nullish(),
});

const seoSuggestionSchema = z.object({
  category: z.string().nullish(),
  priority: prioritySchema.nullish(),
  suggestion: z.string().nullish(),
});

export const seoResultSchema = z.object({
  overallScore: z.number().nullish(),
  readabilityScore: z.number().nullish(),
  optimizedTitle: z.array(seoOptimizedTitleSchema).nullish(),
  metaDescription: z.string().nullish(),
  keywords: z.array(seoKeywordSchema).nullish(),
  suggestions: z.array(seoSuggestionSchema).nullish(),
});
