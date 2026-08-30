import type { CaptureDestinationResult } from '@common/capture';

export function toastChipColor(status: string): string {
  if (status === 'success') return '#0f766e';
  if (status === 'skipped') return '#64748b';
  return '#b45309';
}

export function visibleToastDestinations(destinations: CaptureDestinationResult[]): CaptureDestinationResult[] {
  return destinations.filter((destination) => (
    destination.status !== 'skipped'
    || destination.message.startsWith('Already')
    || destination.message === 'Tags updated'
  ));
}
