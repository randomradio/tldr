import { originPattern } from '@common/origins';

export async function ensureOriginPermission(url: string): Promise<void> {
  const pattern = originPattern(url);
  if (!pattern) return;
  const alreadyGranted = await chrome.permissions.contains({ origins: [pattern] });
  if (alreadyGranted) return;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    throw new Error(`Permission was not granted for ${new URL(url).origin}`);
  }
}
