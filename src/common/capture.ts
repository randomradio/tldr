import type { Item } from './types';

export type CaptureDestinationId = 'local' | 'pinboard' | 'readwise' | 'llm';
export type CaptureDestinationStatus = 'success' | 'skipped' | 'error';

export interface CaptureDestinationResult {
  id: CaptureDestinationId;
  label: string;
  status: CaptureDestinationStatus;
  message: string;
  url?: string;
  error?: string;
}

export interface CaptureResult {
  item: Item;
  tags: string[];
  destinations: CaptureDestinationResult[];
}

export function hasCaptureError(result: CaptureResult): boolean {
  return result.destinations.some((destination) => destination.status === 'error');
}

export function captureSyncFingerprint(item: Pick<Item, 'url' | 'title' | 'excerpt' | 'tags'>): string {
  return JSON.stringify({
    url: item.url,
    title: item.title || '',
    excerpt: item.excerpt || '',
    tags: [...item.tags].sort()
  });
}
