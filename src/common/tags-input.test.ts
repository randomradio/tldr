import { describe, expect, it } from 'vitest';
import { parseTagInput } from './tags-input';

describe('parseTagInput', () => {
  it('splits comma-separated tags and drops empties', () => {
    expect(parseTagInput(' ai, reading, ,climate-tech ')).toEqual(['ai', 'reading', 'climate-tech']);
  });
});
