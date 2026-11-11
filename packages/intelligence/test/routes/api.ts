// Builds Hriday's real API (createApi) with the intel plugin, against the test runtime.
import { systemClock } from '@fairfold/contracts';
import { createApi } from '../../../../apps/api/src/app.js';
import { createAuth } from '../../../../apps/api/src/auth.js';
import { readConfig } from '../../../../apps/api/src/config.js';

const SECRET = 'intel-route-test-signing-key-not-a-real-secret';

export async function buildApi() {
  const config = readConfig({
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://unused@127.0.0.1/fairfold_test',
    APP_BASE_URL: 'http://localhost:3000',
    FRONTEND_ORIGIN: 'http://localhost:5173',
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    DEMO_TOKEN_SECRET: SECRET,
    DEMO_MODE: 'true',
  });
  const app = await createApi({ config, checkDatabase: async () => {}, logger: false });
  const auth = createAuth(SECRET, systemClock);
  const as = async (role: 'merchant' | 'buyer', subjectId: string) => ({
    authorization: `Bearer ${await auth.issue({ role, subjectId })}`,
  });
  return { app, as };
}
