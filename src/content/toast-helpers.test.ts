import { describe, expect, it } from 'vitest';
import { toastChipColor, visibleToastDestinations } from './toast-helpers';

describe('toastChipColor', () => {
  it('maps destination status to chip colors', () => {
    expect(toastChipColor('success')).toBe('#0f766e');
    expect(toastChipColor('skipped')).toBe('#64748b');
    expect(toastChipColor('error')).toBe('#b45309');
    expect(toastChipColor('unknown')).toBe('#b45309');
  });
});

describe('visibleToastDestinations', () => {
  it('hides ordinary skips and keeps already-synced or updated skips', () => {
    const visible = visibleToastDestinations([
      { id: 'local', label: 'Local library', status: 'success', message: 'Saved locally' },
      { id: 'pinboard', label: 'Pinboard', status: 'skipped', message: 'Pinboard token not configured' },
      { id: 'readwise', label: 'Readwise Reader', status: 'skipped', message: 'Already synced to Readwise Reader' },
      { id: 'llm', label: 'LLM tags', status: 'skipped', message: 'Tags updated' },
      { id: 'pinboard', label: 'Pinboard', status: 'error', message: 'Pinboard save failed' }
    ]);

    expect(visible.map((destination) => destination.message)).toEqual([
      'Saved locally',
      'Already synced to Readwise Reader',
      'Tags updated',
      'Pinboard save failed'
    ]);
  });
});
