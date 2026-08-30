import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@common/types';

vi.mock('@common/storage', () => ({
  getSettings: vi.fn(),
  getSecret: vi.fn()
}));

import { getSecret, getSettings } from '@common/storage';
import { extractErrorDetail, generateTags } from './llm';

const settings: Settings = {
  llm: {
    baseUrl: 'https://llm.example.test/v1',
    model: 'test-model',
    apiKeyRef: 'llm_api_key',
    jsonMode: true,
    maxChars: 20
  },
  pinboard: { shared: true, toread: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' }
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('extractErrorDetail', () => {
  it('reads nested API error fields and falls back to raw text', () => {
    expect(extractErrorDetail('')).toBeUndefined();
    expect(extractErrorDetail('{"error":{"message":"bad key"}}')).toBe('bad key');
    expect(extractErrorDetail('{"detail":"nope"}')).toBe('nope');
    expect(extractErrorDetail('{"message":"oops"}')).toBe('oops');
    expect(extractErrorDetail('  not-json  ')).toBe('not-json');
    expect(extractErrorDetail('{"ok":true}')).toBeUndefined();
  });
});

describe('generateTags', () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(getSecret).mockResolvedValue('sk-test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses JSON tags, lowercases them, and dedupes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({ tags: [{ name: 'AI' }, { name: 'ai' }, { name: 'reading' }, { name: '' }] })
        }
      }]
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      excerpt: 'x'.repeat(50),
      knownTags: ['ai']
    })).resolves.toEqual(['ai', 'reading']);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content).toContain('Excerpt: xxxxxxxxxxxxxxxxxxxx');
  });

  it('extracts JSON embedded in model prose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Sure.\n{"tags":[{"name":"climate"}]}\n' } }]
    })));

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).resolves.toEqual(['climate']);
  });

  it('joins array content parts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: [{ text: '{"tags":[{"name":"notes"}]}' }] } }]
    })));

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).resolves.toEqual(['notes']);
  });

  it('returns an empty list when the model omits tags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '{"ok":true}' } }]
    })));

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).resolves.toEqual([]);
  });

  it('omits the API key header and JSON mode when they are not configured', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      ...settings,
      llm: { ...settings.llm, apiKeyRef: undefined, jsonMode: false }
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '{"tags":[{"name":"notes"}]}' } }]
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).resolves.toEqual(['notes']);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body)).response_format).toBeUndefined();
  });

  it('throws a host-permission hint on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));
    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).rejects.toThrow('Verify the LLM host permission');
  });

  it('includes API error details from a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"unauthorized"}}',
      json: async () => ({})
    } as unknown as Response));

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).rejects.toThrow('LLM error 401: unauthorized');
  });

  it('throws when the response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('nope');
      },
      text: async () => 'html'
    } as unknown as Response));

    await expect(generateTags({
      title: 'Post',
      url: 'https://example.test/post',
      domain: 'example.test',
      knownTags: []
    })).rejects.toThrow('LLM returned a non-JSON response');
  });
});
