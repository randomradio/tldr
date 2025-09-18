import { getSettings, setSettings, setSecret } from '@common/storage';

function byId<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }

async function load() {
  const s = await getSettings();
  byId<HTMLInputElement>('llm_base').value = s.llm.baseUrl;
  byId<HTMLInputElement>('llm_model').value = s.llm.model;
  byId<HTMLSelectElement>('llm_json').value = String(s.llm.jsonMode) as any;
  byId<HTMLInputElement>('llm_max').value = String(s.llm.maxChars);
  byId<HTMLSelectElement>('pin_shared').value = String(s.pinboard.shared) as any;
  byId<HTMLSelectElement>('pin_toread').value = String(s.pinboard.toread) as any;
  byId<HTMLInputElement>('tag_limit').value = String(s.tagging.knownTagLimit);
  byId<HTMLInputElement>('dedupe').value = String(s.tagging.dedupeThreshold);
  byId<HTMLSelectElement>('privacy').value = s.privacy.mode as any;
  byId<HTMLTextAreaElement>('adv').value = JSON.stringify(s.advanced || {}, null, 2);
}

async function save() {
  const newSettings = await getSettings();
  newSettings.llm.baseUrl = byId<HTMLInputElement>('llm_base').value.trim();
  newSettings.llm.model = byId<HTMLInputElement>('llm_model').value.trim();
  newSettings.llm.jsonMode = byId<HTMLSelectElement>('llm_json').value === 'true';
  newSettings.llm.maxChars = parseInt(byId<HTMLInputElement>('llm_max').value, 10) || 4000;
  const llmKey = byId<HTMLInputElement>('llm_key').value.trim();
  if (llmKey) { newSettings.llm.apiKeyRef = 'llm_api_key'; await setSecret('llm_api_key', llmKey); }

  const pin = byId<HTMLInputElement>('pin_token').value.trim();
  if (pin) { newSettings.pinboard.authTokenRef = 'pin_token'; await setSecret('pin_token', pin); }
  newSettings.pinboard.shared = byId<HTMLSelectElement>('pin_shared').value === 'true';
  newSettings.pinboard.toread = byId<HTMLSelectElement>('pin_toread').value === 'true';

  const rw = byId<HTMLInputElement>('readwise_token')?.value?.trim();
  if (rw) {
    if (!newSettings.readwise) newSettings.readwise = {} as any;
    newSettings.readwise.apiTokenRef = 'readwise_token';
    await setSecret('readwise_token', rw);
  }

  newSettings.tagging.knownTagLimit = parseInt(byId<HTMLInputElement>('tag_limit').value, 10) || 200;
  newSettings.tagging.dedupeThreshold = parseInt(byId<HTMLInputElement>('dedupe').value, 10) || 82;
  newSettings.privacy.mode = byId<HTMLSelectElement>('privacy').value as any;
  try {
    newSettings.advanced = JSON.parse(byId<HTMLTextAreaElement>('adv').value || '{}');
  } catch {}

  await setSettings(newSettings);
  byId<HTMLDivElement>('status').textContent = 'Saved.';
}

byId<HTMLButtonElement>('save').addEventListener('click', save);

byId<HTMLButtonElement>('export').addEventListener('click', async () => {
  const s = await getSettings();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'tldr-settings.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

byId<HTMLInputElement>('import').addEventListener('change', async (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const text = await f.text();
  try { const s = JSON.parse(text); await setSettings(s); await load(); } catch {}
});

load();

// Runtime actions
byId<HTMLButtonElement>('saveCurrent').addEventListener('click', () => {
  const status = byId<HTMLSpanElement>('runtimeStatus');
  status.textContent = 'Saving…';
  chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
    if (!granted) { status.textContent = 'Permission denied for page access.'; return; }
    chrome.runtime.sendMessage({ type: 'save-current-tab' }, (res) => {
      if (!res?.ok) { status.textContent = `Error: ${res?.error || 'Failed'}`; return; }
      status.textContent = `Saved: ${res.item.title || res.item.url}`;
    });
  });
});

