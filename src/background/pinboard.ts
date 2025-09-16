import { getSecret, getSettings } from '@common/storage';
import { getTags, updateTags } from '@common/storage';
import type { Item, TagInfo } from '@common/types';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function addToPinboard(item: Item): Promise<void> {
  const settings = await getSettings();
  const token = settings.pinboard.authTokenRef ? await getSecret(settings.pinboard.authTokenRef) : undefined;
  if (!token) throw new Error('Pinboard token not set');

  const params = new URLSearchParams({
    url: item.url,
    description: item.title || item.url,
    extended: (item.excerpt || '').slice(0, 250),
    tags: item.tags.join(' '),
    shared: settings.pinboard.shared ? 'yes' : 'no',
    toread: settings.pinboard.toread ? 'yes' : 'no',
    auth_token: token,
    format: 'json'
  });

  let attempt = 0;
  while (attempt < 3) {
    const res = await fetch(`https://api.pinboard.in/v1/posts/add?${params.toString()}`, { method: 'GET' });
    if (res.status === 429) { attempt++; await sleep(1100 * attempt); continue; }
    if (!res.ok) throw new Error(`Pinboard error ${res.status}`);
    const data = await res.json();
    if (data?.result_code && data.result_code !== 'done') throw new Error(`Pinboard: ${data.result_code}`);
    return; // success
  }
  throw new Error('Pinboard rate limited');
}

export async function importTagsFromPinboard(): Promise<number> {
  const settings = await getSettings();
  const token = settings.pinboard.authTokenRef ? await getSecret(settings.pinboard.authTokenRef) : undefined;
  if (!token) throw new Error('Pinboard token not set');
  const url = `https://api.pinboard.in/v1/tags/get?auth_token=${encodeURIComponent(token)}&format=json`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Pinboard error ${res.status}`);
  const data = await res.json();
  // data is an object: { tag: count, ... }
  const existing = await getTags();
  let count = 0;
  for (const [tag, c] of Object.entries<number>(data)) {
    const slug = tag.toLowerCase();
    const prev: TagInfo = existing[slug] || { slug, count: 0 };
    existing[slug] = { ...prev, count: (prev.count || 0) + (c || 0) };
    count += 1;
  }
  await updateTags(existing);
  return count;
}
