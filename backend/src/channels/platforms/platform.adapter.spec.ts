import { extractJsonFromOutput } from './platform.adapter';

describe('extractJsonFromOutput', () => {
  it('should parse direct JSON', () => {
    const result = extractJsonFromOutput('{"title": "Hello", "content": "World"}');
    expect(result).toEqual({ title: 'Hello', content: 'World' });
  });

  it('should extract JSON from markdown code fence', () => {
    const result = extractJsonFromOutput('```json\n{"title": "Hello"}\n```');
    expect(result).toEqual({ title: 'Hello' });
  });

  it('should extract JSON from plain code fence', () => {
    const result = extractJsonFromOutput('```\n{"title": "Hello"}\n```');
    expect(result).toEqual({ title: 'Hello' });
  });

  it('should extract JSON object from text', () => {
    const result = extractJsonFromOutput('Some text before\n{"title": "Hello"}\nSome text after');
    expect(result).toEqual({ title: 'Hello' });
  });

  it('should return null for invalid JSON', () => {
    const result = extractJsonFromOutput('This is not JSON at all');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = extractJsonFromOutput('');
    expect(result).toBeNull();
  });

  it('should handle nested JSON objects', () => {
    const json = JSON.stringify({
      title: 'Test',
      content: 'Content',
      tags: ['#tag1', '#tag2'],
      meta: { author: 'AI' },
    });
    const result = extractJsonFromOutput(json);
    expect(result).toEqual({
      title: 'Test',
      content: 'Content',
      tags: ['#tag1', '#tag2'],
      meta: { author: 'AI' },
    });
  });
});
