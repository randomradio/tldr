import { describe, expect, it } from 'vitest';
import type { Settings } from '@common/types';
import { canonicalizeTags, similarity, slugify } from './tags';

const settings: Settings = {
  llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
  pinboard: { shared: true, toread: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: { colour: 'color' } },
  privacy: { mode: 'title_excerpt' }
};

describe('slugify', () => {
  it('normalizes latin tags', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  AI__ML  ')).toBe('ai-ml');
  });

  it('keeps CJK and other letters so non-English tags are not dropped', () => {
    expect(slugify('机器学习')).toBe('机器学习');
    expect(slugify('Résumé notes')).toBe('resume-notes');
  });

  it('returns empty for punctuation-only input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('similarity', () => {
  it('scores exact slugs at 100 and different slugs lower', () => {
    expect(similarity('machine-learning', 'machine-learning')).toBe(100);
    expect(similarity('ai', 'climate')).toBeLessThan(50);
  });
});

describe('canonicalizeTags', () => {
  it('maps aliases and exact known tags', () => {
    expect(canonicalizeTags(['Colour', 'AI'], ['ai', 'color'], settings)).toEqual(['color', 'ai']);
  });

  it('merges near-duplicates into known tags', () => {
    expect(canonicalizeTags(['machinelearning'], ['machine-learning'], settings)).toEqual(['machine-learning']);
  });

  it('keeps genuinely new tags and drops empty slugs', () => {
    expect(canonicalizeTags(['climate-tech', '!!!'], ['ai'], settings)).toEqual(['climate-tech']);
  });

  it('dedupes repeated candidates', () => {
    expect(canonicalizeTags(['AI', 'ai', 'AI'], ['ai'], settings)).toEqual(['ai']);
  });
});
