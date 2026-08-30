import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@common/types';

vi.mock('@common/storage', () => ({
  getSettings: vi.fn(),
  getSecret: vi.fn()
}));

import { getSecret, getSettings } from '@common/storage';
import {
  buildReadwiseSaveBody,
  buildReadwiseUpdateBody,
  parseReadwiseDocumentResponse,
  patchReadwiseReaderDocument,
  postReadwiseReaderDocument,
  readwiseInputFromItem,
  readwiseUpdateUrl,
  saveToReadwiseReader,
  syncReadwiseDocument
} from './readwise';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

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

describe('buildReadwiseUpdateBody', () => {
  it('includes only provided update fields', () => {
    expect(buildReadwiseUpdateBody({ tags: ['ai'] })).toEqual({ tags: ['ai'] });
    expect(buildReadwiseUpdateBody({
      title: 'Title',
      summary: 'Summary',
      tags: ['ai']
    })).toEqual({
      title: 'Title',
      summary: 'Summary',
      tags: ['ai']
    });
    expect(buildReadwiseUpdateBody({})).toEqual({});
  });
});

describe('readwiseUpdateUrl', () => {
  it('encodes the document id in the PATCH URL', () => {
    expect(readwiseUpdateUrl('doc/1')).toBe('https://readwise.io/api/v3/update/doc%2F1/');
  });
});

describe('parseReadwiseDocumentResponse', () => {
  it('treats HTTP 200 as an existing document', () => {
    expect(parseReadwiseDocumentResponse(200, {
      id: 'doc-1',
      url: 'https://read.readwise.io/read/doc-1'
    })).toEqual({
      id: 'doc-1',
      url: 'https://read.readwise.io/read/doc-1',
      alreadyExists: true
    });
  });

  it('treats HTTP 201 as a newly created document', () => {
    expect(parseReadwiseDocumentResponse(201, { id: 'doc-2' })).toEqual({
      id: 'doc-2',
      url: undefined,
      alreadyExists: false
    });
  });

  it('ignores non-object payloads', () => {
    expect(parseReadwiseDocumentResponse(201, 'nope')).toEqual({
      id: undefined,
      url: undefined,
      alreadyExists: false
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
      status: 'tagged',
      readwiseDocumentId: 'doc-1'
    };

    expect(readwiseInputFromItem(item)).toEqual({
      url: 'https://example.test/post',
      title: 'Example post',
      summary: 'Readable excerpt',
      tags: ['ai', 'reading'],
      savedUsing: 'tldr',
      documentId: 'doc-1'
    });
  });

  it('falls back to the URL when the title is empty', () => {
    expect(readwiseInputFromItem({
      id: '1',
      url: 'https://example.test/post',
      domain: 'example.test',
      title: '',
      createdAt: 1,
      tags: [],
      status: 'tagged'
    }).title).toBe('https://example.test/post');
  });
});

describe('postReadwiseReaderDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a save payload and parses the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, {
      id: 'doc-9',
      url: 'https://read.readwise.io/read/doc-9'
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postReadwiseReaderDocument('tok', {
      url: 'https://example.test/post',
      title: 'Post'
    })).resolves.toEqual({
      id: 'doc-9',
      url: 'https://read.readwise.io/read/doc-9',
      alreadyExists: false
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://readwise.io/api/v3/save/');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('throws on a non-OK save response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, {})));
    await expect(postReadwiseReaderDocument('tok', { url: 'https://example.test/post' })).rejects.toThrow('Readwise error 400');
  });
});

describe('patchReadwiseReaderDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('patches tags and keeps the document id when the body omits it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));
    await expect(patchReadwiseReaderDocument('tok', 'doc-1', { tags: ['ai'] })).resolves.toEqual({
      id: 'doc-1',
      url: undefined,
      alreadyExists: true
    });
  });

  it('throws on a non-OK update response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    await expect(patchReadwiseReaderDocument('tok', 'doc-1', { tags: ['ai'] })).rejects.toThrow('Readwise error 404');
  });
});

describe('saveToReadwiseReader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when no token is configured', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
      pinboard: { shared: true, toread: false },
      readwise: {},
      tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
      privacy: { mode: 'title_excerpt' }
    });
    await expect(saveToReadwiseReader({ url: 'https://example.test/post' })).rejects.toThrow('Readwise token not set');
  });

  it('throws when the token reference has no stored secret', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
      pinboard: { shared: true, toread: false },
      readwise: { apiTokenRef: 'readwise_token' },
      tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
      privacy: { mode: 'title_excerpt' }
    });
    vi.mocked(getSecret).mockResolvedValue(undefined);
    await expect(saveToReadwiseReader({ url: 'https://example.test/post' })).rejects.toThrow('Readwise token not set');
  });

  it('loads the stored token and syncs the document', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
      pinboard: { shared: true, toread: false },
      readwise: { apiTokenRef: 'readwise_token' },
      tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
      privacy: { mode: 'title_excerpt' }
    });
    vi.mocked(getSecret).mockResolvedValue('rw_token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { id: 'doc-3' })));

    await expect(saveToReadwiseReader({ url: 'https://example.test/post', title: 'Post' })).resolves.toMatchObject({
      id: 'doc-3',
      alreadyExists: false
    });
  });
});

describe('syncReadwiseDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('patches when a document id is already known', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      id: 'doc-1',
      url: 'https://read.readwise.io/read/doc-1'
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncReadwiseDocument('tok', {
      url: 'https://example.test/post',
      title: 'Example post',
      tags: ['ai'],
      documentId: 'doc-1'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(readwiseUpdateUrl('doc-1'));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(result).toMatchObject({ id: 'doc-1', alreadyExists: true });
  });

  it('patches tags when save reports the document already exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        id: 'doc-1',
        url: 'https://read.readwise.io/read/doc-1'
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        id: 'doc-1',
        url: 'https://read.readwise.io/read/doc-1'
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncReadwiseDocument('tok', {
      url: 'https://example.test/post',
      title: 'Example post',
      tags: ['ai', 'reading']
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v3/save/');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(readwiseUpdateUrl('doc-1'));
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      title: 'Example post',
      tags: ['ai', 'reading']
    });
    expect(result.alreadyExists).toBe(true);
  });

  it('does not patch a newly created document', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, {
      id: 'doc-9',
      url: 'https://read.readwise.io/read/doc-9'
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncReadwiseDocument('tok', {
      url: 'https://example.test/post',
      tags: ['ai']
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: 'doc-9',
      url: 'https://read.readwise.io/read/doc-9',
      alreadyExists: false
    });
  });
});
