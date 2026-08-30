import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@common/types';

vi.mock('@common/storage', () => ({
  getSettings: vi.fn(),
  getSecret: vi.fn()
}));

vi.mock('./readwise', () => ({
  syncReadwiseDocument: vi.fn()
}));

import { getSecret, getSettings } from '@common/storage';
import { syncReadwiseDocument } from './readwise';
import { exportToGoodlinks, exportToReadwise } from './exporters';

const settings: Settings = {
  llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
  pinboard: { shared: true, toread: false },
  readwise: { apiTokenRef: 'readwise_token' },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' }
};

describe('exportToGoodlinks', () => {
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    create = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a GoodLinks URL for each item', async () => {
    const pending = exportToGoodlinks([
      { url: 'https://example.test/a', title: 'A', tags: ['ai'] },
      { url: 'https://example.test/b', title: '', tags: [] }
    ]);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(2);

    expect(create).toHaveBeenCalledTimes(2);
    expect(String(create.mock.calls[0]?.[0]?.url)).toContain('goodlinks://add?url=https%3A%2F%2Fexample.test%2Fa');
    expect(String(create.mock.calls[0]?.[0]?.url)).toContain('tags=ai');
  });

  it('skips items that fail to open and still counts successes', async () => {
    create
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(undefined);
    const pending = exportToGoodlinks([
      { url: 'https://example.test/a', title: 'A', tags: [] },
      { url: 'https://example.test/b', title: 'B', tags: [] }
    ]);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(1);
  });
});

describe('exportToReadwise', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getSecret).mockResolvedValue('rw_token');
    vi.mocked(syncReadwiseDocument).mockResolvedValue({ id: 'doc-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when no token is configured', async () => {
    vi.mocked(getSecret).mockResolvedValue(undefined);
    await expect(exportToReadwise([{ url: 'https://example.test/a', title: 'A', tags: [] }])).rejects.toThrow(
      'Readwise token not set'
    );
  });

  it('exports items and continues after an individual failure', async () => {
    vi.mocked(syncReadwiseDocument)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({ id: 'doc-2' });

    const pending = exportToReadwise([
      { url: 'https://example.test/a', title: 'A', tags: ['ai'] },
      { url: 'https://example.test/b', title: 'B', tags: [] }
    ]);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(1);
  });
});
