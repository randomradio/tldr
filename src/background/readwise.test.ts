import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@common/types';
import {
  buildReadwiseSaveBody,
  buildReadwiseUpdateBody,
  parseReadwiseDocumentResponse,
  readwiseInputFromItem,
  readwiseUpdateUrl,
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
