import {
  ARTICLE_JSON_FIELDS,
  deserializeArticle,
  serializeArticleInput,
} from './article-serializer';

describe('article-serializer', () => {
  describe('ARTICLE_JSON_FIELDS', () => {
    it('declares the three JSON-string columns on the Article model', () => {
      // If a new JSON field is added to Prisma, this test reminds the dev
      // to consider whether the serializer needs updating.
      expect(ARTICLE_JSON_FIELDS).toEqual([
        'tags',
        'platforms',
        'aiGeneratedParts',
      ]);
    });
  });

  describe('deserializeArticle', () => {
    it('parses JSON-string fields into arrays', () => {
      const prismaRow = {
        id: 'a1',
        title: 'Hello',
        tags: '["news","ai"]',
        platforms: '["FACEBOOK"]',
        aiGeneratedParts: '["title","content"]',
      };
      const out = deserializeArticle(prismaRow);
      expect(out.tags).toEqual(['news', 'ai']);
      expect(out.platforms).toEqual(['FACEBOOK']);
      expect(out.aiGeneratedParts).toEqual(['title', 'content']);
    });

    it('preserves non-JSON fields untouched', () => {
      const prismaRow = {
        id: 'a1',
        title: 'Hello',
        version: 7,
        storyId: 's1',
        tags: '["a"]',
      };
      const out = deserializeArticle(prismaRow);
      expect(out.id).toBe('a1');
      expect(out.title).toBe('Hello');
      expect(out.version).toBe(7);
      expect(out.storyId).toBe('s1');
    });

    it('passes through fields that are already parsed arrays', () => {
      // Some Prisma client configurations (e.g. with `$extends` middleware)
      // may already return arrays. We must not double-parse.
      const prismaRow = {
        id: 'a1',
        tags: ['news', 'ai'],
        platforms: [],
      };
      const out = deserializeArticle(prismaRow);
      expect(out.tags).toEqual(['news', 'ai']);
      expect(out.platforms).toEqual([]);
    });

    it('defaults null fields to empty array (matches Prisma @default("[]"))', () => {
      const prismaRow = {
        id: 'a1',
        tags: null,
        platforms: null,
        aiGeneratedParts: null,
      };
      const out = deserializeArticle(prismaRow);
      expect(out.tags).toEqual([]);
      expect(out.platforms).toEqual([]);
      expect(out.aiGeneratedParts).toEqual([]);
    });

    it('defaults missing fields to empty array', () => {
      const prismaRow = { id: 'a1' };
      const out = deserializeArticle(prismaRow);
      expect(out.tags).toEqual([]);
      expect(out.platforms).toEqual([]);
      expect(out.aiGeneratedParts).toEqual([]);
    });

    it('falls back to empty array on malformed JSON (no throw)', () => {
      const prismaRow = {
        id: 'a1',
        tags: '{not valid json',
        platforms: 'also bad',
      };
      const out = deserializeArticle(prismaRow);
      expect(out.tags).toEqual([]);
      expect(out.platforms).toEqual([]);
    });

    it('returns the article as-is when null/undefined', () => {
      expect(deserializeArticle(null as any)).toBeNull();
      expect(deserializeArticle(undefined as any)).toBeUndefined();
    });

    it('preserves nested relation fields (e.g. author/editor/story) untouched', () => {
      const prismaRow = {
        id: 'a1',
        tags: '["a"]',
        author: { id: 'u1', name: 'Author' },
        editor: null,
        story: { id: 's1', title: 'Story' },
      };
      const out = deserializeArticle(prismaRow);
      expect(out.author).toEqual({ id: 'u1', name: 'Author' });
      expect(out.editor).toBeNull();
      expect(out.story).toEqual({ id: 's1', title: 'Story' });
    });

    it('is idempotent: re-deserializing a parsed object leaves it intact', () => {
      const prismaRow = { id: 'a1', tags: '["a"]' };
      const once = deserializeArticle(prismaRow);
      const twice = deserializeArticle(once);
      expect(twice.tags).toEqual(['a']);
    });
  });

  describe('serializeArticleInput', () => {
    it('stringifies array fields to JSON', () => {
      const input = {
        title: 'Hello',
        tags: ['news', 'ai'],
        platforms: ['FACEBOOK'],
      };
      const out = serializeArticleInput(input);
      expect(out.tags).toBe('["news","ai"]');
      expect(out.platforms).toBe('["FACEBOOK"]');
    });

    it('stringifies object fields to JSON', () => {
      const input = {
        tags: [],
        aiGeneratedParts: { title: true, content: true },
      };
      const out = serializeArticleInput(input);
      expect(out.aiGeneratedParts).toBe('{"title":true,"content":true}');
    });

    it('preserves non-JSON fields untouched', () => {
      const input = {
        title: 'Hello',
        version: 3,
        tags: ['a'],
      };
      const out = serializeArticleInput(input);
      expect(out.title).toBe('Hello');
      expect(out.version).toBe(3);
    });

    it('omits undefined JSON fields (Prisma keeps existing value)', () => {
      const input = {
        title: 'Hello',
        tags: undefined,
        platforms: undefined,
      };
      const out = serializeArticleInput(input);
      expect('tags' in out && out.tags === undefined).toBe(true);
      // 'tags' key still present with undefined value — caller can decide
      // whether to pass it; Prisma treats undefined as "do not update".
    });

    it('keeps explicit null as null (lets Prisma write SQL NULL)', () => {
      const input = {
        tags: null,
      };
      const out = serializeArticleInput(input);
      expect(out.tags).toBeNull();
    });

    it('is idempotent on already-serialized string input', () => {
      // Service may receive data that has been pre-stringified by
      // nested helpers (e.g. auto-publish pipeline). Re-serializing would
      // produce a double-encoded string.
      const input = {
        tags: '["a"]',
      };
      const out = serializeArticleInput(input);
      expect(out.tags).toBe('["a"]');
    });

    it('handles empty array by emitting "[]"', () => {
      const input = { tags: [] };
      const out = serializeArticleInput(input);
      expect(out.tags).toBe('[]');
    });
  });
});
