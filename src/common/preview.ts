import type { PrivacyMode, Settings } from './types';

export type DestinationId = 'llm' | 'pinboard' | 'readwise' | 'goodlinks';
export type DestinationStatus = 'active' | 'disabled' | 'not_configured';

export interface PreviewField {
  key: string;
  label: string;
  value?: string;
  charCount?: number;
  expandable?: boolean;
  sensitive?: boolean;
}

export interface DestinationPreview {
  id: DestinationId;
  label: string;
  status: DestinationStatus;
  statusText: string;
  receives: string[];
}

export interface LlmPayloadPreview {
  endpoint?: string;
  privacyMode: PrivacyMode;
  fields: PreviewField[];
  doesNotSend: string[];
}

export interface DataPreview {
  llm: LlmPayloadPreview;
  destinations: DestinationPreview[];
}

export interface PreviewInput {
  title: string;
  url: string;
  domain: string;
  text?: string;
  knownTags: string[];
}

export interface ExportTargets {
  goodlinks?: boolean;
  readwise?: boolean;
}

export interface DestinationState {
  pinboardConfigured: boolean;
  readwiseConfigured: boolean;
  exportTargets?: ExportTargets;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('LLM base URL is empty');
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

export function privacyModeLabel(mode: PrivacyMode): string {
  switch (mode) {
    case 'title_only':
      return 'Title only';
    case 'title_excerpt':
      return 'Title + excerpt';
    case 'full_truncated':
      return 'Readable text, truncated';
  }
}

export function privacyModeDescription(mode: PrivacyMode): string {
  switch (mode) {
    case 'title_only':
      return 'Sends page title, URL, domain, and tag context. No page text is sent.';
    case 'title_excerpt':
      return 'Sends page title, URL, domain, tag context, and a short excerpt.';
    case 'full_truncated':
      return 'Sends page title, URL, domain, tag context, and readable page text up to the configured character limit.';
  }
}

export function selectExcerpt(text: string | undefined, mode: PrivacyMode, maxChars: number): string | undefined {
  if (!text || mode === 'title_only') return undefined;
  const limit = mode === 'title_excerpt' ? Math.min(800, maxChars) : maxChars;
  return text.slice(0, Math.max(0, limit));
}

export function buildLlmPayloadPreview(input: PreviewInput, settings: Settings): LlmPayloadPreview {
  const excerpt = selectExcerpt(input.text, settings.privacy.mode, settings.llm.maxChars);
  const fields: PreviewField[] = [
    { key: 'title', label: 'Page title', value: input.title, charCount: input.title.length },
    { key: 'url', label: 'Page URL', value: input.url, charCount: input.url.length },
    { key: 'domain', label: 'Domain', value: input.domain, charCount: input.domain.length },
    {
      key: 'knownTags',
      label: 'Known tag context',
      value: input.knownTags.length ? `${input.knownTags.length} known tags` : 'No known tags',
      charCount: input.knownTags.join(', ').length
    }
  ];

  if (excerpt !== undefined) {
    fields.push({
      key: 'excerpt',
      label: settings.privacy.mode === 'title_excerpt' ? 'Excerpt' : 'Readable text',
      value: excerpt,
      charCount: excerpt.length,
      expandable: true
    });
  }

  let endpoint: string | undefined;
  try {
    endpoint = chatCompletionsUrl(settings.llm.baseUrl);
  } catch {
    endpoint = undefined;
  }

  return {
    endpoint,
    privacyMode: settings.privacy.mode,
    fields,
    doesNotSend: [
      'LLM API key',
      'Pinboard token',
      'Readwise token',
      'full browser history'
    ]
  };
}

export function buildDestinationPreviews(settings: Settings, state: DestinationState): DestinationPreview[] {
  const llmEndpoint = (() => {
    try {
      return chatCompletionsUrl(settings.llm.baseUrl);
    } catch {
      return undefined;
    }
  })();

  const exportTargets = state.exportTargets || {};

  return [
    {
      id: 'llm',
      label: 'LLM endpoint',
      status: llmEndpoint ? 'active' : 'not_configured',
      statusText: llmEndpoint ? `Configured: ${llmEndpoint}` : 'Not configured. No LLM payload will be sent.',
      receives: llmEndpoint
        ? ['page title', 'page URL', 'domain', 'known tag context', privacyModeLabel(settings.privacy.mode)]
        : []
    },
    {
      id: 'pinboard',
      label: 'Pinboard',
      status: state.pinboardConfigured ? 'active' : 'not_configured',
      statusText: state.pinboardConfigured
        ? 'Token configured. Save may sync bookmarks to Pinboard.'
        : 'Not configured. Pinboard will not receive data.',
      receives: state.pinboardConfigured
        ? ['page URL', 'title', 'tags', 'short excerpt', 'shared/toread flags']
        : []
    },
    {
      id: 'readwise',
      label: 'Readwise Reader',
      status: exportTargets.readwise ? (state.readwiseConfigured ? 'active' : 'not_configured') : 'disabled',
      statusText: exportTargets.readwise
        ? (state.readwiseConfigured ? 'Selected for export.' : 'Selected but token is not configured.')
        : 'Not selected. Readwise will not receive data.',
      receives: exportTargets.readwise && state.readwiseConfigured
        ? ['page URL', 'title', 'tags', 'source']
        : []
    },
    {
      id: 'goodlinks',
      label: 'GoodLinks',
      status: exportTargets.goodlinks ? 'active' : 'disabled',
      statusText: exportTargets.goodlinks ? 'Selected for export.' : 'Not selected. GoodLinks will not receive data.',
      receives: exportTargets.goodlinks ? ['page URL', 'title', 'tags'] : []
    }
  ];
}

export function buildDataPreview(input: PreviewInput, settings: Settings, state: DestinationState): DataPreview {
  return {
    llm: buildLlmPayloadPreview(input, settings),
    destinations: buildDestinationPreviews(settings, state)
  };
}
