import { describe, expect, it } from 'vitest';
import { originPattern } from './origins';

describe('originPattern', () => {
  it('builds an optional-host-permission pattern', () => {
    expect(originPattern('https://api.moonshot.cn/v1')).toBe('https://api.moonshot.cn/*');
    expect(originPattern('http://localhost:11434/v1/')).toBe('http://localhost:11434/*');
  });

  it('rejects empty, invalid, and non-http URLs', () => {
    expect(originPattern('')).toBeNull();
    expect(originPattern('not a url')).toBeNull();
    expect(originPattern('chrome://extensions')).toBeNull();
  });
});
