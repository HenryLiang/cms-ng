import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load AI prompt templates from disk with simple {{var}} substitution.
 *
 * Why: prompts are hard-coded strings inside ai.service.ts today. Moving
 * them to .txt files lets ops/PMs iterate on wording without touching
 * TypeScript code (no rebuild needed for prompt-only changes in dev).
 *
 * Conventions:
 * - Templates live under `<cwd>/src/ai/prompts/<category>/<name>.txt` by
 *   default. Callers can pass an explicit `baseDir` to override.
 * - Variables use `{{name}}` mustache-style placeholders.
 * - Missing variables throw (fail loud) — better than silently producing
 *   malformed prompts.
 * - Unknown variables (the file has {{foo}} but the caller doesn't pass
 *   `foo`) are left in place, so a future template can add a new variable
 *   without immediately breaking the caller.
 */
export class PromptLoader {
  private cache = new Map<string, string>();
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    // Default: <cwd>/src/ai/prompts
    //   - dev: CWD is the backend dir, so this resolves to ./src/ai/prompts
    //   - prod: deployers should either (a) set CWD to backend/ at startup,
    //     or (b) inject a baseDir via the PromptLoader constructor.
    //   - tests: pass an explicit tmp dir.
    this.baseDir = baseDir ?? join(process.cwd(), 'src', 'ai', 'prompts');
  }

  /**
   * Load a template by category + name, e.g. loader.load('writing', 'rewrite').
   * Result is cached in memory.
   */
  load(category: string, name: string): string {
    const key = `${category}/${name}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const path = join(this.baseDir, category, `${name}.txt`);
    const text = readFileSync(path, 'utf8');
    this.cache.set(key, text);
    return text;
  }

  /**
   * Load a template and substitute {{var}} placeholders. Throws if a
   * variable is referenced in the template but not provided.
   */
  render(category: string, name: string, vars: Record<string, string>): string {
    const template = this.load(category, name);
    return substitute(template, vars);
  }

  /** Test-only: clear the in-memory cache. */
  clearCache(): void {
    this.cache.clear();
  }
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Pure substitute function, exported for unit testing.
 * - Replaces every {{var}} with vars[var].
 * - Throws if a referenced var is missing.
 * - If vars has an extra key not referenced in the template, it's ignored.
 */
export function substitute(
  template: string,
  vars: Record<string, string>,
): string {
  const missing = new Set<string>();
  const result = template.replace(PLACEHOLDER, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    missing.add(key);
    return match;
  });
  if (missing.size > 0) {
    throw new Error(
      `Prompt template references variables not provided: ${[...missing].map((k) => `{{${k}}}`).join(', ')}`,
    );
  }
  return result;
}
