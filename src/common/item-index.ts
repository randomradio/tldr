import type { Item } from './types';

export const ITEM_KEY_PREFIX = 'item:';
export const ITEM_INDEX_KEY = 'itemIndex';

export interface ItemIndex {
  ids: string[];
  byUrl: Record<string, string>;
}

export function itemKey(id: string): string {
  return `${ITEM_KEY_PREFIX}${id}`;
}

export function isStoredItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Item>;
  return typeof item.id === 'string'
    && typeof item.url === 'string'
    && typeof item.createdAt === 'number';
}

export function isItemIndex(value: unknown): value is ItemIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as Partial<ItemIndex>;
  return Array.isArray(index.ids)
    && Boolean(index.byUrl)
    && typeof index.byUrl === 'object'
    && !Array.isArray(index.byUrl);
}

export function emptyItemIndex(): ItemIndex {
  return { ids: [], byUrl: {} };
}

export function buildItemIndex(records: Record<string, unknown>): ItemIndex {
  const items = Object.entries(records)
    .filter(([key, value]) => key.startsWith(ITEM_KEY_PREFIX) && isStoredItem(value))
    .map(([, value]) => value as Item)
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));

  const byUrl: Record<string, string> = {};
  for (const item of [...items].reverse()) {
    byUrl[item.url] = item.id;
  }

  return { ids: items.map((item) => item.id), byUrl };
}

export function applyItemToIndex(index: ItemIndex, item: Item, previousUrl?: string): ItemIndex {
  const ids = [item.id, ...index.ids.filter((id) => id !== item.id)];
  const byUrl = { ...index.byUrl };
  if (previousUrl && previousUrl !== item.url && byUrl[previousUrl] === item.id) {
    delete byUrl[previousUrl];
  }
  byUrl[item.url] = item.id;
  return { ids, byUrl };
}
