import { getSecret, getSettings, setSettings, setSecret } from '@common/storage';
import {
  buildDestinationPreviews,
  privacyModeDescription,
  privacyModeLabel,
  type DataPreview,
  type ExportTargets
} from '@common/preview';
import { escapeHtml, safeHttpUrl } from '@common/html';
import { originPattern } from '@common/origins';
import type { PrivacyMode, Settings } from '@common/types';
import { renderDestination } from './options-helpers';

function byId<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }

const SECRET_PLACEHOLDER = '••••••••';
let loadedSettings: Settings | undefined;

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

function inputNumber(id: string, fallback: number): number {
  const value = parseInt(byId<HTMLInputElement>(id).value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function isSecretConfigured(inputId: string): boolean {
  const input = byId<HTMLInputElement>(inputId);
  if (input.dataset.secretState === 'present') return true;
  if (input.dataset.secretMasked === 'true' && input.value === SECRET_PLACEHOLDER) return true;
  return false;
}

function getExportTargets(): ExportTargets {
  return {
    goodlinks: byId<HTMLInputElement>('target_goodlinks')?.checked || false,
    readwise: byId<HTMLInputElement>('target_readwise')?.checked || false
  };
}

function draftSettingsFromForm(base: Settings): Settings {
  return {
    ...base,
    llm: {
      ...base.llm,
      baseUrl: byId<HTMLInputElement>('llm_base').value.trim(),
      model: byId<HTMLInputElement>('llm_model').value.trim(),
      jsonMode: byId<HTMLSelectElement>('llm_json').value === 'true',
      maxChars: inputNumber('llm_max', base.llm.maxChars)
    },
    pinboard: {
      ...base.pinboard,
      shared: byId<HTMLSelectElement>('pin_shared').value === 'true',
      toread: byId<HTMLSelectElement>('pin_toread').value === 'true',
      saveOnCapture: byId<HTMLInputElement>('pinboard_capture').checked
    },
    readwise: {
      ...base.readwise,
      saveOnCapture: byId<HTMLInputElement>('readwise_capture').checked
    },
    tagging: {
      ...base.tagging,
      knownTagLimit: inputNumber('tag_limit', base.tagging.knownTagLimit),
      dedupeThreshold: inputNumber('dedupe', base.tagging.dedupeThreshold)
    },
    privacy: {
      ...base.privacy,
      mode: byId<HTMLSelectElement>('privacy').value as PrivacyMode
    }
  };
}

async function getDraftSettings(): Promise<Settings> {
  return draftSettingsFromForm(loadedSettings || await getSettings());
}

function getPreviewDraft() {
  const base = loadedSettings;
  const fallbackMax = base?.llm.maxChars ?? 4000;
  return {
    llmBaseUrl: byId<HTMLInputElement>('llm_base').value.trim(),
    llmModel: byId<HTMLInputElement>('llm_model').value.trim(),
    llmMaxChars: inputNumber('llm_max', fallbackMax),
    privacyMode: byId<HTMLSelectElement>('privacy').value as PrivacyMode,
    pinboardConfigured: isSecretConfigured('pin_token'),
    pinboardCaptureEnabled: byId<HTMLInputElement>('pinboard_capture').checked,
    readwiseConfigured: isSecretConfigured('readwise_token'),
    readwiseCaptureEnabled: byId<HTMLInputElement>('readwise_capture').checked,
    exportTargets: getExportTargets()
  };
}

async function renderDataPreview(): Promise<void> {
  const settings = await getDraftSettings();
  const mode = settings.privacy.mode;
  byId<HTMLDivElement>('privacy_summary').innerHTML = `<strong>${escapeHtml(privacyModeLabel(mode))}</strong>: ${escapeHtml(privacyModeDescription(mode))}`;

  const destinations = buildDestinationPreviews(settings, {
    pinboardConfigured: isSecretConfigured('pin_token'),
    pinboardCaptureEnabled: byId<HTMLInputElement>('pinboard_capture').checked,
    readwiseConfigured: isSecretConfigured('readwise_token'),
    readwiseCaptureEnabled: byId<HTMLInputElement>('readwise_capture').checked,
    exportTargets: getExportTargets()
  });
  byId<HTMLDivElement>('destination_preview').innerHTML = destinations.map(renderDestination).join('');
}

function queueDataPreviewRender(): void {
  renderDataPreview().catch((err) => console.warn('Could not render data preview', err));
}

function renderCurrentPreview(preview?: DataPreview, message?: string): void {
  const el = byId<HTMLDivElement>('current_preview');
  if (!preview) {
    el.classList.add('empty');
    el.textContent = message || 'Preview the current tab to inspect field presence and character counts. Excerpt text stays hidden until expanded.';
    return;
  }

  const fieldRows = preview.llm.fields.map((field) => {
    const count = typeof field.charCount === 'number' ? `${field.charCount} chars` : 'not present';
    if (field.expandable) {
      return `<div class="preview-field">
        <div class="preview-field-head">
          <div class="preview-field-label">${escapeHtml(field.label)}</div>
          <div class="preview-count">${escapeHtml(count)}</div>
        </div>
        <button type="button" class="ghost preview-toggle" data-preview-toggle>Show text</button>
        <pre class="preview-excerpt" hidden>${escapeHtml(field.value || '')}</pre>
      </div>`;
    }

    return `<div class="preview-field">
      <div class="preview-field-head">
        <div class="preview-field-label">${escapeHtml(field.label)}</div>
        <div class="preview-count">${escapeHtml(count)}</div>
      </div>
      <div class="preview-value">${escapeHtml(field.value || 'Not present')}</div>
    </div>`;
  }).join('');

  el.classList.remove('empty');
  el.innerHTML = `<div class="preview-meta">
    ${preview.llm.endpoint ? `LLM endpoint: ${escapeHtml(preview.llm.endpoint)}` : 'No LLM endpoint configured.'}<br />
    Does not send: ${preview.llm.doesNotSend.map(escapeHtml).join(', ')}
  </div>
  <div class="preview-fields">${fieldRows}</div>`;

  el.querySelectorAll<HTMLButtonElement>('[data-preview-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const excerpt = button.parentElement?.querySelector<HTMLPreElement>('.preview-excerpt');
      if (!excerpt) return;
      const hidden = excerpt.hasAttribute('hidden');
      excerpt.toggleAttribute('hidden', !hidden);
      button.textContent = hidden ? 'Hide text' : 'Show text';
    });
  });
}

