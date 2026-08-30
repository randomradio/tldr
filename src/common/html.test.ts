import { describe, expect, it } from 'vitest';
import { escapeHtml, safeHttpUrl } from './html';

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<img src=x onerror="alert('xss')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;'
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello')).toBe('hello');
  });
});

describe('safeHttpUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(safeHttpUrl('https://example.test/a')).toBe('https://example.test/a');
  });

  it('rejects javascript and other schemes', () => {
    expect(safeHttpUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(safeHttpUrl('javascript:alert(1)')).toBe('#');
    expect(safeHttpUrl('not a url')).toBe('#');
  });
});
