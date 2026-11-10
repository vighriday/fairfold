import { config } from 'dotenv';
import { createDatabase } from '../packages/db/src/index.js';
import { inspectCapturedEvent } from '../packages/paypal/src/event-acceptance.js';
import { safeScriptError } from './support/sandbox-environment.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
try {
  const [merchantSlug, eventId, ...extra] = process.argv.slice(2);
  if (!merchantSlug || !eventId || extra.length || !process.env.DATABASE_URL)
    throw new Error('Expected merchant slug, event ID and database configuration');
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    console.log(JSON.stringify(await inspectCapturedEvent(database.db, merchantSlug, eventId)));
  } finally {
    await database.close();
  }
} catch (error) {
  console.error(safeScriptError(error));
  process.exitCode = 1;
}
