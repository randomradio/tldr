import { describe, expect, it } from 'vitest';
import { RETRY_DESTINATION, SHOW_CAPTURE, UPDATE_TAGS } from './messages';

describe('message types', () => {
  it('keeps capture toast message names stable', () => {
    expect(SHOW_CAPTURE).toBe('tldr:show-capture');
    expect(RETRY_DESTINATION).toBe('tldr:retry-destination');
    expect(UPDATE_TAGS).toBe('tldr:update-tags');
  });
});