async function load() {
  const s = await getSettings();
  loadedSettings = s;
  byId<HTMLInputElement>('llm_base').value = s.llm.baseUrl;
  byId<HTMLInputElement>('llm_model').value = s.llm.model;
  byId<HTMLSelectElement>('llm_json').value = String(s.llm.jsonMode) as any;
  byId<HTMLInputElement>('llm_max').value = String(s.llm.maxChars);
  byId<HTMLSelectElement>('pin_shared').value = String(s.pinboard.shared) as any;
  byId<HTMLSelectElement>('pin_toread').value = String(s.pinboard.toread) as any;
  byId<HTMLInputElement>('pinboard_capture').checked = s.pinboard.saveOnCapture !== false;
  byId<HTMLInputElement>('readwise_capture').checked = Boolean(s.readwise?.saveOnCapture);
  byId<HTMLInputElement>('tag_limit').value = String(s.tagging.knownTagLimit);
  byId<HTMLInputElement>('dedupe').value = String(s.tagging.dedupeThreshold);
  byId<HTMLSelectElement>('privacy').value = s.privacy.mode as any;
  byId<HTMLTextAreaElement>('adv').value = JSON.stringify(s.advanced || {}, null, 2);
  await Promise.all([
    hydrateSecretField('llm_key', s.llm.apiKeyRef),
    hydrateSecretField('pin_token', s.pinboard.authTokenRef),
    hydrateSecretField('readwise_token', s.readwise?.apiTokenRef)
  ]);
  queueDataPreviewRender();
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
  newSettings.pinboard.saveOnCapture = byId<HTMLInputElement>('pinboard_capture').checked;
  if (!newSettings.readwise) newSettings.readwise = {};
  newSettings.readwise.saveOnCapture = byId<HTMLInputElement>('readwise_capture').checked;

  newSettings.tagging.knownTagLimit = parseInt(byId<HTMLInputElement>('tag_limit').value, 10) || 200;
  newSettings.tagging.dedupeThreshold = parseInt(byId<HTMLInputElement>('dedupe').value, 10) || 82;
  newSettings.privacy.mode = byId<HTMLSelectElement>('privacy').value as any;
  try {
    newSettings.advanced = JSON.parse(byId<HTMLTextAreaElement>('adv').value || '{}');
  } catch {
    statusEl.textContent = 'Advanced config must be valid JSON.';
    return;
  }

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
      if (!newSettings.readwise) newSettings.readwise = {};
      const readwise = newSettings.readwise;
      if (ref) readwise.apiTokenRef = ref;
      else delete readwise.apiTokenRef;
    }
  });

  await setSettings(newSettings);
  loadedSettings = newSettings;
  if (prevPattern && prevPattern !== nextPattern) {
    await removeOriginPermission(prevPattern);
  }

  statusEl.textContent = permissionGranted ? 'Saved. Permission granted for your LLM host.' : 'Saved.';
  queueDataPreviewRender();
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
byId<HTMLButtonElement>('previewCurrent').addEventListener('click', async () => {
  const status = byId<HTMLSpanElement>('runtimeStatus');
  status.textContent = 'Previewing…';
  renderCurrentPreview(undefined, 'Loading current tab preview…');
  const tab = await getActiveTab();
  if (!tab?.url) { status.textContent = 'Active tab URL unavailable.'; renderCurrentPreview(undefined); return; }
  const tabOriginPattern = originPattern(tab.url);
  if (!tabOriginPattern) { status.textContent = 'Cannot access this tab. Try a regular http(s) page.'; renderCurrentPreview(undefined); return; }
  const hasPermission = await containsOriginPermission(tabOriginPattern);
  if (!hasPermission) {
    const granted = await requestOriginPermission(tabOriginPattern);
    if (!granted) { status.textContent = 'Permission denied for this site.'; renderCurrentPreview(undefined); return; }
  }
  chrome.runtime.sendMessage({ type: 'preview-current-tab', preview: getPreviewDraft() }, (res) => {
    if (chrome.runtime.lastError) {
      status.textContent = `Preview failed: ${chrome.runtime.lastError.message || 'Unknown'}`;
      renderCurrentPreview(undefined);
      return;
    }
    if (!res?.ok) {
      status.textContent = `Preview failed: ${res?.error || 'Unknown'}`;
      renderCurrentPreview(undefined);
      return;
    }
    renderCurrentPreview(res.preview);
    status.textContent = 'Preview ready.';
  });
});

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
  queueDataPreviewRender();
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
    queueDataPreviewRender();
  });
  input.addEventListener('blur', () => {
    if (!input.value.trim() && input.dataset.secretState === 'pending') {
      input.dataset.secretState = 'missing';
    }
    queueDataPreviewRender();
  });
});

[
  'llm_base',
  'llm_model',
  'llm_json',
  'llm_max',
  'pin_shared',
  'pin_toread',
  'pinboard_capture',
  'readwise_capture',
  'tag_limit',
  'dedupe',
  'privacy',
  'target_goodlinks',
  'target_readwise'
].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener('input', queueDataPreviewRender);
  el?.addEventListener('change', queueDataPreviewRender);
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
    const tags = escapeHtml(it.tags.join(', '));
    const safeTitle = escapeHtml(it.title || it.url);
    const safeUrl = escapeHtml(safeHttpUrl(it.url));
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
