import { describe, expect, it } from 'vitest';
import { captureSyncFingerprint, hasCaptureError } from './capture';
import type { CaptureResult } from './capture';

describe('captureSyncFingerprint', () => {
  it('is stable when tag order changes', () => {
    const left = captureSyncFingerprint({
      url: 'https://example.test/post',
      title: 'Post',
      excerpt: 'Summary',
      tags: ['reading', 'ai']
    });
    const right = captureSyncFingerprint({
      url: 'https://example.test/post',
      title: 'Post',
      excerpt: 'Summary',
      tags: ['ai', 'reading']
    });

    expect(left).toBe(right);
  });

  it('changes when synced content changes', () => {
    const before = captureSyncFingerprint({
      url: 'https://example.test/post',
      title: 'Post',
      excerpt: 'Summary',
      tags: ['ai']
    });
    const after = captureSyncFingerprint({
      url: 'https://example.test/post',
      title: 'Post',
      excerpt: 'Updated summary',
      tags: ['ai']
    });

    expect(before).not.toBe(after);
  });
});

describe('hasCaptureError', () => {
  it('is true when any destination failed', () => {
    const result: CaptureResult = {
      item: {
        id: '1',
        url: 'https://example.test/post',
        domain: 'example.test',
        title: 'Post',
        createdAt: 1,
        tags: [],
        status: 'error'
      },
      tags: [],
      destinations: [
        { id: 'local', label: 'Local library', status: 'success', message: 'Saved locally' },
        { id: 'llm', label: 'LLM tags', status: 'error', message: 'Tagging failed', error: 'LLM error 401' }
      ]
    };

    expect(hasCaptureError(result)).toBe(true);
  });
});
