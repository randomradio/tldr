import { hasCaptureError, type CaptureDestinationResult, type CaptureResult } from '@common/capture';
import { RETRY_DESTINATION, SHOW_CAPTURE, UPDATE_TAGS } from '@common/messages';
import { parseTagInput } from '@common/tags-input';

declare global {
  interface Window {
    __tldrToastInstalled?: boolean;
  }
}

const ROOT_ID = 'tldr-capture-status';
const ACTION_STYLE = 'border:0;background:transparent;color:#4f46e5;font:inherit;font-weight:700;cursor:pointer;padding:4px 6px';
const MUTED_ACTION_STYLE = 'border:0;background:transparent;color:#64748b;font:inherit;cursor:pointer;padding:4px 6px';

let dismissTimer: number | undefined;

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!res?.ok) {
        reject(new Error(res?.error || 'Request failed'));
        return;
      }
      resolve(res as T);
    });
  });
}

function chipColor(status: string): string {
  if (status === 'success') return '#0f766e';
  if (status === 'skipped') return '#64748b';
  return '#b45309';
}

function visibleDestinations(destinations: CaptureDestinationResult[]): CaptureDestinationResult[] {
  return destinations.filter((destination) => destination.status !== 'skipped' || destination.message.startsWith('Already') || destination.message === 'Tags updated');
}

function clearTimer(): void {
  if (dismissTimer) {
    window.clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }
}

function scheduleDismiss(root: HTMLElement, capture: CaptureResult): void {
  clearTimer();
  if (hasCaptureError(capture)) return;
  dismissTimer = window.setTimeout(() => root.remove(), 8000);
}

function renderToast(capture: CaptureResult): void {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('data-tldr-toast', '1');
  const failed = hasCaptureError(capture);
  const canEdit = Boolean(capture.item.id && capture.item.id !== 'error');

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
    'flex-wrap:wrap',
    'backdrop-filter:blur(16px)'
  ].join(';');

  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;flex:1';
  const statusEl = document.createElement('strong');
  statusEl.style.fontSize = '12px';
  statusEl.textContent = failed ? 'Saved with issues' : 'Saved';
  const tagsEl = document.createElement('span');
  tagsEl.style.cssText = 'color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  tagsEl.textContent = capture.tags.length ? capture.tags.slice(0, 8).join(', ') : 'No tags';
  summary.append(statusEl, tagsEl);
  root.append(summary);

  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap';
  for (const dest of visibleDestinations(capture.destinations)) {
    const chip = dest.status === 'error' && canEdit
      ? document.createElement('button')
      : document.createElement('span');
    chip.title = dest.error || dest.message;
    chip.textContent = dest.status === 'error' && canEdit ? `Retry ${dest.label}` : dest.label;
    chip.style.cssText = `border:1px solid rgba(15,23,42,.1);border-radius:999px;padding:3px 7px;color:${chipColor(dest.status)};background:rgba(248,250,252,.92);font-weight:600;font:inherit;cursor:${chip.tagName === 'BUTTON' ? 'pointer' : 'default'}`;
    if (chip instanceof HTMLButtonElement) {
      chip.type = 'button';
      chip.addEventListener('click', async () => {
        chip.textContent = `Retrying ${dest.label}…`;
        chip.disabled = true;
        try {
          const res = await sendMessage<{ capture: CaptureResult }>({
            type: RETRY_DESTINATION,
            itemId: capture.item.id,
            destinationId: dest.id
          });
          renderToast(res.capture);
        } catch (err) {
          chip.disabled = false;
          chip.textContent = `Retry ${dest.label}`;
          chip.title = err instanceof Error ? err.message : String(err);
        }
      });
    }
    chips.append(chip);
  }
  root.append(chips);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:4px';

  const reader = capture.destinations.find((destination) => destination.id === 'readwise' && destination.url && destination.status !== 'error');
  if (reader?.url) {
    const openReader = document.createElement('button');
    openReader.type = 'button';
    openReader.textContent = 'Reader';
    openReader.style.cssText = ACTION_STYLE;
    openReader.addEventListener('click', () => window.open(reader.url, '_blank', 'noopener,noreferrer'));
    actions.append(openReader);
  }

  const pinboard = capture.destinations.find((destination) => destination.id === 'pinboard' && destination.url && destination.status !== 'error');
  if (pinboard?.url) {
    const openPinboard = document.createElement('button');
    openPinboard.type = 'button';
    openPinboard.textContent = 'Pinboard';
    openPinboard.style.cssText = ACTION_STYLE;
    openPinboard.addEventListener('click', () => window.open(pinboard.url, '_blank', 'noopener,noreferrer'));
    actions.append(openPinboard);
  }

  if (canEdit) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit tags';
    edit.style.cssText = ACTION_STYLE;
    edit.addEventListener('click', () => {
      clearTimer();
      const form = document.createElement('form');
      form.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = capture.tags.join(', ');
      input.setAttribute('aria-label', 'Tags');
      input.style.cssText = 'flex:1;min-width:160px;border:1px solid rgba(15,23,42,.14);border-radius:8px;padding:4px 8px;font:inherit';
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Save tags';
      save.style.cssText = ACTION_STYLE;
      form.append(input, save);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
          const res = await sendMessage<{ capture: CaptureResult }>({
            type: UPDATE_TAGS,
            itemId: capture.item.id,
            tags: parseTagInput(input.value)
          });
          renderToast(res.capture);
        } catch (err) {
          save.disabled = false;
          save.title = err instanceof Error ? err.message : String(err);
        }
      });
      root.append(form);
      input.focus();
      input.select();
    });
    actions.append(edit);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Dismiss';
  close.style.cssText = MUTED_ACTION_STYLE;
  close.addEventListener('click', () => {
    clearTimer();
    root.remove();
  });
  actions.append(close);
  root.append(actions);

  document.documentElement.append(root);
  scheduleDismiss(root, capture);
}

function install(): void {
  if (window.__tldrToastInstalled) return;
  window.__tldrToastInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== SHOW_CAPTURE || !message.capture) return;
    try {
      renderToast(message.capture as CaptureResult);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return false;
  });
}

install();
