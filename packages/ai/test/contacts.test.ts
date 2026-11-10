import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateStructured } from '../src/generate.js';
import { removeContactDetails } from '../src/untrusted.js';
import { mockModel } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('removeContactDetails', () => {
  it.each([
    ['Write to maya.k+orders@example.com today', 'Write to [email removed] today'],
    ['MAYA@Example.CO.UK', '[email removed]'],
    ['Call me on +1 (415) 555-0134.', 'Call me on [phone removed].'],
    ['ring 415-555-0134 or 415.555.0135', 'ring [phone removed] or [phone removed]'],
    ['WhatsApp +91 98765 43210', 'WhatsApp [phone removed]'],
    ['UK: 0044 20 7946 0958', 'UK: [phone removed]'],
    ['mobile 9876543210', 'mobile [phone removed]'],
  ])('removes %s', (input, expected) => {
    expect(removeContactDetails(input)).toBe(expected);
  });

  it.each([
    'Order FF-0b6a1c2e-1d4f-4a51-9d1e-3f0c2b7a9e10 arrived on 2026-11-09.',
    'It cost $38.00 and arrived 10 days late.',
    'Size M, batch B17, 2 hoodies.',
    'Delivered 09/11/2026 at 10:30.',
    'Tracking 1Z999AA10123456784',
  ])('keeps order facts that are not contact details: %s', (text) => {
    expect(removeContactDetails(text)).toBe(text);
  });
});

describe('generateStructured removes contact details from untrusted text', () => {
  it('the model never receives the buyer email or phone number', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { model, calls } = mockModel(['{"ok":true}']);
    await generateStructured({
      schema: z.object({ ok: z.boolean() }),
      system: 's',
      user: 'u',
      untrusted: ['Seam split. Email maya@example.com or call +1 415 555 0134. Order FF-12.'],
      fallback: () => ({ ok: false }),
      model,
      component: 'test',
    });
    const sent = JSON.stringify(calls[0]!.prompt);
    expect(sent).not.toContain('maya@example.com');
    expect(sent).not.toContain('555 0134');
    expect(sent).toContain('[email removed]');
    expect(sent).toContain('[phone removed]');
    expect(sent).toContain('Order FF-12.');
  });
});
