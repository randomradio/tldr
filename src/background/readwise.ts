import { getSecret, getSettings } from '@common/storage';
import type { Item } from '@common/types';

export interface ReadwiseSaveInput {
  url: string;
  title?: string;
  summary?: string;
  tags?: string[];
  savedUsing?: string;
}

export interface ReadwiseSaveResponse {
  id?: string;
  url?: string;
  alreadyExists?: boolean;
}

export function buildReadwiseSaveBody(input: ReadwiseSaveInput): Record<string, unknown> {
  return {
    url: input.url,
    title: input.title || undefined,
    summary: input.summary || undefined,
    tags: input.tags || [],
    saved_using: input.savedUsing || 'tldr'
  };
}

export function readwiseInputFromItem(item: Item): ReadwiseSaveInput {
  return {
    url: item.url,
    title: item.title || item.url,
    summary: item.excerpt,
    tags: item.tags,
    savedUsing: 'tldr'
  };
}

export async function postReadwiseReaderDocument(token: string, input: ReadwiseSaveInput): Promise<ReadwiseSaveResponse> {
  const res = await fetch('https://readwise.io/api/v3/save/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${token}`
    },
    body: JSON.stringify(buildReadwiseSaveBody(input))
  });

  if (!res.ok) throw new Error(`Readwise error ${res.status}`);

  const data = await res.json().catch(() => ({}));
  return {
    id: typeof data?.id === 'string' ? data.id : undefined,
    url: typeof data?.url === 'string' ? data.url : undefined,
    alreadyExists: res.status === 200
  };
}

export async function saveToReadwiseReader(input: ReadwiseSaveInput): Promise<ReadwiseSaveResponse> {
  const settings = await getSettings();
  const token = settings.readwise?.apiTokenRef ? await getSecret(settings.readwise.apiTokenRef) : undefined;
  if (!token) throw new Error('Readwise token not set');
  return postReadwiseReaderDocument(token, input);
}
