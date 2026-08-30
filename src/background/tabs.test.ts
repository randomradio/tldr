import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFromActiveTab } from './tabs';

describe('extractFromActiveTab', () => {
  let executeScript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeScript = vi.fn();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      scripting: { executeScript }
    };
  });

  it('injects Readability then returns the extracted page payload', async () => {
    executeScript
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result: { url: 'https://example.test', title: 'Post', domain: 'example.test', text: 'Hello' } }]);

    await expect(extractFromActiveTab(12)).resolves.toEqual({
      url: 'https://example.test',
      title: 'Post',
      domain: 'example.test',
      text: 'Hello'
    });
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 12 },
      files: ['readability.js']
    });
  });

  it('still extracts when Readability injection fails', async () => {
    executeScript
      .mockRejectedValueOnce(new Error('missing file'))
      .mockResolvedValueOnce([{ result: { url: 'https://example.test', title: 'Post', domain: 'example.test', text: 'Fallback' } }]);

    await expect(extractFromActiveTab(3)).resolves.toMatchObject({ text: 'Fallback' });
  });

  it('throws when the tab does not return extractable content', async () => {
    executeScript
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}]);

    await expect(extractFromActiveTab(9)).rejects.toThrow('Could not extract the current tab');
  });
});
