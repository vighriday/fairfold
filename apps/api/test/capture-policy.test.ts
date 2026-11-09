import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256 } from '@fairfold/ledger';
import { minimizeCapture } from '../src/checkout/capture-policy.js';
import { captureFixture, rawUnit } from './capture-fixture.js';

describe('approved capture retention policy', () => {
  it('hashes normalized email and all six address components with canonical JSON', () => {
    const retained = minimizeCapture(captureFixture());
    expect(retained.emailHash).toBe(sha256('máya@example.invalid'));
    expect(retained.shipToHash).toBe(
      sha256(
        canonicalJson({
          address_line_1: '10 Café Road',
          address_line_2: 'Suite 2',
          admin_area_2: 'Test City',
          admin_area_1: 'Region',
          postal_code: 'Ab 12',
          country_code: 'US',
        }),
      ),
    );
    expect(retained.shipToCountry).toBe('US');
    expect(retained.shipToPostal).toBe('Ab 12');
  });
  it('excludes plaintext email, streets, shipping recipient and arbitrary vendor fields', () => {
    const retained = minimizeCapture(captureFixture());
    const serialized = JSON.stringify(retained);
    for (const excluded of [
      '@example.invalid',
      'Road',
      'Suite',
      'Ignored DTO',
      'Excluded Recipient',
      'excluded-',
      'purchase_units',
      'raw',
    ])
      expect(serialized).not.toContain(excluded);
    expect(retained.displayName).toBe('Synthetic Buyer');
    expect(retained).not.toHaveProperty('shipping');
  });
  it('uses line 2 even when the shared DTO cannot expose it', () => {
    const input = captureFixture();
    const before = minimizeCapture(input).shipToHash;
    const address = (rawUnit(input).shipping as { address: Record<string, unknown> }).address;
    address.address_line_2 = 'Suite 3';
    expect(minimizeCapture(input).shipToHash).not.toBe(before);
    delete address.address_line_1;
    expect(minimizeCapture(input).shipToHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('keeps street case significant and country case insignificant', () => {
    const input = captureFixture();
    const before = minimizeCapture(input).shipToHash;
    const address = (rawUnit(input).shipping as { address: Record<string, unknown> }).address;
    address.country_code = 'US';
    expect(minimizeCapture(input).shipToHash).toBe(before);
    address.address_line_1 = '10 CAFÉ ROAD';
    expect(minimizeCapture(input).shipToHash).not.toBe(before);
  });
  it('keeps no-street hash null even when country/postal exist', () => {
    const input = captureFixture();
    rawUnit(input).shipping = {
      address: {
        country_code: 'US',
        postal_code: '12345',
        address_line_1: '  ',
        address_line_2: null,
      },
    };
    expect(minimizeCapture(input)).toMatchObject({
      shipToHash: null,
      shipToCountry: 'US',
      shipToPostal: '12345',
    });
  });
  it('preserves unknown identity/protection without substituting shipping recipient', () => {
    const input = captureFixture();
    input.payerId = input.payerEmail = input.payerName = input.payerAccountStatus = null;
    input.sellerProtection = { status: null, disputeCategories: [] };
    delete rawUnit(input).shipping;
    expect(minimizeCapture(input)).toMatchObject({
      payerId: null,
      emailHash: null,
      displayName: null,
      payerAccountStatus: null,
      sellerProtection: { status: null, disputeCategories: [] },
      shipToCountry: null,
      shipToPostal: null,
      shipToHash: null,
    });
  });
  it('treats an empty email as unknown and does not mutate the response', () => {
    const input = captureFixture();
    input.payerEmail = ' \t ';
    const before = JSON.stringify(input);
    expect(minimizeCapture(input).emailHash).toBeNull();
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each(['order', 'capture', 'status', 'amount', 'units', 'captures', 'address'])(
    'rejects invalid %s without contact data in the error',
    (field) => {
      const input = captureFixture();
      const raw = input.raw as { id: string; purchase_units: unknown[] };
      const unit = rawUnit(input);
      const payments = unit.payments as {
        captures: Array<{ id: string; status: string; amount: unknown }>;
      };
      if (field === 'order') raw.id = 'DIFFERENT';
      if (field === 'capture') payments.captures[0]!.id = 'DIFFERENT';
      if (field === 'status') payments.captures[0]!.status = 'PENDING';
      if (field === 'amount')
        payments.captures[0]!.amount = { currency_code: 'USD', value: '38.001' };
      if (field === 'units') raw.purchase_units.push(unit);
      if (field === 'captures') payments.captures.push(payments.captures[0]!);
      if (field === 'address')
        unit.shipping = { address: { address_line_1: { email: input.payerEmail } } };
      expect(() => minimizeCapture(input)).toThrow('Capture response could not be validated');
      try {
        minimizeCapture(input);
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain('@example.invalid');
        expect(JSON.stringify(error)).not.toContain('Road');
      }
    },
  );
});
