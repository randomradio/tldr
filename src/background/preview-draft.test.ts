import { describe, expect, it } from 'vitest';
import type { Settings } from '@common/types';
import { knownTagNames, settingsWithPreviewDraft } from './preview-draft';

const settings: Settings = {
  llm: { baseUrl: 'https://llm.example.test/v1', model: 'test', jsonMode: true, maxChars: 1000 },
  pinboard: { shared: true, toread: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' }
};

describe('settingsWithPreviewDraft', () => {
  it('returns the original settings when no draft is provided', () => {
    expect(settingsWithPreviewDraft(settings)).toBe(settings);
  });

  it('overrides LLM and privacy fields from the draft', () => {
    const next = settingsWithPreviewDraft(settings, {
      llmBaseUrl: 'http://localhost:11434/v1',
      llmModel: 'llama3',
      llmMaxChars: 250,
      privacyMode: 'title_only'
    });

    expect(next.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(next.llm.model).toBe('llama3');
    expect(next.llm.maxChars).toBe(250);
    expect(next.privacy.mode).toBe('title_only');
    expect(next.llm.jsonMode).toBe(true);
  });

  it('keeps the stored maxChars when the draft value is not finite', () => {
    const next = settingsWithPreviewDraft(settings, { llmMaxChars: Number.NaN });
    expect(next.llm.maxChars).toBe(1000);
  });
});

describe('knownTagNames', () => {
  it('orders tags by count and applies the limit', () => {
    expect(knownTagNames({
      rare: { slug: 'rare', count: 1 },
      ai: { slug: 'ai', count: 9 },
      reading: { slug: 'reading', count: 4 }
    }, 2)).toEqual(['ai', 'reading']);
  });
});
