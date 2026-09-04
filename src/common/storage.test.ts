import { beforeEach, describe, expect, it } from 'vitest';
import type { Item } from './types';
import { ITEM_INDEX_KEY } from './item-index';
import {
  findItemByUrl,
  getItem,
  getSecret,
  getSettings,
  getSyncRecord,
  getTags,
  listItems,
  setSecret,
  setSettings,
  setSyncRecord,
  updateTags,
  upsertItem
} from './storage';

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

  it('returns undefined for a URL that is not indexed', async () => {
    expect(await findItemByUrl('https://missing.test')).toBeUndefined();
    expect(await listItems()).toEqual([]);
  });

  it('rewrites the index when an item URL changes', async () => {
    await upsertItem(sample('a', 'https://example.test/a', 1));
    await upsertItem({ ...sample('a', 'https://example.test/moved', 2), title: 'moved' });

    expect(await findItemByUrl('https://example.test/a')).toBeUndefined();
    expect((await findItemByUrl('https://example.test/moved'))?.title).toBe('moved');
  });
});

describe('getSettings and setSettings', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { lastError: undefined },
      storage: {
        local: createMemoryArea(),
        sync: createMemoryArea()
      }
    };
  });

  it('returns merged defaults when nothing is stored', async () => {
    const settings = await getSettings();
    expect(settings.privacy.mode).toBe('title_excerpt');
    expect(settings.llm.model).toBe('kimi-k2-0905-preview');
    expect(settings.pinboard.saveOnCapture).toBe(true);
    expect(settings.readwise?.saveOnCapture).toBe(false);
  });

  it('rejects when chrome.storage reports lastError', async () => {
    (chrome.runtime as { lastError?: { message: string } }).lastError = { message: 'quota exceeded' };
    await expect(getSettings()).rejects.toThrow('quota exceeded');
  });

  it('persists a merged settings object', async () => {
    await setSettings({
      llm: { baseUrl: 'http://localhost:11434/v1', model: 'llama3', jsonMode: true, maxChars: 100 },
      pinboard: { shared: false, toread: true },
      tagging: { knownTagLimit: 10, dedupeThreshold: 90, aliases: {} },
      privacy: { mode: 'title_only' }
    });
    const settings = await getSettings();
    expect(settings.llm.model).toBe('llama3');
    expect(settings.pinboard.shared).toBe(false);
    expect(settings.privacy.mode).toBe('title_only');
    expect(settings.readwise?.saveOnCapture).toBe(false);
  });
});

describe('getSecret and setSecret', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { lastError: undefined },
      storage: {
        local: createMemoryArea(),
        sync: createMemoryArea()
      }
    };
  });

  it('stores, reads, and clears secrets', async () => {
    expect(await getSecret('')).toBeUndefined();
    await setSecret('', 'ignored');
    await setSecret('llm_api_key', 'sk-test');
    expect(await getSecret('llm_api_key')).toBe('sk-test');
    await setSecret('llm_api_key', '');
    expect(await getSecret('llm_api_key')).toBeUndefined();
  });
});

describe('getTags and updateTags', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { lastError: undefined },
      storage: {
        local: createMemoryArea(),
        sync: createMemoryArea()
      }
    };
  });

  it('returns an empty map by default and persists updates', async () => {
    expect(await getTags()).toEqual({});
    await updateTags({ ai: { slug: 'ai', count: 2 } });
    expect(await getTags()).toEqual({ ai: { slug: 'ai', count: 2 } });
  });
});

describe('getSyncRecord and setSyncRecord', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { lastError: undefined },
      storage: {
        local: createMemoryArea(),
        sync: createMemoryArea()
      }
    };
  });

  it('stores and reads a sync record, defaulting the service to pinboard', async () => {
    expect(await getSyncRecord('item-1')).toBeUndefined();
    await setSyncRecord({
      itemId: 'item-1',
      service: 'pinboard',
      status: 'ok',
      lastHash: 'hash',
      updatedAt: 10
    });
    expect(await getSyncRecord('item-1')).toMatchObject({ status: 'ok', lastHash: 'hash' });
    await setSyncRecord({
      itemId: 'item-1',
      service: 'readwise',
      status: 'error',
      lastError: 'nope',
      updatedAt: 11
    });
    expect(await getSyncRecord('item-1', 'readwise')).toMatchObject({ status: 'error', lastError: 'nope' });
  });
});
