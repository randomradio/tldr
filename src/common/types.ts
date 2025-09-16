export type PrivacyMode = 'title_only' | 'title_excerpt' | 'full_truncated';

export interface Settings {
  llm: {
    baseUrl: string;
    model: string;
    apiKeyRef?: string; // key stored separately under secrets
    jsonMode: boolean;
    maxChars: number;
  };
  pinboard: {
    authTokenRef?: string;
    shared: boolean;
    toread: boolean;
  };
  tagging: {
    knownTagLimit: number;
    dedupeThreshold: number; // 0..100
    aliases: Record<string, string>; // aliasSlug -> canonicalSlug
  };
  privacy: {
    mode: PrivacyMode;
  };
  advanced?: Record<string, unknown>;
}

export interface Item {
  id: string; // uuid
  url: string;
  domain: string;
  title: string;
  excerpt?: string;
  contentHash?: string;
  createdAt: number;
  tags: string[]; // slugs
  status: 'new' | 'tagged' | 'synced' | 'error';
  lastError?: string;
}

export interface TagInfo {
  slug: string;
  display?: string;
  count: number;
  aliases?: string[];
}

export interface SyncRecord {
  itemId: string;
  service: 'pinboard';
  lastHash?: string; // hash of title+tags+url
  status: 'pending' | 'ok' | 'error';
  lastError?: string;
  updatedAt: number;
}

export type QueueTask =
  | { kind: 'ingest'; tabId: number; windowId?: number }
  | { kind: 'sync_pinboard'; itemId: string };

