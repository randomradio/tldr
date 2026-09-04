import { findItemByUrl, getItem, getSettings, getSyncRecord, getTags, setSyncRecord, upsertItem, updateTags } from '@common/storage';
import { captureSyncFingerprint } from '@common/capture';
import { selectExcerpt } from '@common/preview';
import { parseTagInput } from '@common/tags-input';
import type { CaptureDestinationId, CaptureDestinationResult, CaptureResult } from '@common/capture';
import type { Item, Settings, SyncRecord } from '@common/types';
import { generateTags } from './llm';
import { canonicalizeTags, slugify } from './tags';
import { addToPinboard } from './pinboard';
import { readwiseInputFromItem, saveToReadwiseReader } from './readwise';

function uuid(): string {
  return crypto.randomUUID();
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

function localDestination(item: Item, existingItem?: Item, unchangedExistingItem = false): CaptureDestinationResult {
  return destination(
    'local',
    'Local library',
    'success',
    unchangedExistingItem ? 'Already saved locally' : existingItem ? 'Updated local item' : 'Saved locally'
  );
}

async function incrementKnownTags(knownMap: Awaited<ReturnType<typeof getTags>>, tags: string[], previous: string[] = []): Promise<void> {
  let changed = false;
  for (const t of tags) {
    if (previous.includes(t)) continue;
    knownMap[t] = knownMap[t] || { slug: t, count: 0 };
    knownMap[t].count += 1;
    changed = true;
  }
  if (changed) await updateTags(knownMap);
}

async function knownTagNames(settings: Settings): Promise<{ known: string[]; knownMap: Awaited<ReturnType<typeof getTags>> }> {
  const knownMap = await getTags();
  const known = Object.keys(knownMap)
    .sort((a, b) => (knownMap[b]?.count || 0) - (knownMap[a]?.count || 0))
    .slice(0, settings.tagging.knownTagLimit);
  return { known, knownMap };
}

function normalizeTags(candidates: string[], known: string[], settings: Settings): string[] {
  return canonicalizeTags(candidates, known, settings).map(slugify).filter(Boolean);
}

async function syncPinboard(item: Item, fingerprint: string, force: boolean): Promise<CaptureDestinationResult> {
  const settings = await getSettings();
  if (settings.pinboard.saveOnCapture === false) {
    return destination('pinboard', 'Pinboard', 'skipped', 'Pinboard capture disabled');
  }
  if (!settings.pinboard.authTokenRef) {
    return destination('pinboard', 'Pinboard', 'skipped', 'Pinboard token not configured');
  }

  try {
    if (!force && await alreadySynced(item, 'pinboard', fingerprint)) {
      return destination('pinboard', 'Pinboard', 'skipped', 'Already synced to Pinboard', { url: 'https://pinboard.in/' });
    }
    await addToPinboard(item);
    item.status = 'synced';
    await upsertItem(item);
    await markSync(item, 'pinboard', 'ok', fingerprint);
    return destination('pinboard', 'Pinboard', 'success', 'Saved to Pinboard', { url: 'https://pinboard.in/' });
  } catch (err) {
    await markSync(item, 'pinboard', 'error', fingerprint, errorMessage(err));
    return destination('pinboard', 'Pinboard', 'error', 'Pinboard save failed', { error: errorMessage(err) });
  }
}

async function syncReadwise(item: Item, fingerprint: string, force: boolean): Promise<CaptureDestinationResult> {
  const settings = await getSettings();
  if (!settings.readwise?.saveOnCapture) {
    return destination('readwise', 'Readwise Reader', 'skipped', 'Readwise capture disabled');
  }
  if (!settings.readwise.apiTokenRef) {
    return destination('readwise', 'Readwise Reader', 'error', 'Readwise capture enabled but token is missing');
  }

  try {
    if (!force && await alreadySynced(item, 'readwise', fingerprint)) {
      return destination('readwise', 'Readwise Reader', 'skipped', 'Already synced to Readwise Reader', {
        url: item.readwiseDocumentId ? `https://read.readwise.io/read/${item.readwiseDocumentId}` : 'https://readwise.io/read'
      });
    }
    const saved = await saveToReadwiseReader(readwiseInputFromItem(item));
    if (saved.id && saved.id !== item.readwiseDocumentId) {
      item.readwiseDocumentId = saved.id;
      await upsertItem(item);
    }
    await markSync(item, 'readwise', 'ok', fingerprint);
    return destination(
      'readwise',
      'Readwise Reader',
      saved.alreadyExists ? 'success' : 'success',
      saved.alreadyExists ? 'Updated Readwise Reader' : 'Saved to Readwise Reader',
      { url: saved.url || (saved.id ? `https://read.readwise.io/read/${saved.id}` : 'https://readwise.io/read') }
    );
  } catch (err) {
    await markSync(item, 'readwise', 'error', fingerprint, errorMessage(err));
    return destination('readwise', 'Readwise Reader', 'error', 'Readwise save failed', { error: errorMessage(err) });
  }
}

async function syncConfiguredDestinations(item: Item, force: boolean): Promise<CaptureDestinationResult[]> {
  const fingerprint = captureSyncFingerprint(item);
  return [
    await syncPinboard(item, fingerprint, force),
    await syncReadwise(item, fingerprint, force)
  ];
}

function captureResult(item: Item, llm: CaptureDestinationResult, local: CaptureDestinationResult, synced: CaptureDestinationResult[]): CaptureResult {
  return { item, tags: item.tags, destinations: [local, llm, ...synced] };
}

export async function captureAndSync(input: { url: string; title: string; domain: string; text?: string }): Promise<CaptureResult> {
  const settings = await getSettings();
  const { known, knownMap } = await knownTagNames(settings);
  const excerpt = selectExcerpt(input.text, settings.privacy.mode, settings.llm.maxChars);
  const existingItem = await findItemByUrl(input.url);
  const canReuseExistingTags = Boolean(existingItem?.tags.length
    && existingItem.title === input.title
    && existingItem.domain === input.domain
    && (existingItem.excerpt || '') === (excerpt || ''));

  let tags: string[];
  let llmDest: CaptureDestinationResult;
  if (canReuseExistingTags) {
    tags = existingItem!.tags;
    llmDest = destination('llm', 'LLM tags', 'skipped', 'Reused existing tags');
  } else {
    try {
      tags = normalizeTags(
        await generateTags({ title: input.title, url: input.url, domain: input.domain, excerpt, knownTags: known }),
        known,
        settings
      );
      llmDest = destination(
        'llm',
        'LLM tags',
        'success',
        tags.length ? `Tagged: ${tags.slice(0, 5).join(', ')}` : 'No tags generated'
      );
      await incrementKnownTags(knownMap, tags, existingItem?.tags);
    } catch (err) {
      tags = existingItem?.tags || [];
      llmDest = destination('llm', 'LLM tags', 'error', 'Tagging failed', { error: errorMessage(err) });
    }
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

  return captureResult(
    item,
    llmDest,
    localDestination(item, existingItem, unchangedExistingItem),
    await syncConfiguredDestinations(item, false)
  );
}

export async function retryDestination(itemId: string, destinationId: CaptureDestinationId): Promise<CaptureResult> {
  const item = await getItem(itemId);
  if (!item) throw new Error('Saved item not found');
  const settings = await getSettings();
  const fingerprint = captureSyncFingerprint(item);

  if (destinationId === 'llm') {
    const { known, knownMap } = await knownTagNames(settings);
    try {
      const tags = normalizeTags(
        await generateTags({
          title: item.title,
          url: item.url,
          domain: item.domain,
          excerpt: item.excerpt,
          knownTags: known
        }),
        known,
        settings
      );
      const previous = item.tags;
      item.tags = tags;
      item.contentHash = captureSyncFingerprint(item);
      item.status = 'tagged';
      delete item.lastError;
      await incrementKnownTags(knownMap, tags, previous);
      await upsertItem(item);
      const synced = await syncConfiguredDestinations(item, true);
      return captureResult(
        item,
        destination('llm', 'LLM tags', 'success', tags.length ? `Tagged: ${tags.slice(0, 5).join(', ')}` : 'No tags generated'),
        localDestination(item, item, false),
        synced
      );
    } catch (err) {
      return captureResult(
        item,
        destination('llm', 'LLM tags', 'error', 'Tagging failed', { error: errorMessage(err) }),
        localDestination(item, item, true),
        await syncConfiguredDestinations(item, false)
      );
    }
  }

  if (destinationId === 'pinboard') {
    const pinboard = await syncPinboard(item, fingerprint, true);
    const readwise = await syncReadwise(item, fingerprint, false);
    return captureResult(
      item,
      destination('llm', 'LLM tags', item.tags.length ? 'success' : 'skipped', item.tags.length ? `Tagged: ${item.tags.slice(0, 5).join(', ')}` : 'No tags'),
      localDestination(item, item, true),
      [pinboard, readwise]
    );
  }

  if (destinationId === 'readwise') {
    const pinboard = await syncPinboard(item, fingerprint, false);
    const readwise = await syncReadwise(item, fingerprint, true);
    return captureResult(
      item,
      destination('llm', 'LLM tags', item.tags.length ? 'success' : 'skipped', item.tags.length ? `Tagged: ${item.tags.slice(0, 5).join(', ')}` : 'No tags'),
      localDestination(item, item, true),
      [pinboard, readwise]
    );
  }

  throw new Error(`Cannot retry ${destinationId}`);
}

export async function updateCapturedTags(itemId: string, incoming: string[]): Promise<CaptureResult> {
  const item = await getItem(itemId);
  if (!item) throw new Error('Saved item not found');
  const settings = await getSettings();
  const { known, knownMap } = await knownTagNames(settings);
  const tags = normalizeTags(parseTagInput(incoming.join(',')), known, settings);
  const previous = item.tags;
  item.tags = tags;
  item.contentHash = captureSyncFingerprint(item);
  item.status = 'tagged';
  delete item.lastError;
  await incrementKnownTags(knownMap, tags, previous);
  await upsertItem(item);
  const synced = await syncConfiguredDestinations(item, true);
  return captureResult(
    item,
    destination('llm', 'LLM tags', 'skipped', 'Tags updated'),
    localDestination(item, item, false),
    synced
  );
}

export async function tagAndMaybeSync(input: { url: string; title: string; domain: string; text?: string }): Promise<Item> {
  const result = await captureAndSync(input);
  return result.item;
}
