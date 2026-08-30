import { beforeEach, describe, expect, it } from 'vitest';
import type { Item } from './types';
import { ITEM_INDEX_KEY } from './item-index';
import { findItemByUrl, getItem, listItems, upsertItem } from './storage';

function createMemoryArea() {
  let data: Record<string, unknown> = {};
  return {
    get(keys: string | string[] | Record<string, unknown> | null, cb: (items: Record<string, unknown>) => void) {
      if (keys === null) {
        cb({ ...data });
        return;
      }
      if (typeof keys === 'string') {
        cb(keys in data ? { [keys]: data[keys] } : {});
        return;
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const key of keys) if (key in data) out[key] = data[key];
        cb(out);
        return;
      }
      cb({ ...keys, ...data });
    },
    set(items: Record<string, unknown>, cb: () => void) {
      data = { ...data, ...items };
      cb();
    },
    remove(keys: string | string[], cb: () => void) {
      const list = Array.isArray(keys) ? keys : [keys];
      data = Object.fromEntries(Object.entries(data).filter(([key]) => !list.includes(key)));
      cb();
    },
    _dump() {
      return data;
    }
  };
}

describe('item storage index', () => {
  beforeEach(() => {
    const local = createMemoryArea();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { lastError: undefined },
      storage: {
        local,
        sync: createMemoryArea()
      }
    };
  });

  function sample(id: string, url: string, createdAt: number): Item {
    return {
      id,
      url,
      domain: 'example.test',
      title: id,
      createdAt,
      tags: ['ai'],
      status: 'tagged'
    };
  }

  it('looks up and lists items without reading unrelated local keys', async () => {
    const local = chrome.storage.local as unknown as { set: Function };
    await new Promise<void>((resolve) => local.set({ llm_api_key: 'sk-secret', tags: { ai: { slug: 'ai', count: 1 } } }, resolve));

    await upsertItem(sample('a', 'https://example.test/a', 1));
    await upsertItem(sample('b', 'https://example.test/b', 2));

    const dump = (chrome.storage.local as unknown as { _dump: () => Record<string, unknown> })._dump();
    expect(dump.llm_api_key).toBe('sk-secret');
    expect(dump[ITEM_INDEX_KEY]).toEqual({
      ids: ['b', 'a'],
      byUrl: {
        'https://example.test/a': 'a',
        'https://example.test/b': 'b'
      }
    });

    expect((await findItemByUrl('https://example.test/a'))?.id).toBe('a');
    expect((await listItems(1)).map((item) => item.id)).toEqual(['b']);
    expect((await getItem('b'))?.title).toBe('b');
  });

  it('rebuilds the index once from existing item: records', async () => {
    const local = chrome.storage.local as unknown as { set: Function };
    await new Promise<void>((resolve) => local.set({
      llm_api_key: 'sk-secret',
      'item:legacy': sample('legacy', 'https://example.test/legacy', 5)
    }, resolve));

    expect((await findItemByUrl('https://example.test/legacy'))?.id).toBe('legacy');
    const dump = (chrome.storage.local as unknown as { _dump: () => Record<string, unknown> })._dump();
    expect(dump[ITEM_INDEX_KEY]).toMatchObject({
      ids: ['legacy'],
      byUrl: { 'https://example.test/legacy': 'legacy' }
    });
  });
});
