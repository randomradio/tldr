import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import { applyItemToIndex, buildItemIndex, emptyItemIndex, isStoredItem } from './item-index';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'url' | 'createdAt'>): Item {
  return {
    domain: 'example.test',
    title: partial.title || partial.url,
    tags: [],
    status: 'tagged',
    ...partial
  };
}

describe('isStoredItem', () => {
  it('rejects secrets and tag maps', () => {
    expect(isStoredItem('sk-secret')).toBe(false);
    expect(isStoredItem({ ai: { slug: 'ai', count: 1 } })).toBe(false);
  });
});

describe('buildItemIndex', () => {
  it('indexes only item: records and keeps the newest id per URL', () => {
    const index = buildItemIndex({
      llm_api_key: 'sk-secret',
      tags: { ai: { slug: 'ai', count: 4 } },
      'item:old': item({ id: 'old', url: 'https://example.test/post', createdAt: 1, title: 'Old' }),
      'item:new': item({ id: 'new', url: 'https://example.test/post', createdAt: 2, title: 'New' }),
      'item:other': item({ id: 'other', url: 'https://example.test/other', createdAt: 3, title: 'Other' })
    });

    expect(index.ids).toEqual(['other', 'new', 'old']);
    expect(index.byUrl).toEqual({
      'https://example.test/post': 'new',
      'https://example.test/other': 'other'
    });
  });
});

describe('applyItemToIndex', () => {
  it('moves an updated item to the front and rewrites its URL mapping', () => {
    const next = applyItemToIndex(
      {
        ids: ['a', 'b'],
        byUrl: {
          'https://example.test/a': 'a',
          'https://example.test/b': 'b'
        }
      },
      item({ id: 'a', url: 'https://example.test/moved', createdAt: 10 }),
      'https://example.test/a'
    );

    expect(next.ids).toEqual(['a', 'b']);
    expect(next.byUrl).toEqual({
      'https://example.test/moved': 'a',
      'https://example.test/b': 'b'
    });
  });

  it('starts from an empty index', () => {
    const next = applyItemToIndex(
      emptyItemIndex(),
      item({ id: 'a', url: 'https://example.test/a', createdAt: 1 })
    );
    expect(next).toEqual({
      ids: ['a'],
      byUrl: { 'https://example.test/a': 'a' }
    });
  });
});
