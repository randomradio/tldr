import type { Settings, Item, TagInfo, SyncRecord } from './types';

const DEFAULT_SETTINGS: Settings = {
  llm: { baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0905-preview', jsonMode: false, maxChars: 4000 },
  pinboard: { shared: true, toread: false },
  tagging: { knownTagLimit: 200, dedupeThreshold: 82, aliases: {} },
  privacy: { mode: 'title_excerpt' },
  advanced: {}
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) } as Settings;
}

export async function setSettings(settings: Settings): Promise<void> {
  return chrome.storage.sync.set({ settings });
}

export async function getSecret(key: string): Promise<string | undefined> {
  const res = await chrome.storage.local.get(key);
  return res[key];
}

export async function setSecret(key: string, value: string): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

export async function upsertItem(item: Item): Promise<void> {
  const key = `item:${item.id}`;
  await chrome.storage.local.set({ [key]: item });
}

export async function getItem(id: string): Promise<Item | undefined> {
  const key = `item:${id}`;
  const res = await chrome.storage.local.get(key);
  return res[key];
}

export async function listItems(limit = 50): Promise<Item[]> {
  const all = await chrome.storage.local.get(null);
  const items: Item[] = Object.values(all).filter((v) => v && v.id && v.url);
  return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function updateTags(map: Record<string, TagInfo>): Promise<void> {
  await chrome.storage.local.set({ tags: map });
}

export async function getTags(): Promise<Record<string, TagInfo>> {
  const { tags } = await chrome.storage.local.get('tags');
  return tags || {};
}

export async function setSyncRecord(rec: SyncRecord): Promise<void> {
  const key = `sync:${rec.service}:${rec.itemId}`;
  await chrome.storage.local.set({ [key]: rec });
}

export async function getSyncRecord(itemId: string): Promise<SyncRecord | undefined> {
  const key = `sync:pinboard:${itemId}`;
  const res = await chrome.storage.local.get(key);
  return res[key];
}
