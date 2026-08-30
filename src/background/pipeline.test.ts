import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, Settings } from '@common/types';

vi.mock('@common/storage', () => ({
  getSettings: vi.fn(),
  getTags: vi.fn(),
  getItem: vi.fn(),
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
    tags: item.tags,
    documentId: item.readwiseDocumentId
  })),
  saveToReadwiseReader: vi.fn()
}));

import { findItemByUrl, getItem, getSettings, getSyncRecord, getTags, setSyncRecord, updateTags, upsertItem } from '@common/storage';
import { generateTags } from './llm';
import { addToPinboard } from './pinboard';
import { saveToReadwiseReader } from './readwise';
import { captureAndSync, retryDestination, updateCapturedTags } from './pipeline';

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

function savedItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    url: input.url,
    domain: input.domain,
    title: input.title,
    excerpt: 'A useful excerpt about tagging.',
    createdAt: 1,
    tags: ['ai'],
    status: 'tagged',
    ...overrides
  };
}

describe('captureAndSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getTags).mockResolvedValue({ ai: { slug: 'ai', count: 3 } });
    vi.mocked(getItem).mockResolvedValue(undefined);
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

  it('stores the Readwise document id and Reader URL', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      readwise: { saveOnCapture: true, apiTokenRef: 'readwise_token' }
    });
    vi.mocked(saveToReadwiseReader).mockResolvedValue({
      id: 'doc-1',
      url: 'https://read.readwise.io/read/doc-1',
      alreadyExists: true
    });

    const result = await captureAndSync(input);

    expect(result.item.readwiseDocumentId).toBe('doc-1');
    expect(result.destinations.find((destination) => destination.id === 'readwise')).toMatchObject({
      status: 'success',
      message: 'Updated Readwise Reader',
      url: 'https://read.readwise.io/read/doc-1'
    });
    expect(upsertItem).toHaveBeenCalledWith(expect.objectContaining({ readwiseDocumentId: 'doc-1' }));
  });
});

describe('retryDestination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { ...settings.pinboard, authTokenRef: 'pin_token' }
    });
    vi.mocked(getTags).mockResolvedValue({ ai: { slug: 'ai', count: 3 } });
    vi.mocked(getItem).mockResolvedValue(savedItem());
    vi.mocked(getSyncRecord).mockResolvedValue(undefined);
    vi.mocked(setSyncRecord).mockResolvedValue(undefined);
    vi.mocked(upsertItem).mockResolvedValue(undefined);
    vi.mocked(updateTags).mockResolvedValue(undefined);
    vi.mocked(generateTags).mockResolvedValue(['ai', 'reading']);
    vi.mocked(addToPinboard).mockResolvedValue(undefined);
    vi.mocked(saveToReadwiseReader).mockResolvedValue({});
  });

  it('retries a failed Pinboard destination', async () => {
    const result = await retryDestination('item-1', 'pinboard');
    expect(addToPinboard).toHaveBeenCalled();
    expect(result.destinations.find((destination) => destination.id === 'pinboard')?.status).toBe('success');
  });

  it('retries tagging and then resyncs destinations', async () => {
    const result = await retryDestination('item-1', 'llm');
    expect(generateTags).toHaveBeenCalled();
    expect(result.tags).toEqual(['ai', 'reading']);
    expect(addToPinboard).toHaveBeenCalled();
  });
});

describe('updateCapturedTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      readwise: { saveOnCapture: true, apiTokenRef: 'readwise_token' }
    });
    vi.mocked(getTags).mockResolvedValue({ ai: { slug: 'ai', count: 3 } });
    vi.mocked(getItem).mockResolvedValue(savedItem({ readwiseDocumentId: 'doc-1' }));
    vi.mocked(getSyncRecord).mockResolvedValue(undefined);
    vi.mocked(setSyncRecord).mockResolvedValue(undefined);
    vi.mocked(upsertItem).mockResolvedValue(undefined);
    vi.mocked(updateTags).mockResolvedValue(undefined);
    vi.mocked(saveToReadwiseReader).mockResolvedValue({
      id: 'doc-1',
      url: 'https://read.readwise.io/read/doc-1',
      alreadyExists: true
    });
  });

  it('saves edited tags and updates Readwise', async () => {
    const result = await updateCapturedTags('item-1', ['reading', 'climate-tech']);
    expect(result.tags).toEqual(['reading', 'climate-tech']);
    expect(saveToReadwiseReader).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['reading', 'climate-tech'],
      documentId: 'doc-1'
    }));
    expect(result.destinations.find((destination) => destination.id === 'llm')).toMatchObject({
      status: 'skipped',
      message: 'Tags updated'
    });
  });
});
