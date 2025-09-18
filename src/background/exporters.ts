import { getSecret, getSettings } from '@common/storage';

export type SimpleItem = { url: string; title: string; tags: string[] };

export async function exportToGoodlinks(items: SimpleItem[]): Promise<number> {
  let count = 0;
  for (const it of items) {
    try {
      const url = new URL('goodlinks://add');
      url.searchParams.set('url', it.url);
      if (it.title) url.searchParams.set('title', it.title);
      if (it.tags?.length) url.searchParams.set('tags', it.tags.join(','));
      await chrome.tabs.create({ url: url.toString(), active: false });
      count += 1;
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      console.warn('Goodlinks export failed for', it.url, e);
    }
  }
  return count;
}

export async function exportToReadwise(items: SimpleItem[]): Promise<number> {
  const settings = await getSettings();
  const token = settings.readwise?.apiTokenRef ? await getSecret(settings.readwise.apiTokenRef) : undefined;
  if (!token) throw new Error('Readwise token not set');

  let count = 0;
  for (const it of items) {
    try {
      const res = await fetch('https://readwise.io/api/reader_api/v3/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({
          url: it.url,
          title: it.title || undefined,
          tags: it.tags || [],
          source: 'tldr'
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      count += 1;
      await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      console.warn('Readwise export failed for', it.url, e);
    }
  }
  return count;
}

