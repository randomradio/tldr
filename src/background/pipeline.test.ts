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

import { captureSyncFingerprint } from '@common/capture';
import { selectExcerpt } from '@common/preview';
import { findItemByUrl, getItem, getSettings, getSyncRecord, getTags, setSyncRecord, updateTags, upsertItem } from '@common/storage';
import { generateTags } from './llm';
import { addToPinboard } from './pinboard';
import { saveToReadwiseReader } from './readwise';
import { captureAndSync, retryDestination, tagAndMaybeSync, updateCapturedTags } from './pipeline';

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

  it('reuses existing tags when the page payload is unchanged', async () => {
    vi.mocked(findItemByUrl).mockResolvedValue(savedItem({
      tags: ['ai', 'reading'],
      excerpt: 'A useful excerpt about tagging.'
    }));

    const result = await captureAndSync(input);
    expect(generateTags).not.toHaveBeenCalled();
    expect(result.destinations.find((destination) => destination.id === 'llm')).toMatchObject({
      status: 'skipped',
      message: 'Reused existing tags'
    });
    expect(result.tags).toEqual(['ai', 'reading']);
  });

  it('skips Pinboard when the fingerprint is already synced', async () => {
    const excerpt = selectExcerpt(input.text, settings.privacy.mode, settings.llm.maxChars);
    const fingerprint = captureSyncFingerprint({
      url: input.url,
      title: input.title,
      excerpt,
      tags: ['ai', 'reading']
    });
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { ...settings.pinboard, authTokenRef: 'pin_token' }
    });
    vi.mocked(getSyncRecord).mockImplementation(async (_itemId, service) => (
      service === 'pinboard'
        ? { itemId: 'item-1', service: 'pinboard', status: 'ok', lastHash: fingerprint, updatedAt: 1 }
        : undefined
    ));

    const result = await captureAndSync(input);
    expect(result.destinations.find((destination) => destination.id === 'pinboard')).toMatchObject({
      status: 'skipped',
      message: 'Already synced to Pinboard'
    });
    expect(addToPinboard).not.toHaveBeenCalled();
  });

  it('reports a Pinboard error without failing the local save', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { ...settings.pinboard, authTokenRef: 'pin_token' }
    });
    vi.mocked(addToPinboard).mockRejectedValue(new Error('Pinboard error 500'));

    const result = await captureAndSync(input);
    expect(result.destinations.find((destination) => destination.id === 'pinboard')).toMatchObject({
      status: 'error',
      error: 'Pinboard error 500'
    });
    expect(setSyncRecord).toHaveBeenCalledWith(expect.objectContaining({ service: 'pinboard', status: 'error' }));
    expect(result.destinations.find((destination) => destination.id === 'local')?.status).toBe('success');
  });

  it('marks an unchanged existing item as already saved locally', async () => {
    vi.mocked(findItemByUrl).mockResolvedValue(savedItem({
      excerpt: 'A useful excerpt about tagging.',
      status: 'synced'
    }));

    const result = await captureAndSync(input);
    expect(generateTags).not.toHaveBeenCalled();
    expect(result.destinations.find((destination) => destination.id === 'local')).toMatchObject({
      status: 'success',
      message: 'Already saved locally'
    });
    expect(result.item.status).toBe('synced');
  });

  it('skips Pinboard when capture is disabled even if a token is set', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      pinboard: { ...settings.pinboard, authTokenRef: 'pin_token', saveOnCapture: false }
    });

    const result = await captureAndSync(input);
    expect(addToPinboard).not.toHaveBeenCalled();
    expect(result.destinations.find((destination) => destination.id === 'pinboard')).toMatchObject({
      status: 'skipped',
      message: 'Pinboard capture disabled'
    });
  });

  it('errors when Readwise capture is enabled without a token', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      readwise: { saveOnCapture: true }
    });

    const result = await captureAndSync(input);
    expect(result.destinations.find((destination) => destination.id === 'readwise')).toMatchObject({
      status: 'error',
      message: 'Readwise capture enabled but token is missing'
    });
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

  it('returns a tagging error without losing the saved item', async () => {
    vi.mocked(generateTags).mockRejectedValue(new Error('down'));
    const result = await retryDestination('item-1', 'llm');
    expect(result.destinations.find((destination) => destination.id === 'llm')).toMatchObject({
      status: 'error',
      error: 'down'
    });
  });

  it('retries Readwise', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      readwise: { saveOnCapture: true, apiTokenRef: 'readwise_token' }
    });
    vi.mocked(saveToReadwiseReader).mockResolvedValue({
      id: 'doc-1',
      url: 'https://read.readwise.io/read/doc-1'
    });
    const result = await retryDestination('item-1', 'readwise');
    expect(saveToReadwiseReader).toHaveBeenCalled();
    expect(result.destinations.find((destination) => destination.id === 'readwise')?.status).toBe('success');
  });

  it('throws when the item is missing or the destination cannot be retried', async () => {
    vi.mocked(getItem).mockResolvedValue(undefined);
    await expect(retryDestination('missing', 'pinboard')).rejects.toThrow('Saved item not found');
    vi.mocked(getItem).mockResolvedValue(savedItem());
    await expect(retryDestination('item-1', 'local')).rejects.toThrow('Cannot retry local');
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

  it('throws when the item is missing', async () => {
    vi.mocked(getItem).mockResolvedValue(undefined);
    await expect(updateCapturedTags('missing', ['ai'])).rejects.toThrow('Saved item not found');
  });
});

describe('tagAndMaybeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getTags).mockResolvedValue({});
    vi.mocked(getItem).mockResolvedValue(undefined);
    vi.mocked(findItemByUrl).mockResolvedValue(undefined);
    vi.mocked(getSyncRecord).mockResolvedValue(undefined);
    vi.mocked(setSyncRecord).mockResolvedValue(undefined);
    vi.mocked(upsertItem).mockResolvedValue(undefined);
    vi.mocked(updateTags).mockResolvedValue(undefined);
    vi.mocked(generateTags).mockResolvedValue(['ai']);
  });

  it('returns the captured item', async () => {
    const item = await tagAndMaybeSync(input);
    expect(item.url).toBe(input.url);
    expect(item.tags).toEqual(['ai']);
  });
});
