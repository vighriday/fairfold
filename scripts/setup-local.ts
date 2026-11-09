import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(target)) {
  console.log('Existing .env retained; no values overwritten.');
} else {
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const contents = template
    .replace(/^APP_ENCRYPTION_KEY=$/m, 'APP_ENCRYPTION_KEY=' + randomBytes(32).toString('base64'))
    .replace(/^DEMO_TOKEN_SECRET=$/m, 'DEMO_TOKEN_SECRET=' + randomBytes(32).toString('base64'));
  writeFileSync(target, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log(
    'Created ignored .env with random local keys. PayPal and model credentials remain empty.',
  );
}
