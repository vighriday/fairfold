import { describe, expect, it } from 'vitest';
import { AppError } from '@fairfold/contracts';
import {
  sandboxEnvironment,
  safeScriptError,
} from '../../../scripts/support/sandbox-environment.js';

const valid = {
  PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
  PAYPAL_CLIENT_ID: 'synthetic-client',
  PAYPAL_CLIENT_SECRET: 'synthetic-secret',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  DEMO_MODE: 'true',
  DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:55432/fairfold_h2_dev',
};
describe('local sandbox operator boundary', () => {
  it('skips both absent credentials and accepts complete local setup', () => {
    expect(sandboxEnvironment({ PAYPAL_API_BASE: valid.PAYPAL_API_BASE })).toBeNull();
    expect(sandboxEnvironment(valid)?.databaseUrl).toBe(valid.DATABASE_URL);
  });
  it.each([
    { PAYPAL_API_BASE: 'https://api-m.paypal.com' },
    { PAYPAL_CLIENT_SECRET: '' },
    { PAYPAL_CLIENT_ID: '' },
    { DEMO_MODE: 'false' },
    { APP_ENCRYPTION_KEY: 'bad-key' },
    { DATABASE_URL: 'not-a-url' },
    { DATABASE_URL: 'postgres://synthetic:synthetic@remote.invalid/fairfold_h2_dev' },
    { DATABASE_URL: 'https://127.0.0.1/fairfold_h2_dev' },
    { DATABASE_URL: 'postgres://127.0.0.1/unrelated' },
  ])('rejects unsafe or incomplete operator configuration', (override) => {
    expect(() => sandboxEnvironment({ ...valid, ...override })).toThrow(AppError);
  });
  it('prints only symbolic error codes, never driver or vendor messages', () => {
    expect(safeScriptError(new Error('synthetic-private-value'))).toBe('SANDBOX_TOOL_FAILED');
    expect(safeScriptError(new AppError('SAFE_CODE', 'synthetic-private-value'))).toBe('SAFE_CODE');
  });
});
