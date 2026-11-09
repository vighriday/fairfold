import { describe, expect, it } from 'vitest';
import { minimizeEvent } from '../src/event-policy.js';

const event = {
  id: 'WH-SYNTHETIC-001',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  create_time: '2026-11-10T05:30:00+05:30',
  resource_type: 'capture',
  event_version: '1.0',
  summary: 'Excluded summary',
  resource: {
    id: 'CAPTURE001',
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '38.00', excluded: 'DROP' },
    payee: { email_address: 'excluded@example.invalid' },
    shipping: { address_line_1: 'Excluded street' },
    supplementary_data: {
      related_ids: { order_id: 'ORDER001', capture_id: 'CAPTURE001', secret: 'DROP' },
      secret: 'DROP',
    },
    links: [{ href: 'https://excluded.invalid/?token=DROP' }],
  },
};
describe('H3 approved event minimization (synthetic)', () => {
  it('retains only the explicit nested allowlist and normalizes UTC', () => {
    expect(minimizeEvent(event, true)).toEqual({
      id: event.id,
      event_type: event.event_type,
      create_time: '2026-11-10T00:00:00.000Z',
      resource_type: 'capture',
      event_version: '1.0',
      resource: {
        id: 'CAPTURE001',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '38.00' },
        supplementary_data: { related_ids: { order_id: 'ORDER001', capture_id: 'CAPTURE001' } },
      },
    });
  });
  it('retains metadata only for an unverified event', () => {
    expect(minimizeEvent(event, false)).toEqual({ id: event.id, event_type: event.event_type });
  });
  it.each([
    null,
    [],
    {},
    { id: 'buyer@example.invalid', event_type: event.event_type },
    { id: event.id, event_type: 'arbitrary buyer text' },
  ])('rejects invalid mandatory metadata: %j', (input) => {
    expect(() => minimizeEvent(input, true)).toThrow();
  });
  it('rejects a verified event without a resource object', () => {
    expect(() => minimizeEvent({ id: event.id, event_type: event.event_type }, true)).toThrow();
  });
  it('drops invalid optional values without retaining free text', () => {
    expect(
      minimizeEvent(
        {
          ...event,
          create_time: 'bad',
          event_version: 'email@example.invalid',
          resource: {
            id: 'address text',
            status: 'free text',
            amount: { value: 38, currency_code: 'USD' },
          },
        },
        true,
      ),
    ).toEqual({
      id: event.id,
      event_type: event.event_type,
      resource_type: 'capture',
      resource: {},
    });
  });
});
