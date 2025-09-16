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