byId<HTMLButtonElement>('importTags').addEventListener('click', () => {
  const status = byId<HTMLSpanElement>('runtimeStatus');
  status.textContent = 'Importing tags…';
  chrome.runtime.sendMessage({ type: 'import-pinboard-tags' }, (res) => {
    if (!res?.ok) { status.textContent = `Import failed: ${res?.error || 'Unknown'}`; return; }
    status.textContent = `Imported ${res.count} tags`;
  });
});

// Pinboard listing + export
type PinListItem = { url: string; title: string; tags: string[] };
let pinItems: PinListItem[] = [];

function renderPinList() {
  const el = byId<HTMLDivElement>('pin_list');
  if (!el) return;
  if (!pinItems.length) { el.innerHTML = '<em>No items loaded.</em>'; return; }
  const rows = pinItems.map((it, i) => {
    const tags = it.tags.join(', ');
    const safeTitle = (it.title || it.url).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<div style="display:grid; grid-template-columns: 24px 1fr; gap:8px; padding:6px 0; border-bottom:1px solid #eee;">
      <input type="checkbox" data-idx="${i}" class="pin_sel" />
      <div>
        <div><a href="${it.url}" target="_blank" rel="noopener noreferrer">${safeTitle}</a></div>
        <div style="color:#666; font-size:12px;">${tags}</div>
      </div>
    </div>`;
  }).join('');
  el.innerHTML = rows;
}

byId<HTMLButtonElement>('loadFromPin')?.addEventListener('click', () => {
  const status = byId<HTMLSpanElement>('syncStatus');
  status.textContent = 'Loading…';
  const count = parseInt(byId<HTMLInputElement>('pin_count').value || '50', 10) || 50;
  chrome.runtime.sendMessage({ type: 'list-pinboard-posts', count }, (res) => {
    if (!res?.ok) { status.textContent = `Error: ${res?.error || 'Failed'}`; return; }
    pinItems = res.items || [];
    renderPinList();
    status.textContent = `Loaded ${pinItems.length}`;
  });
});

byId<HTMLButtonElement>('selectAll')?.addEventListener('click', () => {
  document.querySelectorAll<HTMLInputElement>('#pin_list .pin_sel').forEach(cb => cb.checked = true);
});

byId<HTMLButtonElement>('clearSelection')?.addEventListener('click', () => {
  document.querySelectorAll<HTMLInputElement>('#pin_list .pin_sel').forEach(cb => cb.checked = false);
});

byId<HTMLButtonElement>('exportSelected')?.addEventListener('click', () => {
  const status = byId<HTMLSpanElement>('syncStatus');
  const selectedIdxs: number[] = [];
  document.querySelectorAll<HTMLInputElement>('#pin_list .pin_sel').forEach((cb) => {
    if (cb.checked) selectedIdxs.push(parseInt(cb.dataset.idx || '0', 10));
  });
  if (!selectedIdxs.length) { status.textContent = 'Nothing selected.'; return; }

  const items = selectedIdxs.map(i => pinItems[i]).filter(Boolean);
  const targets = {
    goodlinks: byId<HTMLInputElement>('target_goodlinks')?.checked || false,
    readwise: byId<HTMLInputElement>('target_readwise')?.checked || false,
  };
  if (!targets.goodlinks && !targets.readwise) { status.textContent = 'Choose at least one target.'; return; }

  status.textContent = 'Exporting…';
  chrome.runtime.sendMessage({ type: 'export-selected', items, targets }, (res) => {
    if (!res?.ok) { status.textContent = `Export failed: ${res?.error || 'Unknown'}`; return; }
    const parts = [] as string[];
    if (typeof res.goodlinksCount === 'number') parts.push(`Goodlinks: ${res.goodlinksCount}`);
    if (typeof res.readwiseCount === 'number') parts.push(`Readwise: ${res.readwiseCount}`);
    status.textContent = `Exported ${parts.join(', ')}`;
  });
});
