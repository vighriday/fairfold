import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url), quiet: true });
if (
  process.env.PAYPAL_API_BASE &&
  process.env.PAYPAL_API_BASE !== 'https://api-m.sandbox.paypal.com'
)
  throw new Error('Only sandbox tests are permitted');
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.log(
    'SKIPPED: PayPal sandbox credentials are absent. No PayPal acceptance check has passed.',
  );
} else {
  console.error(
    'NOT RUN: Real A4/Maya checkout and recorded sandbox fixtures have not been verified. Follow docs/hriday/checkout-integration.md; local HTTP/VM tests are not PayPal acceptance.',
  );
  process.exitCode = 1;
}
