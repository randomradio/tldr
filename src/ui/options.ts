import { getSecret, getSettings, setSettings, setSecret } from '@common/storage';

function byId<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }

const SECRET_PLACEHOLDER = '••••••••';

function originPattern(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/*`;
  } catch {
    return null;
  }
}

function containsOriginPermission(pattern: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [pattern] }, (granted) => {
      if (chrome.runtime.lastError) {
        console.warn('Could not check permissions', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

function requestOriginPermission(pattern: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      if (chrome.runtime.lastError) {
        console.warn('Permission request failed', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

function removeOriginPermission(pattern: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.remove({ origins: [pattern] }, (removed) => {
      if (chrome.runtime.lastError) {
        console.warn('Could not remove permission', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      resolve(Boolean(removed));
    });
  });
}

function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn('Could not query active tab', chrome.runtime.lastError);
        resolve(undefined);
        return;
      }
      resolve(tabs && tabs.length ? tabs[0] : undefined);
    });
  });
}

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
  await Promise.all([
    hydrateSecretField('llm_key', s.llm.apiKeyRef),
    hydrateSecretField('pin_token', s.pinboard.authTokenRef),
    hydrateSecretField('readwise_token', s.readwise?.apiTokenRef)
  ]);
}

async function save() {
  const statusEl = byId<HTMLDivElement>('status');
  statusEl.textContent = 'Saving…';
  const newSettings = await getSettings();
  const prevBase = newSettings.llm.baseUrl;
  const prevPattern = originPattern(prevBase);

  const baseInput = byId<HTMLInputElement>('llm_base').value.trim();
  if (!baseInput) { statusEl.textContent = 'Enter an LLM base URL (including protocol).'; return; }
  const nextPattern = originPattern(baseInput);
  if (!nextPattern) { statusEl.textContent = 'The LLM base URL must be a valid absolute URL.'; return; }

  let permissionGranted = false;
  const alreadyGranted = await containsOriginPermission(nextPattern);
  if (!alreadyGranted) {
    const granted = await requestOriginPermission(nextPattern);
    if (!granted) { statusEl.textContent = `Permission was not granted for ${nextPattern.replace('/*', '')}.`; return; }
    permissionGranted = true;
  }

  newSettings.llm.baseUrl = baseInput;
  newSettings.llm.model = byId<HTMLInputElement>('llm_model').value.trim();
  newSettings.llm.jsonMode = byId<HTMLSelectElement>('llm_json').value === 'true';
  newSettings.llm.maxChars = parseInt(byId<HTMLInputElement>('llm_max').value, 10) || 4000;

  newSettings.pinboard.shared = byId<HTMLSelectElement>('pin_shared').value === 'true';
  newSettings.pinboard.toread = byId<HTMLSelectElement>('pin_toread').value === 'true';

  newSettings.tagging.knownTagLimit = parseInt(byId<HTMLInputElement>('tag_limit').value, 10) || 200;
  newSettings.tagging.dedupeThreshold = parseInt(byId<HTMLInputElement>('dedupe').value, 10) || 82;
  newSettings.privacy.mode = byId<HTMLSelectElement>('privacy').value as any;
  try {
    newSettings.advanced = JSON.parse(byId<HTMLTextAreaElement>('adv').value || '{}');
  } catch {}

  await persistSecretField({
    inputId: 'llm_key',
    storageKey: 'llm_api_key',
    currentRef: newSettings.llm.apiKeyRef,
    assignRef: (ref) => {
      if (ref) newSettings.llm.apiKeyRef = ref;
      else delete newSettings.llm.apiKeyRef;
    }
  });

  await persistSecretField({
    inputId: 'pin_token',
    storageKey: 'pin_token',
    currentRef: newSettings.pinboard.authTokenRef,
    assignRef: (ref) => {
      if (ref) newSettings.pinboard.authTokenRef = ref;
      else delete newSettings.pinboard.authTokenRef;
    }
  });

  await persistSecretField({
    inputId: 'readwise_token',
    storageKey: 'readwise_token',
    currentRef: newSettings.readwise?.apiTokenRef,
    assignRef: (ref) => {
      if (!newSettings.readwise) newSettings.readwise = {} as any;
      if (ref) newSettings.readwise.apiTokenRef = ref;
      else if (newSettings.readwise) delete newSettings.readwise.apiTokenRef;
    }
  });

  await setSettings(newSettings);
  if (prevPattern && prevPattern !== nextPattern) {
    await removeOriginPermission(prevPattern);
  }

  statusEl.textContent = permissionGranted ? 'Saved. Permission granted for your LLM host.' : 'Saved.';
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
byId<HTMLButtonElement>('saveCurrent').addEventListener('click', async () => {
  const status = byId<HTMLSpanElement>('runtimeStatus');
  status.textContent = 'Saving…';
  const tab = await getActiveTab();
  if (!tab?.url) { status.textContent = 'Active tab URL unavailable.'; return; }
  const tabOriginPattern = originPattern(tab.url);
  if (!tabOriginPattern) { status.textContent = 'Cannot access this tab. Try a regular http(s) page.'; return; }
  const hasPermission = await containsOriginPermission(tabOriginPattern);
  if (!hasPermission) {
    const granted = await requestOriginPermission(tabOriginPattern);
    if (!granted) { status.textContent = 'Permission denied for this site.'; return; }
  }
  chrome.runtime.sendMessage({ type: 'save-current-tab' }, (res) => {
    if (!res?.ok) { status.textContent = `Error: ${res?.error || 'Failed'}`; return; }
    status.textContent = `Saved: ${res.item.title || res.item.url}`;
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

type SecretField = {
  inputId: string;
  storageKey: string;
  currentRef?: string;
  assignRef: (ref?: string) => void;
};

async function persistSecretField({ inputId, storageKey, currentRef, assignRef }: SecretField): Promise<void> {
  const input = byId<HTMLInputElement>(inputId);
  const masked = input.dataset.secretMasked === 'true';
  const raw = input.value.trim();

  if (masked && raw === SECRET_PLACEHOLDER) {
    if (currentRef) assignRef(currentRef);
    applySecretPresence(input, true);
    return;
  }

  if (raw) {
    await setSecret(storageKey, raw);
    assignRef(storageKey);
    applySecretPresence(input, true);
  } else {
    await setSecret(storageKey, '');
    assignRef(undefined);
    applySecretPresence(input, false);
  }
}

async function hydrateSecretField(inputId: string, ref?: string): Promise<void> {
  const input = byId<HTMLInputElement>(inputId);
  rememberPlaceholder(input);
  if (!ref) {
    applySecretPresence(input, false);
    return;
  }
  const value = await getSecret(ref);
  applySecretPresence(input, Boolean(value));
}

function rememberPlaceholder(input: HTMLInputElement): void {
  if (!input.dataset.originalPlaceholder) {
    input.dataset.originalPlaceholder = input.placeholder || '';
  }
}

function applySecretPresence(input: HTMLInputElement, hasSecret: boolean): void {
  if (hasSecret) {
    input.value = SECRET_PLACEHOLDER;
    input.dataset.secretMasked = 'true';
    input.dataset.secretState = 'present';
    input.placeholder = 'Saved secret';
  } else {
    input.value = '';
    input.dataset.secretMasked = 'false';
    input.dataset.secretState = 'missing';
    input.placeholder = input.dataset.originalPlaceholder || '';
  }
}

['llm_key', 'pin_token', 'readwise_token'].forEach((id) => {
  const input = byId<HTMLInputElement>(id);
  rememberPlaceholder(input);
  input.addEventListener('focus', () => {
    if (input.dataset.secretMasked === 'true') {
      // Highlight placeholder so typing replaces it immediately.
      input.select();
    }
  });
  input.addEventListener('input', () => {
    if (input.dataset.secretMasked === 'true' && input.value !== SECRET_PLACEHOLDER) {
      input.dataset.secretMasked = 'false';
      input.dataset.secretState = input.value.trim() ? 'pending' : 'missing';
    }
  });
  input.addEventListener('blur', () => {
    if (!input.value.trim() && input.dataset.secretState === 'pending') {
      input.dataset.secretState = 'missing';
    }
  });
});

// Pinboard listing + export
type PinListItem = { url: string; title: string; tags: string[] };
const PIN_STORAGE_KEY = 'tldr.pinboard.items';
let pinItems: PinListItem[] = [];

function persistPinItems() {
  try {
    if (pinItems.length) {
      chrome.storage.local.set({ [PIN_STORAGE_KEY]: pinItems });
    } else {
      chrome.storage.local.remove(PIN_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Could not persist Pinboard items', err);
  }
}

function renderPinList() {
  const el = byId<HTMLDivElement>('pin_list');
  if (!el) return;
  if (!pinItems.length) {
    el.innerHTML = '<div class="status">No items loaded yet.</div>';
    return;
  }
  const rows = pinItems.map((it, i) => {
    const tags = it.tags.join(', ');
    const safeTitle = (it.title || it.url)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;');
    const safeUrl = it.url.replace(/"/g, '&quot;');
    return `<div class="pin-item">
      <div class="checkbox-row">
        <input type="checkbox" data-idx="${i}" class="pin_sel" />
      </div>
      <div>
        <div class="pin-item-title"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a></div>
        <div class="pin-item-tags">${tags}</div>
      </div>
    </div>`;
  }).join('');
  el.innerHTML = rows;
}

renderPinList();

try {
  chrome.storage.local.get(PIN_STORAGE_KEY, (res) => {
    const stored = res?.[PIN_STORAGE_KEY];
    if (Array.isArray(stored) && stored.length) {
      pinItems = stored as PinListItem[];
      renderPinList();
      const status = byId<HTMLSpanElement>('syncStatus');
      if (status) status.textContent = `Loaded ${pinItems.length} cached item${pinItems.length === 1 ? '' : 's'}.`;
    }
  });
} catch (err) {
  console.warn('Could not hydrate Pinboard items from storage', err);
}

byId<HTMLButtonElement>('loadFromPin')?.addEventListener('click', () => {
  const status = byId<HTMLSpanElement>('syncStatus');
  status.textContent = 'Loading…';
  const count = parseInt(byId<HTMLInputElement>('pin_count').value || '50', 10) || 50;
  chrome.runtime.sendMessage({ type: 'list-pinboard-posts', count }, (res) => {
    if (!res?.ok) { status.textContent = `Error: ${res?.error || 'Failed'}`; return; }
    pinItems = res.items || [];
    renderPinList();
    persistPinItems();
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

try {
  const versionEl = document.getElementById('appVersion');
  if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
} catch {
  // ignore
}

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-button'));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel'));
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    if (!target) return;
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    tabPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === target));
    try { chrome.storage.local.set({ 'tldr.options.activeTab': target }); } catch {}
  });
});

try {
  chrome.storage.local.get('tldr.options.activeTab', (res) => {
    const target = res?.['tldr.options.activeTab'];
    if (typeof target === 'string') {
      const btn = tabButtons.find((b) => b.dataset.tab === target);
      if (btn) btn.click();
    }
  });
} catch (err) {
  console.warn('Could not restore active tab', err);
}
