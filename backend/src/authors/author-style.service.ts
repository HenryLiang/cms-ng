import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, readdir, stat } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { safeJsonParse } from '../common/json.utils';

/**
 * A single author persona loaded from disk.
 */
export interface AuthorSummary {
  slug: string;
  name: string;
  fields: string[];
  bio: string;
}

/**
 * Source-of-truth status reported to the frontend via GET /authors.
 * - 'disk'    : data/authors/ exists and has at least one author.
 * - 'fallback': directory missing or empty — author-style feature is
 *               disabled and the app falls back to default generation.
 */
export interface AuthorSourceInfo {
  authors: AuthorSummary[];
  source: 'disk' | 'fallback';
  count: number;
  warning?: string;
}

interface AuthorCacheEntry {
  /** ISO-like timestamp (ms) the cache was populated. */
  populatedAt: number;
  /** Full author list (only present if the directory scan succeeded). */
  authors: AuthorSummary[] | null;
  /** Per-slug system-prompt cache (keyed by slug). */
  prompts: Map<string, string>;
}

/** Cache TTL in ms. The author directory is hand-maintained and may change at
 * runtime (authors added/removed without a restart), so we re-scan the disk
 * periodically rather than caching once for the process lifetime. */
const CACHE_TTL_MS = 30_000;

@Injectable()
export class AuthorStyleService {
  private readonly logger = new Logger(AuthorStyleService.name);
  private readonly authorsDir: string;

  /** In-memory cache — see CACHE_TTL_MS. Reset on demand via invalidate(). */
  private cache: AuthorCacheEntry = {
    populatedAt: 0,
    authors: null,
    prompts: new Map(),
  };

  constructor(private config: ConfigService) {
    const configured = this.config.get<string>('AUTHORS_DATA_DIR') || '';
    // Default to <cwd>/data/authors so it works in both dev (repo root) and
    // prod (backend/ is the cwd — point AUTHORS_DATA_DIR at the real path).
    this.authorsDir =
      configured && isAbsolute(configured)
        ? configured
        : join(process.cwd(), 'data', 'authors');

    // Eagerly detect on boot so the absence is logged once at startup.
    this.detectOnBoot();
  }

  /**
   * Returns the author list + data-source status for GET /authors.
   * Reads from the 30s cache; on cache miss it scans the disk.
   * Never throws — on any error returns an empty fallback list.
   */
  async listAuthors(): Promise<AuthorSourceInfo> {
    const authors = await this.getCachedAuthors();
    if (authors && authors.length > 0) {
      return {
        authors,
        source: 'disk',
        count: authors.length,
      };
    }
    return {
      authors: [],
      source: 'fallback',
      count: 0,
      warning:
        '未检测到作者风格数据（data/authors/ 目录不存在或为空），将使用默认生成方式',
    };
  }

  /**
   * Returns the system-prompt text for the given author slug, or '' if the
   * slug is absent / not found. The empty-string contract is what lets every
   * AI operation degrade gracefully — caller simply appends '' to the system
   * message and behavior is unchanged from today.
   */
  async getSystemPrompt(slug?: string): Promise<string> {
    if (!slug) return '';
    const cached = this.cache.prompts.get(slug);
    if (cached !== undefined) return cached;

    // Ensure the author list is fresh (and that the slug actually exists).
    const authors = await this.getCachedAuthors();
    if (!authors || !authors.some((a) => a.slug === slug)) {
      // Slug unknown (e.g. author was deleted from disk since last load).
      this.logger.warn(
        `Author slug "${slug}" not found on disk — falling back to default generation`,
      );
      return '';
    }

    const prompt = await this.readSystemPromptFile(slug);
    this.cache.prompts.set(slug, prompt);
    return prompt;
  }

  /** True if author-style data is available AND the slug resolves. */
  async exists(slug?: string): Promise<boolean> {
    if (!slug) return false;
    const prompt = await this.getSystemPrompt(slug);
    return prompt.length > 0;
  }

  /** Force a re-scan on the next call (used by tests / manual refresh). */
  invalidate(): void {
    this.cache = { populatedAt: 0, authors: null, prompts: new Map() };
  }

  // ===== internals =====

