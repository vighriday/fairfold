import { describe, expect, it } from 'vitest';
import { readWorkerConfig } from '../src/runtime.js';

const environment = {
  DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1/fairfold_test',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};
describe('H3 worker configuration', () => {
  it('requires only the worker database/key/sandbox configuration', () => {
    expect(readWorkerConfig(environment)).toMatchObject({
      databaseUrl: environment.DATABASE_URL,
      paypalApiBase: 'https://api-m.sandbox.paypal.com',
    });
  });
  it.each([
    { DATABASE_URL: undefined },
    { APP_ENCRYPTION_KEY: undefined },
    { PAYPAL_API_BASE: 'https://api-m.paypal.com' },
    { DATABASE_URL: 'https://database.example.com' },
  ])('rejects incomplete/live config with a fixed diagnostic', (extra) => {
    expect(() => readWorkerConfig({ ...environment, ...extra })).toThrowError(
      'Worker sandbox/database/key configuration is invalid',
    );
  });
});
