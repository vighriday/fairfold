import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  JobSchemas,
  MoneySchema,
  CaptureResultSchema,
  decodeEncryptionKey,
  decryptSecret,
  encryptSecret,
} from '../src/index.js';

describe('shared boundaries', () => {
  it('requires capture identifiers without inventing absent payer data', () => {
    const capture = {
      orderId: 'SEED-ORDER',
      captureId: 'SEED-CAPTURE',
      status: 'COMPLETED',
      sellerProtection: { status: null, disputeCategories: [] },
      payerAccountStatus: null,
      payerId: null,
      payerEmail: null,
      payerName: null,
      shipping: null,
      raw: {},
    };
    expect(CaptureResultSchema.parse(capture).payerAccountStatus).toBeNull();
    expect(CaptureResultSchema.safeParse({ ...capture, captureId: '' }).success).toBe(false);
  });
  it('keeps money as a nonnegative decimal string', () => {
    expect(MoneySchema.parse({ currency_code: 'USD', value: '38.00' }).value).toBe('38.00');
    expect(MoneySchema.safeParse({ currency_code: 'USD', value: 38 }).success).toBe(false);
    expect(MoneySchema.safeParse({ currency_code: 'USD', value: '-1.00' }).success).toBe(false);
  });
  it('rejects malformed jobs before they reach a worker', () => {
    expect(JobSchemas['order.captured'].safeParse({ orderId: 'SEED-not-a-uuid' }).success).toBe(
      false,
    );
    expect(
      JobSchemas['action.approved'].safeParse({
        actionId: '00000000-0000-4000-8000-000000000001',
        approved: true,
      }).success,
    ).toBe(false);
  });
});

describe('merchant secret encryption', () => {
  it('uses randomized authenticated encryption bound to a merchant context', () => {
    const key = randomBytes(32);
    const first = encryptSecret('test-only-secret', key, 'merchant-1');
    expect(first).not.toBe(encryptSecret('test-only-secret', key, 'merchant-1'));
    expect(first).not.toContain('test-only-secret');
    expect(decryptSecret(first, key, 'merchant-1')).toBe('test-only-secret');
    expect(() => decryptSecret(first, key, 'merchant-2')).toThrow('Unable to decrypt');
    expect(() => decryptSecret(first, randomBytes(32), 'merchant-1')).toThrow('Unable to decrypt');
    const parts = first.split('.');
    parts[2] = Buffer.alloc(16).toString('base64');
    expect(() => decryptSecret(parts.join('.'), key, 'merchant-1')).toThrow('Unable to decrypt');
  });
  it('requires an exact AES-256 key', () => {
    expect(() => decodeEncryptionKey(Buffer.alloc(16).toString('base64'))).toThrow();
    expect(decodeEncryptionKey(randomBytes(32).toString('base64')).length).toBe(32);
  });
});
