import { describe, expect, it } from 'vitest';
import { mergePinboardTagCounts } from './pinboard';

describe('mergePinboardTagCounts', () => {
  it('uses Pinboard counts as the source of truth instead of accumulating', () => {
    const merged = mergePinboardTagCounts(
      { ai: { slug: 'ai', count: 4 }, local: { slug: 'local', count: 1 } },
      { AI: 2, reading: 5 }
    );

    expect(merged).toEqual({
      ai: { slug: 'ai', count: 2 },
      local: { slug: 'local', count: 1 },
      reading: { slug: 'reading', count: 5 }
    });
  });

  it('treats non-numeric Pinboard counts as zero', () => {
    expect(mergePinboardTagCounts({}, { broken: Number.NaN })).toEqual({
      broken: { slug: 'broken', count: 0 }
    });
  });
});
