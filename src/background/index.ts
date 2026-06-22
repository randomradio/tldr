import { getSettings, getTags } from '@common/storage';
import { hasCaptureError, type CaptureResult } from '@common/capture';
import { buildDataPreview, type DestinationState, type ExportTargets } from '@common/preview';
import type { PrivacyMode, Settings } from '@common/types';
import { extractFromActiveTab } from './tabs';
import { captureAndSync } from './pipeline';
import { importTagsFromPinboard, listRecentFromPinboard } from './pinboard';
import { exportToGoodlinks, exportToReadwise } from './exporters';

type PreviewDraft = {
  llmBaseUrl?: string;
  llmModel?: string;
  llmMaxChars?: number;
  privacyMode?: PrivacyMode;
  pinboardConfigured?: boolean;
  readwiseConfigured?: boolean;
  readwiseCaptureEnabled?: boolean;
  exportTargets?: ExportTargets;
};

function settingsWithPreviewDraft(settings: Settings, draft?: PreviewDraft): Settings {
  if (!draft) return settings;
  return {
    ...settings,
    llm: {
      ...settings.llm,
      baseUrl: draft.llmBaseUrl ?? settings.llm.baseUrl,
      model: draft.llmModel ?? settings.llm.model,
      maxChars: Number.isFinite(draft.llmMaxChars) ? Number(draft.llmMaxChars) : settings.llm.maxChars
    },
    privacy: {
      ...settings.privacy,
      mode: draft.privacyMode ?? settings.privacy.mode
    }
  };
}

function knownTagNames(map: Awaited<ReturnType<typeof getTags>>, limit: number): string[] {
  return Object.keys(map)
    .sort((a, b) => (map[b]?.count || 0) - (map[a]?.count || 0))
    .slice(0, limit);
}

async function previewCurrentTab(draft?: PreviewDraft) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');

  const [data, settings, knownMap] = await Promise.all([
    extractFromActiveTab(tab.id),
    getSettings(),
    getTags()
  ]);
  const previewSettings = settingsWithPreviewDraft(settings, draft);
  const state: DestinationState = {
    pinboardConfigured: draft?.pinboardConfigured ?? Boolean(settings.pinboard.authTokenRef),
    readwiseConfigured: draft?.readwiseConfigured ?? Boolean(settings.readwise?.apiTokenRef),
    readwiseCaptureEnabled: draft?.readwiseCaptureEnabled ?? Boolean(settings.readwise?.saveOnCapture),
    exportTargets: draft?.exportTargets
  };

  return buildDataPreview(
    {
      title: data.title,
      url: data.url,
      domain: data.domain,
      text: data.text,
      knownTags: knownTagNames(knownMap, previewSettings.tagging.knownTagLimit)
    },
    previewSettings,
    state
  );
}

