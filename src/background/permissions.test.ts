import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureOriginPermission } from './permissions';

describe('ensureOriginPermission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns without prompting for non-http URLs', async () => {
    const contains = vi.fn();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      permissions: { contains, request: vi.fn() }
    };
    await ensureOriginPermission('chrome://extensions');
    expect(contains).not.toHaveBeenCalled();
  });

  it('returns when the origin is already granted', async () => {
    const contains = vi.fn().mockResolvedValue(true);
    const request = vi.fn();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      permissions: { contains, request }
    };
    await ensureOriginPermission('https://api.moonshot.cn/v1');
    expect(contains).toHaveBeenCalledWith({ origins: ['https://api.moonshot.cn/*'] });
    expect(request).not.toHaveBeenCalled();
  });

  it('requests permission when missing', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    const request = vi.fn().mockResolvedValue(true);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      permissions: { contains, request }
    };
    await ensureOriginPermission('http://localhost:11434/v1');
    expect(request).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
  });

  it('throws when the user denies the origin', async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(false)
      }
    };
    await expect(ensureOriginPermission('https://llm.example.test/v1')).rejects.toThrow(
      'Permission was not granted for https://llm.example.test'
    );
  });
});
