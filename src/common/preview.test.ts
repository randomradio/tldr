import { describe, expect, it } from 'vitest';
import type { Settings } from './types';
import {
  buildDataPreview,
  buildDestinationPreviews,
  buildLlmPayloadPreview,
  chatCompletionsUrl,
  selectExcerpt
} from './preview';

const baseSettings: Settings = {
  llm: {
    baseUrl: 'https://llm.example.test/v1',
    model: 'test-model',
    jsonMode: true,
    maxChars: 1000
  },
  pinboard: {
    shared: true,
    toread: false
  },
  readwise: {},
  tagging: {
    knownTagLimit: 200,
    dedupeThreshold: 82,
    aliases: {}
  },
  privacy: {
    mode: 'title_excerpt'
  },
  advanced: {}
};

const previewInput = {
  title: 'A useful page',
  url: 'https://example.test/article',
  domain: 'example.test',
  text: 'x'.repeat(1200),
  knownTags: ['ai', 'reading']
};

describe('chatCompletionsUrl', () => {
  it('normalizes OpenAI-compatible base URLs', () => {
    expect(chatCompletionsUrl('https://llm.example.test/v1/')).toBe('https://llm.example.test/v1/chat/completions');
    expect(chatCompletionsUrl('https://llm.example.test/v1/chat/completions')).toBe('https://llm.example.test/v1/chat/completions');
  });

  it('rejects empty base URLs', () => {
    expect(() => chatCompletionsUrl('  ')).toThrow('LLM base URL is empty');
  });
});

describe('selectExcerpt', () => {
  it('omits page text in title-only mode', () => {
    expect(selectExcerpt('page text', 'title_only', 1000)).toBeUndefined();
  });

  it('limits title-plus-excerpt mode to 800 characters', () => {
    expect(selectExcerpt('x'.repeat(1200), 'title_excerpt', 1000)).toHaveLength(800);
  });

  it('uses the configured max character limit in full-truncated mode', () => {
    expect(selectExcerpt('x'.repeat(1200), 'full_truncated', 450)).toHaveLength(450);
  });
});

describe('buildLlmPayloadPreview', () => {
  it('marks excerpt content as expandable and keeps secrets out of the payload preview', () => {
    const preview = buildLlmPayloadPreview(previewInput, baseSettings);
    const excerpt = preview.fields.find((field) => field.key === 'excerpt');

    expect(preview.endpoint).toBe('https://llm.example.test/v1/chat/completions');
    expect(excerpt).toMatchObject({ expandable: true, charCount: 800 });
    expect(preview.doesNotSend).toContain('LLM API key');
    expect(preview.doesNotSend).toContain('Pinboard token');
  });

  it('reports that no page text is sent in title-only mode', () => {
    const preview = buildLlmPayloadPreview(previewInput, {
      ...baseSettings,
      privacy: { mode: 'title_only' }
    });

    expect(preview.fields.some((field) => field.key === 'excerpt')).toBe(false);
  });
});

describe('buildDestinationPreviews', () => {
  it('shows configured destinations without exposing token values', () => {
    const destinations = buildDestinationPreviews(baseSettings, {
      pinboardConfigured: true,
      readwiseConfigured: true,
      exportTargets: { goodlinks: true, readwise: true }
    });

    expect(destinations.find((destination) => destination.id === 'pinboard')).toMatchObject({
      status: 'active',
      receives: ['page URL', 'title', 'tags', 'short excerpt', 'shared/toread flags']
    });
    expect(destinations.find((destination) => destination.id === 'readwise')).toMatchObject({ status: 'active' });
    expect(destinations.find((destination) => destination.id === 'goodlinks')).toMatchObject({ status: 'active' });
    expect(JSON.stringify(destinations)).not.toContain('token');
  });

  it('shows Readwise as a capture destination when capture is enabled', () => {
    const destinations = buildDestinationPreviews(baseSettings, {
      pinboardConfigured: false,
      readwiseConfigured: true,
      readwiseCaptureEnabled: true,
      exportTargets: { goodlinks: false, readwise: false }
    });

    expect(destinations.find((destination) => destination.id === 'readwise')).toMatchObject({
      status: 'active',
      receives: ['page URL', 'title', 'tags', 'summary or excerpt', 'source']
    });
  });

  it('marks disabled or unconfigured integrations as not receiving data', () => {
    const destinations = buildDestinationPreviews(baseSettings, {
      pinboardConfigured: false,
      readwiseConfigured: false,
      exportTargets: { goodlinks: false, readwise: false }
    });

    expect(destinations.find((destination) => destination.id === 'pinboard')).toMatchObject({
      status: 'not_configured',
      receives: []
    });
    expect(destinations.find((destination) => destination.id === 'readwise')).toMatchObject({
      status: 'disabled',
      receives: []
    });
    expect(destinations.find((destination) => destination.id === 'goodlinks')).toMatchObject({
      status: 'disabled',
      receives: []
    });
  });
});

describe('buildDataPreview', () => {
  it('combines LLM payload and destination summaries', () => {
    const preview = buildDataPreview(previewInput, baseSettings, {
      pinboardConfigured: false,
      readwiseConfigured: false
    });

    expect(preview.llm.fields.map((field) => field.key)).toContain('title');
    expect(preview.destinations).toHaveLength(4);
  });
});
