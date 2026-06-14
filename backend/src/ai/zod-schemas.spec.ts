import {
  draftResultSchema,
  factCheckResultSchema,
  headlinesSchema,
  researchKitResultSchema,
  reviewReportResultSchema,
  seoResultSchema,
  storySuggestionsSchema,
} from './zod-schemas';

describe('LLM JSON Zod schemas', () => {
  describe('storySuggestionsSchema (site 1)', () => {
    it('accepts a direct array', () => {
      const result = storySuggestionsSchema.parse([
        { title: 'T', description: 'D', suggestedAngle: 'A', reason: 'R' },
      ]);
      expect(result).toHaveLength(1);
    });

    it('accepts { suggestions: [...] }', () => {
      const result = storySuggestionsSchema.parse({
        suggestions: [{ title: 'T', description: 'D', suggestedAngle: 'A', reason: 'R' }],
      });
      expect(result.suggestions).toHaveLength(1);
    });

    it('rejects an object missing all expected fields', () => {
      expect(() => storySuggestionsSchema.parse({ unrelated: 'key' })).toThrow();
    });
  });

  describe('headlinesSchema (site 2)', () => {
    it('accepts a direct array', () => {
      const result = headlinesSchema.parse([
        { title: 'T1', style: 'serious', reasoning: 'R1' },
      ]);
      expect(result).toHaveLength(1);
    });

    it('accepts { headlines: [...] }', () => {
      const result = headlinesSchema.parse({
        headlines: [{ title: 'T', style: 'casual', reasoning: 'R' }],
      });
      expect(result.headlines).toHaveLength(1);
    });

    it('accepts { titles: [...] } (legacy field name)', () => {
      const result = headlinesSchema.parse({
        titles: [{ title: 'T', style: 'academic', reasoning: 'R' }],
      });
      expect(result.titles).toHaveLength(1);
    });
  });

  describe('draftResultSchema (site 3)', () => {
    it('accepts a complete draft', () => {
      const result = draftResultSchema.parse({
        title: 'T',
        subtitle: 'S',
        content: '<p>C</p>',
      });
      expect(result.title).toBe('T');
    });

    it('accepts an empty object (all fields optional)', () => {
      expect(() => draftResultSchema.parse({})).not.toThrow();
    });
  });

  describe('factCheckResultSchema (site 4)', () => {
    it('accepts a well-formed result with findings', () => {
      const result = factCheckResultSchema.parse({
        score: 85,
        summary: 'Good',
        findings: [
          {
            type: 'fact',
            text: 'A',
            message: 'B',
            severity: 'info',
          },
        ],
      });
      expect(result.findings).toHaveLength(1);
      expect(result.findings![0].type).toBe('fact');
    });

    it('rejects an invalid severity enum', () => {
      expect(() =>
        factCheckResultSchema.parse({
          score: 50,
          findings: [
            { type: 'fact', text: 'A', message: 'B', severity: 'BOGUS' },
          ],
        }),
      ).toThrow();
    });
  });

  describe('researchKitResultSchema (site 5)', () => {
    it('accepts a full research kit', () => {
      const result = researchKitResultSchema.parse({
        timeline: [{ date: '2024-01-01', event: 'E1' }],
        people: [{ name: 'P1', role: 'R1' }],
        data: [{ label: 'L1', value: 'V1' }],
        opinions: [{ source: 'S1', viewpoint: 'V1' }],
        wikipedia: [{ language: 'zh', title: 'T1', url: 'https://...', extract: '...' }],
      });
      expect(result.timeline).toHaveLength(1);
      expect(result.wikipedia).toHaveLength(1);
    });

    it('accepts an empty object (all fields optional)', () => {
      expect(() => researchKitResultSchema.parse({})).not.toThrow();
    });

    it('passes through unknown LLM-added fields in entries (forward-compat)', () => {
      const result = researchKitResultSchema.parse({
        timeline: [{ date: '2024-01-01', event: 'E', futureField: 'whatever' }],
      });
      expect((result.timeline![0] as any).futureField).toBe('whatever');
    });
  });

  describe('reviewReportResultSchema (site 6)', () => {
    it('accepts full dimensions + suggestions', () => {
      const result = reviewReportResultSchema.parse({
        overallScore: 78,
        summary: 'Solid',
        dimensions: [
          { name: 'Structure', score: 80, maxScore: 100, comment: 'Good' },
        ],
        suggestions: [
          { dimension: 'Structure', priority: 'high', suggestion: 'Add X' },
        ],
      });
      expect(result.dimensions).toHaveLength(1);
      expect(result.suggestions![0].priority).toBe('high');
    });

    it('rejects an invalid priority enum', () => {
      expect(() =>
        reviewReportResultSchema.parse({
          suggestions: [{ priority: 'URGENT' }],
        }),
      ).toThrow();
    });
  });

  describe('seoResultSchema (site 7)', () => {
    it('accepts a complete SEO result', () => {
      const result = seoResultSchema.parse({
        overallScore: 78,
        readabilityScore: 82,
        optimizedTitle: [
          { title: 'T1', reasoning: 'R1' },
        ],
        metaDescription: 'M',
        keywords: [{ keyword: 'K1', searchVolume: 'high' }],
        suggestions: [
          { category: 'Title', priority: 'high', suggestion: 'S' },
        ],
      });
      expect(result.keywords).toHaveLength(1);
      expect(result.keywords![0].searchVolume).toBe('high');
    });

    it('rejects an invalid searchVolume enum', () => {
      expect(() =>
        seoResultSchema.parse({
          keywords: [{ keyword: 'K', searchVolume: 'HUGE' }],
        }),
      ).toThrow();
    });
  });
});
