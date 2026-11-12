import { describe, expect, it } from 'vitest';
import { AppError } from '@fairfold/contracts';
import {
  renderSandboxEnvironment,
  RenderSandboxTarget,
} from '../../../scripts/support/render-sandbox-environment.js';
import { sandboxEnvironment } from '../../../scripts/support/sandbox-environment.js';

const valid = {
  RENDER: 'true',
  RENDER_SERVICE_ID: RenderSandboxTarget.serviceId,
  RENDER_SERVICE_TYPE: 'web',
  RENDER_GIT_REPO_SLUG: RenderSandboxTarget.repo,
  RENDER_GIT_BRANCH: 'main',
  RENDER_EXTERNAL_URL: RenderSandboxTarget.origin,
  IS_PULL_REQUEST: 'false',
  DEMO_MODE: 'true',
  DATABASE_URL: `postgres://fairfold:synthetic@${RenderSandboxTarget.databaseHost}/fairfold`,
  PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  PAYPAL_CLIENT_ID: 'synthetic-client',
  PAYPAL_CLIENT_SECRET: 'synthetic-secret',
};

describe('bounded hosted sandbox operator', () => {
  it('defaults to no mutation and requires exact service confirmation to apply', () => {
    expect(renderSandboxEnvironment(valid, ['check']).mode).toBe('check');
    expect(
      renderSandboxEnvironment(valid, ['apply', '--confirm-service', RenderSandboxTarget.serviceId])
        .mode,
    ).toBe('apply');
    for (const args of [
      [],
      ['apply'],
      ['apply', '--confirm-service', 'another-service'],
      ['check', '--apply'],
      ['check', 'extra'],
    ])
      expect(() => renderSandboxEnvironment(valid, args)).toThrow(AppError);
  });
  it.each([
    { RENDER: 'false' },
    { RENDER_SERVICE_ID: 'srv-unrelated' },
    { RENDER_SERVICE_TYPE: 'worker' },
    { RENDER_GIT_REPO_SLUG: 'other/fairfold' },
    { RENDER_GIT_BRANCH: 'preview' },
    { RENDER_EXTERNAL_URL: 'https://other.onrender.com' },
    { IS_PULL_REQUEST: 'true' },
    { DEMO_MODE: 'false' },
    { PAYPAL_API_BASE: 'https://api-m.paypal.com' },
    { APP_ENCRYPTION_KEY: 'invalid' },
    { PAYPAL_CLIENT_ID: '' },
    { PAYPAL_CLIENT_SECRET: '' },
    { PAYPAL_CLIENT_SECRET: 'private\nvalue' },
    { DATABASE_URL: 'not-a-url' },
    { DATABASE_URL: 'postgres://fairfold:synthetic@localhost/fairfold' },
    {
      DATABASE_URL: `postgres://fairfold:synthetic@${RenderSandboxTarget.databaseHost}.oregon-postgres.render.com/fairfold`,
    },
    { DATABASE_URL: `postgres://other:synthetic@${RenderSandboxTarget.databaseHost}/fairfold` },
    { DATABASE_URL: `postgres://fairfold:synthetic@${RenderSandboxTarget.databaseHost}/unrelated` },
    {
      DATABASE_URL: `postgres://fairfold:synthetic@${RenderSandboxTarget.databaseHost}:5433/fairfold`,
    },
    { DATABASE_URL: `https://fairfold:synthetic@${RenderSandboxTarget.databaseHost}/fairfold` },
    {
      DATABASE_URL: `postgres://fairfold:synthetic@${RenderSandboxTarget.databaseHost}/fairfold?host=other.invalid`,
    },
  ])('rejects wrong environments before database connection', (override) => {
    expect(() => renderSandboxEnvironment({ ...valid, ...override }, ['check'])).toThrow(AppError);
  });
  it('does not loosen local rehearsal or import the buyer email as a credential', () => {
    expect(() => sandboxEnvironment(valid)).toThrow(AppError);
    const result = renderSandboxEnvironment(
      { ...valid, PAYPAL_BUYER_EMAIL: 'synthetic@example.invalid' },
      ['check'],
    );
    expect(result).not.toHaveProperty('buyerEmail');
    expect(JSON.stringify(result)).not.toContain('synthetic@example.invalid');
  });
});
