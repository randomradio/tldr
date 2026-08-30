import { escapeHtml } from '@common/html';
import type { DestinationPreview } from '@common/preview';

export function destinationStatusLabel(status: DestinationPreview['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'not_configured':
      return 'Not configured';
    case 'disabled':
      return 'Disabled';
  }
}

export function renderDestination(destination: DestinationPreview): string {
  const receives = destination.receives.length
    ? destination.receives.map((item) => `<span class="mini-pill">${escapeHtml(item)}</span>`).join('')
    : '<span class="mini-pill">No data sent</span>';

  return `<div class="destination">
    <div class="destination-head">
      <div class="destination-title">${escapeHtml(destination.label)}</div>
      <div class="destination-status ${destination.status}">${destinationStatusLabel(destination.status)}</div>
    </div>
    <div class="destination-copy">${escapeHtml(destination.statusText)}</div>
    <div class="destination-receives">${receives}</div>
  </div>`;
}
