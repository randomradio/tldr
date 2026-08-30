import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, Settings } from '@common/types';

vi.mock('@common/storage', () => ({
  getSettings: vi.fn(),
  getTags: vi.fn(),
  findItemByUrl: vi.fn(),
  getSyncRecord: vi.fn(),
  setSyncRecord: vi.fn(),
  upsertItem: vi.fn(),
  updateTags: vi.fn()
}));

vi.mock('./llm', () => ({ generateTags: vi.fn() }));
vi.mock('./pinboard', () => ({ addToPinboard: vi.fn() }));
vi.mock('./readwise', () => ({
  readwiseInputFromItem: vi.fn((item: Item) => ({
    url: item.url,
    title: item.title,
    summary: item.excerpt,
    tags: item.tags
  })),
  saveToReadwiseReader: vi.fn()
}));

import { findItemByUrl, getSettings, getSyncRecord, getTags, setSyncRecord, updateTags, upsertItem } from '@common/storage';
import { generateTags } from './llm';
import { addToPinboard } from './pinboard';
import { saveToReadwiseReader } from './readwise';
import { captureAndSync } from './pipeline';

const settings: Settings = {
  llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
  pinboard: { shared: true, toread: false },
  readwise: { saveOnCapture: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' }
};

const input = {
  url: 'https://example.test/post',
  title: 'Example post',
  domain: 'example.test',
  text: 'A useful excerpt about tagging.'
};

describe('captureAndSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getTags).mockResolvedValue({ ai: { slug: 'ai', count: 3 } });
    vi.mocked(findItemByUrl).mockResolvedValue(undefined);
    vi.mocked(getSyncRecord).mockResolvedValue(undefined);
    vi.mocked(setSyncRecord).mockResolvedValue(undefined);
    vi.mocked(upsertItem).mockResolvedValue(undefined);
    vi.mocked(updateTags).mockResolvedValue(undefined);
    vi.mocked(generateTags).mockResolvedValue(['ai', 'reading']);
    vi.mocked(addToPinboard).mockResolvedValue(undefined);
    vi.mocked(saveToReadwiseReader).mockResolvedValue({});
  });

  it('saves locally and reports skipped destinations when integrations are off', async () => {
    const result = await captureAndSync(input);

    expect(result.tags).toEqual(['ai', 'reading']);
    expect(result.destinations.map((destination) => [destination.id, destination.status])).toEqual([
      ['local', 'success'],
      ['llm', 'success'],
      ['pinboard', 'skipped'],
      ['readwise', 'skipped']
    ]);
    expect(upsertItem).toHaveBeenCalled();
    expect(addToPinboard).not.toHaveBeenCalled();
  });

  it('still saves locally when tagging fails', async () => {
    vi.mocked(generateTags).mockRejectedValue(new Error('LLM error 401: unauthorized'));

    const result = await captureAndSync(input);

    expect(result.item.status).toBe('tagged');
    expect(result.tags).toEqual([]);
    expect(result.destinations.find((destination) => destination.id === 'llm')).toMatchObject({
      status: 'error',
      error: 'LLM error 401: unauthorized'
    });
    expect(result.destinations.find((destination) => destination.id === 'local')?.status).toBe('success');
    expect(upsertItem).toHaveBeenCalled();
    expect(updateTags).not.toHaveBeenCalled();
  });

  it('syncs to Pinboard when a token is configured', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { ...settings.pinboard, authTokenRef: 'pin_token' }
    });

    const result = await captureAndSync(input);

    expect(addToPinboard).toHaveBeenCalled();
    expect(result.destinations.find((destination) => destination.id === 'pinboard')).toMatchObject({
      status: 'success'
    });
    expect(setSyncRecord).toHaveBeenCalledWith(expect.objectContaining({ service: 'pinboard', status: 'ok' }));
  });
});
