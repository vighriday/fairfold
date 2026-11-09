import { AppError, decodeEncryptionKey } from '../../packages/contracts/src/index.js';

/** Operator tools are local demo tools, even when the normal app is hosted. */
export function sandboxEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment.PAYPAL_API_BASE !== 'https://api-m.sandbox.paypal.com')
    throw new AppError('SANDBOX_REQUIRED', 'Set the exact PayPal sandbox API origin');
  if (!environment.PAYPAL_CLIENT_ID && !environment.PAYPAL_CLIENT_SECRET) return null;
  if (!environment.PAYPAL_CLIENT_ID?.trim() || !environment.PAYPAL_CLIENT_SECRET?.trim())
    throw new AppError(
      'SANDBOX_CREDENTIALS_INCOMPLETE',
      'Both sandbox app credentials are required',
    );
  if (environment.DEMO_MODE !== 'true')
    throw new AppError('LOCAL_DEMO_REQUIRED', 'Sandbox rehearsal tools require DEMO_MODE=true');
  let database: URL;
  try {
    database = new URL(environment.DATABASE_URL ?? '');
  } catch {
    throw new AppError(
      'LOCAL_DATABASE_REQUIRED',
      'A local Fairfold PostgreSQL database is required',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) ||
    !/^\/fairfold_[a-z0-9_]+$/.test(database.pathname)
  )
    throw new AppError(
      'LOCAL_DATABASE_REQUIRED',
      'A local Fairfold PostgreSQL database is required',
    );
  try {
    decodeEncryptionKey(environment.APP_ENCRYPTION_KEY ?? '');
  } catch {
    throw new AppError('ENCRYPTION_KEY_REQUIRED', 'A valid local encryption key is required');
  }
  return {
    databaseUrl: environment.DATABASE_URL!,
    encryptionKey: environment.APP_ENCRYPTION_KEY!,
    clientId: environment.PAYPAL_CLIENT_ID,
    clientSecret: environment.PAYPAL_CLIENT_SECRET,
  };
}

/** Never print Error.message/cause or database/vendor errors containing values. */
export function safeScriptError(error: unknown): string {
  return error instanceof AppError ? error.code : 'SANDBOX_TOOL_FAILED';
}
