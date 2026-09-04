import { getSettings, getTags } from '@common/storage';
import { hasCaptureError, type CaptureResult } from '@common/capture';
import { buildDataPreview, type DestinationState } from '@common/preview';
import { RETRY_DESTINATION, SHOW_CAPTURE, UPDATE_TAGS } from '@common/messages';
import { extractFromActiveTab } from './tabs';
import { captureAndSync, retryDestination, updateCapturedTags } from './pipeline';
import { importTagsFromPinboard, listRecentFromPinboard } from './pinboard';
import { exportToGoodlinks, exportToReadwise } from './exporters';
import { ensureOriginPermission } from './permissions';
import { knownTagNames, settingsWithPreviewDraft, type PreviewDraft } from './preview-draft';

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
    pinboardCaptureEnabled: draft?.pinboardCaptureEnabled ?? settings.pinboard.saveOnCapture !== false,
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

async function showCaptureStatus(tabId: number, result: CaptureResult): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/toast.js']
    });
    await chrome.tabs.sendMessage(tabId, { type: SHOW_CAPTURE, capture: result });
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
    const settings = await getSettings();
    await ensureOriginPermission(settings.llm.baseUrl);
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
    } else if (msg?.type === RETRY_DESTINATION) {
      const capture = await retryDestination(String(msg.itemId || ''), msg.destinationId);
      sendResponse({ ok: true, capture });
    } else if (msg?.type === UPDATE_TAGS) {
      const tags = Array.isArray(msg.tags) ? msg.tags.map(String) : [];
      const capture = await updateCapturedTags(String(msg.itemId || ''), tags);
      sendResponse({ ok: true, capture });
    }
  })().catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
