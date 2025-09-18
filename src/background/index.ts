import { extractFromActiveTab } from './tabs';
import { tagAndMaybeSync } from './pipeline';
import { importTagsFromPinboard, listRecentFromPinboard } from './pinboard';
import { exportToGoodlinks, exportToReadwise } from './exporters';

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
    await tagAndMaybeSync(data);
    await chrome.action.setBadgeText({ tabId: tab.id, text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: '' }), 2000);
  } catch (e) {
    if (tab?.id) {
      await chrome.action.setBadgeBackgroundColor({ color: '#c33' });
      await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
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
      const res = await tagAndMaybeSync(data);
      sendResponse({ ok: true, item: res });
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