function renderCaptureStatus(payload: {
  title: string;
  url: string;
  tags: string[];
  destinations: { label: string; status: string; message: string; url?: string; error?: string }[];
}) {
  const existing = document.getElementById('tldr-capture-status');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = 'tldr-capture-status';
  const hasError = payload.destinations.some((destination) => destination.status === 'error');
  const statusText = hasError ? 'Saved with issues' : 'Saved';
  const tagText = payload.tags.length ? payload.tags.slice(0, 5).join(', ') : 'No tags';

  root.style.cssText = [
    'position:fixed',
    'top:10px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'max-width:min(760px,calc(100vw - 24px))',
    'padding:8px 10px',
    'border:1px solid rgba(15,23,42,.12)',
    'border-radius:10px',
    'background:rgba(255,255,255,.94)',
    'box-shadow:0 8px 24px rgba(15,23,42,.12)',
    'color:#0f172a',
    'font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'backdrop-filter:blur(16px)'
  ].join(';');

  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;flex:1';
  summary.innerHTML = `<strong style="font-size:12px">${statusText}</strong><span style="color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tagText}</span>`;
  root.append(summary);

  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap';
  for (const destination of payload.destinations.filter((item) => item.status !== 'skipped' || item.message.startsWith('Already'))) {
    const chip = document.createElement('span');
    const color = destination.status === 'success' ? '#0f766e' : destination.status === 'skipped' ? '#64748b' : '#b45309';
    chip.title = destination.error || destination.message;
    chip.textContent = destination.label;
    chip.style.cssText = `border:1px solid rgba(15,23,42,.1);border-radius:999px;padding:3px 7px;color:${color};background:rgba(248,250,252,.92);font-weight:600`;
    chips.append(chip);
  }
  root.append(chips);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:4px';

  const reader = payload.destinations.find((destination) => destination.label === 'Readwise Reader' && destination.status === 'success');
  if (reader?.url) {
    const openReader = document.createElement('button');
    openReader.type = 'button';
    openReader.textContent = 'Reader';
    openReader.style.cssText = 'border:0;background:transparent;color:#4f46e5;font:inherit;font-weight:700;cursor:pointer;padding:4px 6px';
    openReader.addEventListener('click', () => window.open(reader.url, '_blank', 'noopener,noreferrer'));
    actions.append(openReader);
  }

  const pinboard = payload.destinations.find((destination) => destination.label === 'Pinboard' && destination.status === 'success');
  if (pinboard?.url) {
    const openPinboard = document.createElement('button');
    openPinboard.type = 'button';
    openPinboard.textContent = 'Pinboard';
    openPinboard.style.cssText = 'border:0;background:transparent;color:#4f46e5;font:inherit;font-weight:700;cursor:pointer;padding:4px 6px';
    openPinboard.addEventListener('click', () => window.open(pinboard.url, '_blank', 'noopener,noreferrer'));
    actions.append(openPinboard);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Dismiss';
  close.style.cssText = 'border:0;background:transparent;color:#64748b;font:inherit;cursor:pointer;padding:4px 6px';
  close.addEventListener('click', () => root.remove());
  actions.append(close);
  root.append(actions);

  document.documentElement.append(root);
  if (!hasError) setTimeout(() => root.remove(), 8000);
}

async function showCaptureStatus(tabId: number, result: CaptureResult): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderCaptureStatus,
      args: [{
        title: result.item.title,
        url: result.item.url,
        tags: result.tags,
        destinations: result.destinations
      }]
    });
  } catch (err) {
    console.warn('Could not render capture status UI', err);
  }
}

async function showCaptureError(tabId: number, message: string): Promise<void> {
  const item = {
    id: 'error',
    url: '',
    domain: '',
    title: 'Capture failed',
    createdAt: Date.now(),
    tags: [],
    status: 'error' as const,
    lastError: message
  };
  await showCaptureStatus(tabId, {
    item,
    tags: [],
    destinations: [{ id: 'local', label: 'Capture', status: 'error', message: 'Capture failed', error: message }]
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  try { await importTagsFromPinboard(); } catch {}
  try {
    chrome.contextMenus.create({ id: 'open-options', title: 'Open settings', contexts: ['action'] });
  } catch {}
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab?.id) throw new Error('No active tab');
    await chrome.action.setBadgeBackgroundColor({ color: '#2b7' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '…' });
    const data = await extractFromActiveTab(tab.id);
    const result = await captureAndSync(data);
    await showCaptureStatus(tab.id, result);
    await chrome.action.setBadgeText({ tabId: tab.id, text: hasCaptureError(result) ? '!' : '✓' });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: '' }), 2000);
  } catch (e) {
    if (tab?.id) {
      await chrome.action.setBadgeBackgroundColor({ color: '#c33' });
      await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
      await showCaptureError(tab.id, e instanceof Error ? e.message : String(e));
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: '' }), 2500);
    }
    console.error('Save error', e);
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'save-current-tab') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      const data = await extractFromActiveTab(tab.id);
      const result = await captureAndSync(data);
      await showCaptureStatus(tab.id, result);
      sendResponse({ ok: true, item: result.item, capture: result });
    } else if (msg?.type === 'preview-current-tab') {
      const preview = await previewCurrentTab(msg.preview);
      sendResponse({ ok: true, preview });
    } else if (msg?.type === 'import-pinboard-tags') {
      const n = await importTagsFromPinboard();
      sendResponse({ ok: true, count: n });
    } else if (msg?.type === 'list-pinboard-posts') {
      const count = Math.max(1, Math.min(100, Number(msg.count) || 50));
      const items = await listRecentFromPinboard(count);
      sendResponse({ ok: true, items });
    } else if (msg?.type === 'export-selected') {
      const items = Array.isArray(msg.items) ? msg.items : [];
      const targets = msg.targets || {};
      let goodlinksCount = 0;
      let readwiseCount = 0;
      if (targets.goodlinks) goodlinksCount = await exportToGoodlinks(items);
      if (targets.readwise) readwiseCount = await exportToReadwise(items);
      sendResponse({ ok: true, goodlinksCount, readwiseCount });
    }
  })().catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