  private async getCachedAuthors(): Promise<AuthorSummary[] | null> {
    const now = Date.now();
    if (this.cache.authors && now - this.cache.populatedAt < CACHE_TTL_MS) {
      return this.cache.authors;
    }
    const authors = await this.scanAuthors();
    this.cache = {
      populatedAt: now,
      authors,
      prompts: new Map(),
    };
    return authors;
  }

  /**
   * Scans each subdirectory of the authors dir. Each subdirectory must contain
   * a profile.json (for name/fields/bio) — system_prompt.md is loaded lazily
   * by getSystemPrompt(). Returns null if the directory is missing/unreadable,
   * never throws.
   */
  private async scanAuthors(): Promise<AuthorSummary[] | null> {
    try {
      const entries = await readdir(this.authorsDir, { withFileTypes: true });
      const authorDirs = entries.filter((e) => e.isDirectory());
      if (authorDirs.length === 0) {
        return [];
      }

      const summaries: AuthorSummary[] = [];
      for (const dir of authorDirs) {
        // Convention: directory name IS the slug (author-luxun, author-04efc6).
        const slug = dir.name;
        const summary = await this.readProfileSummary(slug);
        if (summary) summaries.push(summary);
      }
      // Stable order by name so the frontend dropdown is deterministic.
      summaries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
      return summaries;
    } catch (err: any) {
      // ENOENT (missing dir) is the common case in prod without the data
      // folder — treat as "no authors" rather than crashing the request.
      if (err?.code === 'ENOENT') {
        return [];
      }
      this.logger.warn(
        `Failed to scan authors directory ${this.authorsDir}: ${err?.message || err}`,
      );
      return null;
    }
  }

  private async readProfileSummary(
    slug: string,
  ): Promise<AuthorSummary | null> {
    const profilePath = join(this.authorsDir, slug, 'profile.json');
    try {
      const raw = await readFile(profilePath, 'utf-8');
      const profile = safeJsonParse<{
        author_name?: string;
        name?: string;
        top_categories?: [string, number][];
        top_tags?: [string, number][];
      }>(raw, {});

      const name = profile.author_name || profile.name || slug;
      // Derive a short fields list from top categories/tags (deduped, capped).
      const fields = this.deriveFields(profile);
      const bio = await this.deriveBio(slug, name, fields);

      return { slug, name, fields, bio };
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      this.logger.warn(
        `Failed to read profile for author "${slug}": ${err?.message || err}`,
      );
      return null;
    }
  }

  private async readSystemPromptFile(slug: string): Promise<string> {
    const promptPath = join(this.authorsDir, slug, 'system_prompt.md');
    try {
      const text = await readFile(promptPath, 'utf-8');
      return text.trim();
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        this.logger.warn(
          `system_prompt.md missing for author "${slug}" — falling back to default generation`,
        );
        return '';
      }
      this.logger.warn(
        `Failed to read system_prompt.md for author "${slug}": ${err?.message || err}`,
      );
      return '';
    }
  }

  /** Best-effort field list from profile categories/tags. */
  private deriveFields(profile: {
    top_categories?: [string, number][];
    top_tags?: [string, number][];
  }): string[] {
    const fields = new Set<string>();
    (profile.top_categories || []).forEach(([label]) => {
      if (label) fields.add(String(label));
    });
    (profile.top_tags || []).forEach(([label]) => {
      if (label) fields.add(String(label));
    });
    return Array.from(fields).slice(0, 5);
  }

  /** Short one-line bio for the dropdown subtitle. */
  private async deriveBio(
    slug: string,
    name: string,
    fields: string[],
  ): Promise<string> {
    if (fields.length > 0) {
      return `${name} · ${fields.slice(0, 3).join(' / ')}`;
    }
    return name;
  }

  private detectOnBoot(): void {
    // Non-blocking: stat the dir and log the result. Errors are swallowed —
    // listAuthors() will report the same condition per-request.
    stat(this.authorsDir)
      .then(() => {
        this.logger.log(
          `Author-style data directory detected at ${this.authorsDir}. Authors will be loaded on first request.`,
        );
      })
      .catch(() => {
        this.logger.warn(
          `Author-style data directory NOT found at ${this.authorsDir}. ` +
            `Author-style feature is disabled; the app will use default generation. ` +
            `(Set AUTHORS_DATA_DIR or copy data/authors/ into place to enable.)`,
        );
      });
  }
}
