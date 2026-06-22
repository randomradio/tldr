import { findItemByUrl, getSettings, getSyncRecord, getTags, setSyncRecord, upsertItem, updateTags } from '@common/storage';
import { captureSyncFingerprint } from '@common/capture';
import { selectExcerpt } from '@common/preview';
import type { CaptureDestinationResult, CaptureResult } from '@common/capture';
import type { Item, SyncRecord } from '@common/types';
import { generateTags } from './llm';
import { canonicalizeTags, slugify } from './tags';
import { addToPinboard } from './pinboard';
import { readwiseInputFromItem, saveToReadwiseReader } from './readwise';

function uuid(): string {
  return crypto.getRandomValues(new Uint8Array(16)).reduce((p, c, i) => p + (i === 6 ? (c & 0x0f | 0x40) : i === 8 ? (c & 0x3f | 0x80) : c).toString(16).padStart(2, '0'), '');
}

function destination(
  id: CaptureDestinationResult['id'],
  label: string,
  status: CaptureDestinationResult['status'],
  message: string,
  extras: Partial<CaptureDestinationResult> = {}
): CaptureDestinationResult {
  return { id, label, status, message, ...extras };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((tag, index) => tag === right[index]);
}

function sameItemPayload(item: Item, input: { url: string; title: string; domain: string; excerpt?: string; tags: string[] }): boolean {
  return item.url === input.url
    && item.title === input.title
    && item.domain === input.domain
    && (item.excerpt || '') === (input.excerpt || '')
    && sameTags(item.tags, input.tags);
}

async function markSync(item: Item, service: SyncRecord['service'], status: SyncRecord['status'], lastHash: string, lastError?: string): Promise<void> {
  await setSyncRecord({
    itemId: item.id,
    service,
    status,
    lastHash,
    lastError,
    updatedAt: Date.now()
  });
}

async function alreadySynced(item: Item, service: SyncRecord['service'], fingerprint: string): Promise<boolean> {
  const record = await getSyncRecord(item.id, service);
  return Boolean(record?.status === 'ok' && record.lastHash === fingerprint);
}

export async function captureAndSync(input: { url: string; title: string; domain: string; text?: string }): Promise<CaptureResult> {
  const settings = await getSettings();
  const knownMap = await getTags();
  const known = Object.keys(knownMap).sort((a, b) => (knownMap[b]?.count || 0) - (knownMap[a]?.count || 0)).slice(0, settings.tagging.knownTagLimit);

  const excerpt = selectExcerpt(input.text, settings.privacy.mode, settings.llm.maxChars);

  const existingItem = await findItemByUrl(input.url);
  const canReuseExistingTags = Boolean(existingItem?.tags.length
    && existingItem.title === input.title
    && existingItem.domain === input.domain
    && (existingItem.excerpt || '') === (excerpt || ''));
  const tags = canReuseExistingTags
    ? existingItem!.tags
    : canonicalizeTags(
      await generateTags({ title: input.title, url: input.url, domain: input.domain, excerpt, knownTags: known }),
      known,
      settings
    ).map(slugify);

  // update known tags counts
  if (!canReuseExistingTags) {
    for (const t of tags) {
      if (existingItem?.tags.includes(t)) continue;
      knownMap[t] = knownMap[t] || { slug: t, count: 0 } as any;
      knownMap[t].count += 1;
    }
    await updateTags(knownMap);
  }

  const unchangedExistingItem = existingItem
    ? sameItemPayload(existingItem, { url: input.url, title: input.title, domain: input.domain, excerpt, tags })
    : false;
  const item: Item = {
    ...(existingItem || {}),
    id: existingItem?.id || uuid(),
    url: input.url,
    domain: input.domain,
    title: input.title,
    excerpt,
    createdAt: existingItem?.createdAt || Date.now(),
    tags,
    status: unchangedExistingItem && existingItem?.status === 'synced' ? 'synced' : 'tagged'
  };
  item.contentHash = captureSyncFingerprint(item);
  delete item.lastError;
  await upsertItem(item);

  const destinations: CaptureDestinationResult[] = [
    destination('local', 'Local library', 'success', unchangedExistingItem ? 'Already saved locally' : existingItem ? 'Updated local item' : 'Saved locally')
  ];
  const fingerprint = captureSyncFingerprint(item);

  if (settings.pinboard.authTokenRef) {
    try {
      if (await alreadySynced(item, 'pinboard', fingerprint)) {
        destinations.push(destination('pinboard', 'Pinboard', 'skipped', 'Already synced to Pinboard', { url: 'https://pinboard.in/' }));
      } else if (unchangedExistingItem && existingItem?.status === 'synced') {
        await markSync(item, 'pinboard', 'ok', fingerprint);
        destinations.push(destination('pinboard', 'Pinboard', 'skipped', 'Already synced to Pinboard', { url: 'https://pinboard.in/' }));
      } else {
        await addToPinboard(item);
        item.status = 'synced';
        await upsertItem(item);
        await markSync(item, 'pinboard', 'ok', fingerprint);
        destinations.push(destination('pinboard', 'Pinboard', 'success', 'Saved to Pinboard', { url: 'https://pinboard.in/' }));
      }
    } catch (err) {
      await markSync(item, 'pinboard', 'error', fingerprint, errorMessage(err));
      destinations.push(destination('pinboard', 'Pinboard', 'error', 'Pinboard save failed', { error: errorMessage(err) }));
    }
  } else {
    destinations.push(destination('pinboard', 'Pinboard', 'skipped', 'Pinboard token not configured'));
  }

  if (settings.readwise?.saveOnCapture) {
    if (!settings.readwise.apiTokenRef) {
      destinations.push(destination('readwise', 'Readwise Reader', 'error', 'Readwise capture enabled but token is missing'));
    } else {
      try {
        if (await alreadySynced(item, 'readwise', fingerprint)) {
          destinations.push(destination('readwise', 'Readwise Reader', 'skipped', 'Already synced to Readwise Reader', { url: 'https://readwise.io/read' }));
        } else {
          await saveToReadwiseReader(readwiseInputFromItem(item));
          await markSync(item, 'readwise', 'ok', fingerprint);
          destinations.push(destination('readwise', 'Readwise Reader', 'success', 'Saved to Readwise Reader', { url: 'https://readwise.io/read' }));
        }
      } catch (err) {
        await markSync(item, 'readwise', 'error', fingerprint, errorMessage(err));
        destinations.push(destination('readwise', 'Readwise Reader', 'error', 'Readwise save failed', { error: errorMessage(err) }));
      }
    }
  } else {
    destinations.push(destination('readwise', 'Readwise Reader', 'skipped', 'Readwise capture disabled'));
  }

  return { item, tags, destinations };
}

export async function tagAndMaybeSync(input: { url: string; title: string; domain: string; text?: string }): Promise<Item> {
  const result = await captureAndSync(input);
  return result.item;
}
