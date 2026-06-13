import { describe, it, expect, beforeEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PromptLoader, substitute } from './prompt-loader';

describe('substitute (pure)', () => {
  it('replaces a single variable', () => {
    expect(substitute('Hello {{name}}', { name: 'world' })).toBe('Hello world');
  });

  it('replaces multiple variables', () => {
    expect(
      substitute('{{a}} and {{b}}', { a: '1', b: '2' }),
    ).toBe('1 and 2');
  });

  it('tolerates whitespace inside placeholders', () => {
    expect(substitute('{{  x  }}', { x: 'ok' })).toBe('ok');
  });

  it('replaces the same variable multiple times', () => {
    expect(substitute('{{x}}-{{x}}-{{x}}', { x: 'A' })).toBe('A-A-A');
  });

  it('throws when a referenced variable is missing', () => {
    expect(() => substitute('Hello {{name}}', {})).toThrow(/name/);
  });

  it('throws listing all missing variables at once', () => {
    expect(() => substitute('{{a}} and {{b}}', { a: '1' })).toThrow(/b/);
  });

  it('ignores extra variables in the input', () => {
    expect(substitute('{{a}}', { a: '1', b: '2' })).toBe('1');
  });

  it('leaves text without placeholders unchanged', () => {
    expect(substitute('plain text', { a: '1' })).toBe('plain text');
  });
});

describe('PromptLoader (file I/O)', () => {
  let tmpDir: string;
  let loader: PromptLoader;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prompt-loader-'));
    loader = new PromptLoader(tmpDir);
  });

  it('loads a template from category/name.txt', () => {
    mkdirSync(join(tmpDir, 'writing'));
    writeFileSync(join(tmpDir, 'writing', 'rewrite.txt'), 'Rewrite: {{text}}');

    const out = loader.render('writing', 'rewrite', { text: 'hello' });
    expect(out).toBe('Rewrite: hello');
  });

  it('caches templates in memory (second call does not re-read)', () => {
    mkdirSync(join(tmpDir, 'writing'));
    const path = join(tmpDir, 'writing', 'rewrite.txt');
    writeFileSync(path, 'v1: {{text}}');
    expect(loader.render('writing', 'rewrite', { text: 'x' })).toBe('v1: x');

    // Overwrite the file — loader should still return cached value.
    writeFileSync(path, 'v2: {{text}}');
    expect(loader.render('writing', 'rewrite', { text: 'x' })).toBe('v1: x');
  });

  it('clearCache forces a re-read', () => {
    mkdirSync(join(tmpDir, 'writing'));
    const path = join(tmpDir, 'writing', 'rewrite.txt');
    writeFileSync(path, 'v1: {{text}}');
    loader.render('writing', 'rewrite', { text: 'x' });

    writeFileSync(path, 'v2: {{text}}');
    loader.clearCache();
    expect(loader.render('writing', 'rewrite', { text: 'x' })).toBe('v2: x');
  });

  it('throws a readable error if the template file does not exist', () => {
    expect(() => loader.load('nope', 'missing')).toThrow();
  });

  it('throws when rendering with missing variables', () => {
    mkdirSync(join(tmpDir, 'writing'));
    writeFileSync(join(tmpDir, 'writing', 'rewrite.txt'), 'Rewrite: {{text}}');
    expect(() => loader.render('writing', 'rewrite', {})).toThrow(/text/);
  });
});
