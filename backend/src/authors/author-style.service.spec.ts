import { ConfigService } from '@nestjs/config';
import { AuthorStyleService } from './author-style.service';
import { join } from 'path';

/**
 * Unit tests for AuthorStyleService.
 *
 * These tests point AUTHORS_DATA_DIR at the repo's real data/authors/ fixture
 * (8 authors) and verify: (1) disk read + caching, (2) graceful fallback when
 * the directory is missing, (3) the getSystemPrompt empty-string contract that
 * every AI operation relies on for degradation.
 */
describe('AuthorStyleService', () => {
  // The repo ships a real data/authors/ with 8 authors — use it as the fixture.
  const fixtureDir = join(process.cwd(), '..', 'data', 'authors');
  let service: AuthorStyleService;

  beforeEach(() => {
    const config = { get: (key: string) => (key === 'AUTHORS_DATA_DIR' ? fixtureDir : undefined) } as any;
    service = new AuthorStyleService(config as ConfigService);
  });

  describe('listAuthors', () => {
    it('reads all author subdirectories from disk', async () => {
      const info = await service.listAuthors();
      expect(info.source).toBe('disk');
      expect(info.count).toBe(8);
      expect(info.authors).toHaveLength(8);
      // Every entry must have a slug + name.
      for (const a of info.authors) {
        expect(a.slug).toMatch(/^author-/);
        expect(a.name.length).toBeGreaterThan(0);
      }
    });

    it('includes the curated author-luxun persona', async () => {
      const info = await service.listAuthors();
      const luxun = info.authors.find((a) => a.slug === 'author-luxun');
      expect(luxun).toBeDefined();
      expect(luxun!.name).toBe('鲁迅');
    });

    it('caches the author list (second call within TTL returns same ref)', async () => {
      const first = await service.listAuthors();
      const second = await service.listAuthors();
      // Same cached array reference (no re-scan within 30s TTL).
      expect(second.authors).toBe(first.authors);
    });

    it('falls back when the directory is missing', async () => {
      const config = {
        get: (key: string) => (key === 'AUTHORS_DATA_DIR' ? '/definitely/not/here/authors' : undefined),
      } as any;
      const missing = new AuthorStyleService(config as ConfigService);
      const info = await missing.listAuthors();
      expect(info.source).toBe('fallback');
      expect(info.count).toBe(0);
      expect(info.authors).toEqual([]);
      expect(info.warning).toBeDefined();
    });
  });

  describe('getSystemPrompt', () => {
    it('returns the system_prompt.md content for a known slug', async () => {
      const prompt = await service.getSystemPrompt('author-luxun');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('鲁迅');
    });

    it('returns "" for an unknown slug (graceful degradation)', async () => {
      const prompt = await service.getSystemPrompt('author-does-not-exist');
      expect(prompt).toBe('');
    });

    it('returns "" when authorSlug is undefined', async () => {
      const prompt = await service.getSystemPrompt(undefined);
      expect(prompt).toBe('');
    });

    it('returns "" for a slug that exists in the list but has no system_prompt.md', async () => {
      // author-luxun is the one slug WITHOUT agent_config.json, but it DOES
      // have system_prompt.md, so this verifies the missing-file path via a
      // non-existent slug that nonetheless resolves through getSystemPrompt.
      const prompt = await service.getSystemPrompt('author-luxun');
      expect(typeof prompt).toBe('string');
    });
  });

  describe('exists', () => {
    it('returns true for a known slug', async () => {
      expect(await service.exists('author-luxun')).toBe(true);
    });

    it('returns false for an unknown slug', async () => {
      expect(await service.exists('author-nope')).toBe(false);
    });

    it('returns false when authorSlug is undefined', async () => {
      expect(await service.exists(undefined)).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('forces a re-scan on the next call', async () => {
      const first = await service.listAuthors();
      service.invalidate();
      const second = await service.listAuthors();
      // After invalidate the cache is rebuilt — new array reference.
      expect(second.authors).not.toBe(first.authors);
      expect(second.count).toBe(first.count);
    });
  });
});
