import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, Settings } from '@common/types';

vi.mock('@common/storage', () => ({
  getSettings: vi.fn(),
  getSecret: vi.fn(),
  getTags: vi.fn(),
  updateTags: vi.fn()
}));

import { getSecret, getSettings, getTags, updateTags } from '@common/storage';
import { addToPinboard, importTagsFromPinboard, listRecentFromPinboard } from './pinboard';

const settings: Settings = {
  llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
  pinboard: { authTokenRef: 'pin_token', shared: true, toread: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' }
};

const item: Item = {
  id: '1',
  url: 'https://example.test/post',
  domain: 'example.test',
  title: 'Example post',
  excerpt: 'x'.repeat(300),
  createdAt: 1,
  tags: ['ai', 'reading'],
  status: 'tagged'
};

describe('addToPinboard', () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getSecret).mockResolvedValue('user:token');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('throws when no token is configured', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { shared: true, toread: false }
    });
    await expect(addToPinboard(item)).rejects.toThrow('Pinboard token not set');
  });

  it('posts the bookmark and truncates the excerpt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result_code: 'done' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await addToPinboard(item);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('https://api.pinboard.in/v1/posts/add?');
    expect(url).toContain('auth_token=user%3Atoken');
    expect(new URL(url).searchParams.get('extended')).toHaveLength(250);
    expect(new URL(url).searchParams.get('tags')).toBe('ai reading');
    expect(new URL(url).searchParams.get('shared')).toBe('yes');
    expect(new URL(url).searchParams.get('toread')).toBe('no');
  });

  it('sends private and toread flags from settings', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { ...settings.pinboard, shared: false, toread: true }
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result_code: 'done' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await addToPinboard({ ...item, title: '', excerpt: undefined, tags: [] });
    const params = new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams;
    expect(params.get('description')).toBe(item.url);
    expect(params.get('shared')).toBe('no');
    expect(params.get('toread')).toBe('yes');
  });

  it('retries after 429 and then reports rate limiting', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const pending = addToPinboard(item);
    const expectation = expect(pending).rejects.toThrow('Pinboard rate limited');
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('throws on HTTP errors and non-done result codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    }));
    await expect(addToPinboard(item)).rejects.toThrow('Pinboard error 500');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result_code: 'something went wrong' })
    }));
    await expect(addToPinboard(item)).rejects.toThrow('Pinboard: something went wrong');
  });
});

describe('importTagsFromPinboard', () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getSecret).mockResolvedValue('user:token');
    vi.mocked(getTags).mockResolvedValue({ local: { slug: 'local', count: 1 } });
    vi.mocked(updateTags).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when no token is configured', async () => {
    vi.mocked(getSecret).mockResolvedValue(undefined);
    await expect(importTagsFromPinboard()).rejects.toThrow('Pinboard token not set');
  });

  it('merges remote counts and returns the imported tag count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ AI: 4, reading: 2 })
    }));

    await expect(importTagsFromPinboard()).resolves.toBe(2);
    expect(updateTags).toHaveBeenCalledWith({
      local: { slug: 'local', count: 1 },
      ai: { slug: 'ai', count: 4 },
      reading: { slug: 'reading', count: 2 }
    });
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    await expect(importTagsFromPinboard()).rejects.toThrow('Pinboard error 403');
  });
});

describe('listRecentFromPinboard', () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getSecret).mockResolvedValue('user:token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when no token is configured', async () => {
    vi.mocked(getSecret).mockResolvedValue(undefined);
    await expect(listRecentFromPinboard()).rejects.toThrow('Pinboard token not set');
  });

  it('maps posts, splits tags, drops empty URLs, and clamps the count', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        posts: [
          { href: 'https://example.test/a', description: 'A', tags: 'AI Reading' },
          { href: '', description: 'Missing' },
          { href: 'https://example.test/b', tags: '' }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const posts = await listRecentFromPinboard(500);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('count=100');
    expect(posts).toEqual([
      { url: 'https://example.test/a', title: 'A', tags: ['ai', 'reading'] },
      { url: 'https://example.test/b', title: 'https://example.test/b', tags: [] }
    ]);
  });

  it('returns an empty list when the response has no posts array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    }));
    await expect(listRecentFromPinboard(0)).resolves.toEqual([]);
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(listRecentFromPinboard(10)).rejects.toThrow('Pinboard error 401');
  });
});
