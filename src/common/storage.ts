import type { Settings, Item, TagInfo, SyncRecord } from './types';
import {
  ITEM_INDEX_KEY,
  applyItemToIndex,
  buildItemIndex,
  isItemIndex,
  itemKey
} from './item-index';

const DEFAULT_SETTINGS: Settings = {
  llm: { baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0905-preview', jsonMode: false, maxChars: 4000 },
  pinboard: { shared: true, toread: false, saveOnCapture: true },
  readwise: { saveOnCapture: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' },
  advanced: {}
};

type StorageArea = chrome.storage.StorageArea;

function storageSet(area: StorageArea, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    area.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function storageGet<T>(area: StorageArea, keys: string | string[] | Record<string, unknown> | null): Promise<T> {
  return new Promise((resolve, reject) => {
    area.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items as T);
    });
  });
}

function storageRemove(area: StorageArea, keys: string | string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    area.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function mergeSettings(stored?: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(stored || {}),
    llm: { ...DEFAULT_SETTINGS.llm, ...(stored?.llm || {}) },
    pinboard: { ...DEFAULT_SETTINGS.pinboard, ...(stored?.pinboard || {}) },
    readwise: { ...DEFAULT_SETTINGS.readwise, ...(stored?.readwise || {}) },
    tagging: { ...DEFAULT_SETTINGS.tagging, ...(stored?.tagging || {}) },
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(stored?.privacy || {}) },
    advanced: { ...DEFAULT_SETTINGS.advanced, ...(stored?.advanced || {}) }
  };
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await storageGet<{ settings?: Partial<Settings> }>(chrome.storage.sync, 'settings');
  return mergeSettings(settings);
}

export async function setSettings(settings: Settings): Promise<void> {
  await storageSet(chrome.storage.sync, { settings: mergeSettings(settings) });
}

export async function getSecret(key: string): Promise<string | undefined> {
  if (!key) return undefined;
  const res = await storageGet<Record<string, string | undefined>>(chrome.storage.local, key);
  return res[key];
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (!key) return;
  if (!value) {
    await storageRemove(chrome.storage.local, key);
    return;
  }
  await storageSet(chrome.storage.local, { [key]: value });
}

async function getOrCreateItemIndex() {
  const stored = await storageGet<Record<string, unknown>>(chrome.storage.local, ITEM_INDEX_KEY);
  if (isItemIndex(stored[ITEM_INDEX_KEY])) return stored[ITEM_INDEX_KEY];

  const all = await storageGet<Record<string, unknown>>(chrome.storage.local, null);
  const built = buildItemIndex(all);
  await storageSet(chrome.storage.local, { [ITEM_INDEX_KEY]: built });
  return built;
}

export async function upsertItem(item: Item): Promise<void> {
  const key = itemKey(item.id);
  const existing = await getItem(item.id);
  const index = applyItemToIndex(await getOrCreateItemIndex(), item, existing?.url);
  await storageSet(chrome.storage.local, { [key]: item, [ITEM_INDEX_KEY]: index });
}

export async function getItem(id: string): Promise<Item | undefined> {
  const key = itemKey(id);
  const res = await storageGet<Record<string, Item | undefined>>(chrome.storage.local, key);
  return res[key];
}

export async function findItemByUrl(url: string): Promise<Item | undefined> {
  const index = await getOrCreateItemIndex();
  const id = index.byUrl[url];
  if (!id) return undefined;
  return getItem(id);
}

export async function listItems(limit = 50): Promise<Item[]> {
  const index = await getOrCreateItemIndex();
  const ids = index.ids.slice(0, Math.max(0, limit));
  if (!ids.length) return [];
  const res = await storageGet<Record<string, Item | undefined>>(chrome.storage.local, ids.map(itemKey));
  return ids
    .map((id) => res[itemKey(id)])
    .filter((item): item is Item => Boolean(item))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateTags(map: Record<string, TagInfo>): Promise<void> {
  await storageSet(chrome.storage.local, { tags: map });
}

export async function getTags(): Promise<Record<string, TagInfo>> {
  const { tags } = await storageGet<{ tags?: Record<string, TagInfo> }>(chrome.storage.local, 'tags');
  return tags || {};
}

export async function setSyncRecord(rec: SyncRecord): Promise<void> {
  const key = `sync:${rec.service}:${rec.itemId}`;
  await storageSet(chrome.storage.local, { [key]: rec });
}

export async function getSyncRecord(itemId: string, service: SyncRecord['service'] = 'pinboard'): Promise<SyncRecord | undefined> {
  const key = `sync:${service}:${itemId}`;
  const res = await storageGet<Record<string, SyncRecord | undefined>>(chrome.storage.local, key);
  return res[key];
}
