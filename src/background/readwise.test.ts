import { describe, expect, it } from 'vitest';
import type { Item } from '@common/types';
import { buildReadwiseSaveBody, readwiseInputFromItem } from './readwise';

describe('buildReadwiseSaveBody', () => {
  it('builds a Reader save payload with tags and tldr source metadata', () => {
    expect(buildReadwiseSaveBody({
      url: 'https://example.test/post',
      title: 'Example post',
      summary: 'Short summary',
      tags: ['ai', 'reading']
    })).toEqual({
      url: 'https://example.test/post',
      title: 'Example post',
      summary: 'Short summary',
      tags: ['ai', 'reading'],
      saved_using: 'tldr'
    });
  });

  it('keeps optional fields undefined when not present', () => {
    expect(buildReadwiseSaveBody({ url: 'https://example.test/post' })).toEqual({
      url: 'https://example.test/post',
      title: undefined,
      summary: undefined,
      tags: [],
      saved_using: 'tldr'
    });
  });
});

describe('readwiseInputFromItem', () => {
  it('maps a saved item into a Reader save input', () => {
    const item: Item = {
      id: '1',
      url: 'https://example.test/post',
      domain: 'example.test',
      title: 'Example post',
      excerpt: 'Readable excerpt',
      createdAt: 1,
      tags: ['ai', 'reading'],
      status: 'tagged'
    };

    expect(readwiseInputFromItem(item)).toEqual({
      url: 'https://example.test/post',
      title: 'Example post',
      summary: 'Readable excerpt',
      tags: ['ai', 'reading'],
      savedUsing: 'tldr'
    });
  });
});
