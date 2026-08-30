import { getSecret, getSettings } from '@common/storage';
import type { Item } from '@common/types';

export interface ReadwiseSaveInput {
  url: string;
  title?: string;
  summary?: string;
  tags?: string[];
  savedUsing?: string;
  documentId?: string;
}

export interface ReadwiseSaveResponse {
  id?: string;
  url?: string;
  alreadyExists?: boolean;
}

export interface ReadwiseUpdateInput {
  title?: string;
  summary?: string;
  tags?: string[];
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

export function buildReadwiseUpdateBody(input: ReadwiseUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title) body.title = input.title;
  if (input.summary) body.summary = input.summary;
  if (input.tags) body.tags = input.tags;
  return body;
}

export function parseReadwiseDocumentResponse(status: number, data: unknown): ReadwiseSaveResponse {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    url: typeof record.url === 'string' ? record.url : undefined,
    alreadyExists: status === 200
  };
}

export function readwiseUpdateUrl(documentId: string): string {
  return `https://readwise.io/api/v3/update/${encodeURIComponent(documentId)}/`;
}

export function readwiseInputFromItem(item: Item): ReadwiseSaveInput {
  return {
    url: item.url,
    title: item.title || item.url,
    summary: item.excerpt,
    tags: item.tags,
    savedUsing: 'tldr',
    documentId: item.readwiseDocumentId
  };
}

async function readwiseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
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
  return parseReadwiseDocumentResponse(res.status, await readwiseJson(res));
}

export async function patchReadwiseReaderDocument(
  token: string,
  documentId: string,
  input: ReadwiseUpdateInput
): Promise<ReadwiseSaveResponse> {
  const res = await fetch(readwiseUpdateUrl(documentId), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${token}`
    },
    body: JSON.stringify(buildReadwiseUpdateBody(input))
  });

  if (!res.ok) throw new Error(`Readwise error ${res.status}`);
  const parsed = parseReadwiseDocumentResponse(res.status, await readwiseJson(res));
  return { ...parsed, id: parsed.id || documentId, alreadyExists: true };
}

export async function syncReadwiseDocument(token: string, input: ReadwiseSaveInput): Promise<ReadwiseSaveResponse> {
  const update = {
    title: input.title,
    summary: input.summary,
    tags: input.tags || []
  };

  if (input.documentId) {
    return patchReadwiseReaderDocument(token, input.documentId, update);
  }

  const created = await postReadwiseReaderDocument(token, input);
  if (created.alreadyExists && created.id) {
    const patched = await patchReadwiseReaderDocument(token, created.id, update);
    return {
      id: patched.id || created.id,
      url: patched.url || created.url,
      alreadyExists: true
    };
  }
  return created;
}

export async function saveToReadwiseReader(input: ReadwiseSaveInput): Promise<ReadwiseSaveResponse> {
  const settings = await getSettings();
  const token = settings.readwise?.apiTokenRef ? await getSecret(settings.readwise.apiTokenRef) : undefined;
  if (!token) throw new Error('Readwise token not set');
  return syncReadwiseDocument(token, input);
}
