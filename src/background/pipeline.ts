import { getSettings, getTags, upsertItem, updateTags } from '@common/storage';
import type { Item } from '@common/types';
import { generateTags } from './llm';
import { canonicalizeTags, slugify } from './tags';
import { addToPinboard } from './pinboard';

function uuid(): string {
  return crypto.getRandomValues(new Uint8Array(16)).reduce((p, c, i) => p + (i === 6 ? (c & 0x0f | 0x40) : i === 8 ? (c & 0x3f | 0x80) : c).toString(16).padStart(2, '0'), '');
}

export async function tagAndMaybeSync(input: { url: string; title: string; domain: string; text?: string }): Promise<Item> {
  const settings = await getSettings();
  const knownMap = await getTags();
  const known = Object.keys(knownMap).sort((a, b) => (knownMap[b]?.count || 0) - (knownMap[a]?.count || 0)).slice(0, settings.tagging.knownTagLimit);

  let excerpt: string | undefined;
  if (settings.privacy.mode === 'title_only') excerpt = undefined;
  else if (settings.privacy.mode === 'title_excerpt') excerpt = input.text?.slice(0, Math.min(800, settings.llm.maxChars));
  else excerpt = input.text?.slice(0, settings.llm.maxChars);

  const llmTags = await generateTags({ title: input.title, url: input.url, domain: input.domain, excerpt, knownTags: known });
  const tags = canonicalizeTags(llmTags, known, settings).map(slugify);

  // update known tags counts
  for (const t of tags) {
    knownMap[t] = knownMap[t] || { slug: t, count: 0 } as any;
    knownMap[t].count += 1;
  }
  await updateTags(knownMap);

  const item: Item = {
    id: uuid(),
    url: input.url,
    domain: input.domain,
    title: input.title,
    excerpt,
    createdAt: Date.now(),
    tags,
    status: 'tagged'
  };
  await upsertItem(item);

  // Try sync to pinboard if token is set
  try { await addToPinboard(item); item.status = 'synced'; await upsertItem(item); } catch {}

  return item;
}

