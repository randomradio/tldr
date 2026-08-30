import { describe, expect, it } from 'vitest';
import { destinationStatusLabel, renderDestination } from './options-helpers';

describe('destinationStatusLabel', () => {
  it('labels each destination status', () => {
    expect(destinationStatusLabel('active')).toBe('Active');
    expect(destinationStatusLabel('not_configured')).toBe('Not configured');
    expect(destinationStatusLabel('disabled')).toBe('Disabled');
  });
});

describe('renderDestination', () => {
  it('escapes destination copy and lists received fields', () => {
    const html = renderDestination({
      id: 'pinboard',
      label: '<Pinboard>',
      status: 'active',
      statusText: 'Sends <url>',
      receives: ['page URL', '<script>']
    });

    expect(html).toContain('destination-status active');
    expect(html).toContain('Active');
    expect(html).toContain('&lt;Pinboard&gt;');
    expect(html).toContain('Sends &lt;url&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a no-data pill when nothing is sent', () => {
    const html = renderDestination({
      id: 'goodlinks',
      label: 'GoodLinks',
      status: 'disabled',
      statusText: 'Off',
      receives: []
    });

    expect(html).toContain('No data sent');
    expect(html).toContain('Disabled');
  });
});
