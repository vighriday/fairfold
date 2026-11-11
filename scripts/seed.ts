// `pnpm seed`: the deterministic demo world of architecture section 19 (the B17 story), built by
// apps/api/src/seed/world.ts. It makes no PayPal request; every seeded PayPal identifier starts with SEED-, and only
// orders created through checkout are real sandbox orders. With a model key in .env, the closing scan drafts the
// buyer-message template and the store reports name review themes; without one, both use their fixed fallbacks.
import { config } from 'dotenv';
import { createDatabase } from '@fairfold/db';
import { createIntelRuntime, jobsPublisher } from '../packages/intelligence/src/index.js';
import { createJobs } from '../packages/jobs/src/index.js';
import { seedWorld } from '../apps/api/src/seed/world.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; run pnpm setup:local first');
const seedName = process.env.SEED_NAME ?? 'fairfold';
if (seedName !== 'fairfold') throw new Error('Only the documented fairfold seed is supported');

const database = createDatabase(databaseUrl);
const jobs = createJobs(databaseUrl);
try {
  await jobs.start();
  const intelligence = createIntelRuntime({ db: database.db, jobs: jobsPublisher(jobs) });
  const summary = await seedWorld({ db: database.db, now: new Date(), intelligence });
  console.log(
    JSON.stringify({
      ...summary,
      realSandboxIds: false,
      note: 'Synthetic section 19 world. Maya buys through real sandbox checkout; no PayPal request was made.',
    }),
  );
} finally {
  await jobs.stop();
  await database.close();
}
