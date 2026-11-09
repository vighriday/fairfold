import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { createRuntime } from './runtime.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const runtime = await createRuntime(readConfig());
process.once('SIGINT', () => {
  void runtime.close();
});
process.once('SIGTERM', () => {
  void runtime.close();
});
try {
  await runtime.start(process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1');
} catch (error) {
  runtime.app.log.error(
    { errorType: error instanceof Error ? error.name : 'Error' },
    'API startup failed',
  );
  await runtime.close();
  process.exitCode = 1;
}
