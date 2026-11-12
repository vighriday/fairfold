import { AppError, decodeEncryptionKey } from '../../packages/contracts/src/index.js';

/** Explicitly reviewed existing deployment. These identifiers are not credentials. */
export const RenderSandboxTarget = {
  serviceId: 'srv-dbr099on74is73b3i420',
  databaseHost: 'dpg-dbr08m59fdbs73du07p0-a',
  origin: 'https://fairfold-api.onrender.com',
  repo: 'vighriday/fairfold',
} as const;

/** Separate hosted operator boundary; never relax the local rehearsal guard. */
export function renderSandboxEnvironment(environment: NodeJS.ProcessEnv, args: readonly string[]) {
  const mode = args[0];
  if (!(
    (mode === 'check' && args.length === 1) ||
    (mode === 'apply' &&
      args.length === 3 &&
      args[1] === '--confirm-service' &&
      args[2] === RenderSandboxTarget.serviceId)
  ))
    throw new AppError(
      'RENDER_SETUP_ARGUMENTS',
      'An explicit check or confirmed apply is required',
    );
  if (
    environment.RENDER !== 'true' ||
    environment.RENDER_SERVICE_ID !== RenderSandboxTarget.serviceId ||
    environment.RENDER_SERVICE_TYPE !== 'web' ||
    environment.RENDER_GIT_REPO_SLUG !== RenderSandboxTarget.repo ||
    environment.RENDER_GIT_BRANCH !== 'main' ||
    environment.RENDER_EXTERNAL_URL !== RenderSandboxTarget.origin ||
    environment.IS_PULL_REQUEST === 'true'
  )
    throw new AppError('RENDER_SETUP_TARGET', 'Use only the reviewed Fairfold API deployment');
  if (environment.PAYPAL_API_BASE !== 'https://api-m.sandbox.paypal.com')
    throw new AppError('SANDBOX_REQUIRED', 'Only the exact PayPal sandbox origin is allowed');
  if (environment.DEMO_MODE !== 'true')
    throw new AppError(
      'RENDER_DEMO_REQUIRED',
      'Hosted setup requires the existing demo environment',
    );
  let database: URL;
  try {
    database = new URL(environment.DATABASE_URL ?? '');
  } catch {
    throw new AppError('RENDER_DATABASE_REQUIRED', 'Use the existing internal database');
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== RenderSandboxTarget.databaseHost ||
    database.pathname !== '/fairfold' ||
    database.username !== 'fairfold' ||
    !database.password ||
    (database.port !== '' && database.port !== '5432') ||
    database.search ||
    database.hash
  )
    throw new AppError('RENDER_DATABASE_REQUIRED', 'Use the existing internal database');
  try {
    decodeEncryptionKey(environment.APP_ENCRYPTION_KEY ?? '');
  } catch {
    throw new AppError('ENCRYPTION_KEY_REQUIRED', 'Preserve the existing valid encryption key');
  }
  const clientId = environment.PAYPAL_CLIENT_ID;
  const clientSecret = environment.PAYPAL_CLIENT_SECRET;
  if (
    !clientId ||
    !clientSecret ||
    [clientId, clientSecret].some(
      (v) =>
        v.length > 1024 ||
        /\s/.test(v) ||
        [...v].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
    )
  )
    throw new AppError(
      'SANDBOX_CREDENTIALS_INCOMPLETE',
      'Provide both sandbox app credentials privately',
    );
  return {
    mode,
    databaseUrl: environment.DATABASE_URL!,
    encryptionKey: environment.APP_ENCRYPTION_KEY!,
    clientId,
    clientSecret,
  };
}
