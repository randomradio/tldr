import { describe, expect, it } from 'vitest';
import { parseTagInput } from './tags-input';

describe('parseTagInput', () => {
  it('splits comma-separated tags and drops empties', () => {
    expect(parseTagInput(' ai, reading, ,climate-tech ')).toEqual(['ai', 'reading', 'climate-tech']);
  });

  it('splits newline-separated tags and ignores blank input', () => {
    expect(parseTagInput('ai\nreading\n')).toEqual(['ai', 'reading']);
    expect(parseTagInput('   ')).toEqual([]);
  });
});
