import { z } from 'zod';
import { decodeEncryptionKey } from '@fairfold/contracts';

const EnvironmentSchema = z.object({
  DATABASE_URL: z.url(),
  APP_BASE_URL: z.url(),
  FRONTEND_ORIGIN: z.url(),
  APP_ENCRYPTION_KEY: z.string().min(1),
  DEMO_TOKEN_SECRET: z.string().min(32),
  PAYPAL_API_BASE: z
    .literal('https://api-m.sandbox.paypal.com')
    .default('https://api-m.sandbox.paypal.com'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      'Invalid configuration: ' +
        parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  const env = parsed.data;
  decodeEncryptionKey(env.APP_ENCRYPTION_KEY);
  return {
    databaseUrl: env.DATABASE_URL,
    appBaseUrl: env.APP_BASE_URL,
    frontendOrigin: env.FRONTEND_ORIGIN,
    encryptionKey: env.APP_ENCRYPTION_KEY,
    demoTokenSecret: env.DEMO_TOKEN_SECRET,
    paypalApiBase: env.PAYPAL_API_BASE,
    demoMode: env.DEMO_MODE === 'true',
    port: env.PORT,
  };
}
export type Config = ReturnType<typeof readConfig>;
