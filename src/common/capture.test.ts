import { describe, expect, it } from 'vitest';
import { captureSyncFingerprint } from './capture';

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
