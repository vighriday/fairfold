# H2.4b unstyled sandbox harness evidence

Date: 9 November 2026 IST. Branch: Hriday. Source: original H2 /dev requirement, F1, O5 and current v6 primary documentation. The page is an unstyled developer harness, not a Figma/product frontend.

Implemented DEMO_MODE-gated /dev and /dev/checkout.js, source merchant/hoodie defaults, public config, clientId-only sandbox v6 initialization, paypal-payments eligibility, one-time session and safe capture JSON output. The session promise returns {orderId: paypalOrderId} and starts before creation resolves. Approval must match the active order. Double clicks are guarded; cancellation and raw SDK errors do not create captures or claim success. Failed approved captures can be checked again with their existing ID while new creation is blocked; no browser storage/secret or new payment rail is used.

Observed checks:

- PASS: 12 focused harness cases using Node VM with synthetic DOM/SDK/HTTP. These execute the actual served JavaScript but do not load the actual PayPal SDK.
- PASS: pnpm test — 173 offline cases, 102 database cases explicitly skipped.
- PASS: pnpm test:db — all 102 real PostgreSQL/HTTP cases pass again after harness registration.
- PASS: pnpm typecheck, pnpm lint and final pnpm format:check.
- SKIPPED: pnpm test:sandbox observed missing PayPal credentials and explicitly reported that no acceptance check passed.
- PASS: actual temporary API processes on loopback 3112, first with DEMO_MODE=true (HTML/JS 200), then false (both 404). Both also verified database/queue readiness, H2/stub health, seven source OpenAPI routes and private-route 401. Processes were stopped afterward; no PayPal call occurred.

The 12 harness cases cover route gating/no-cache/assets; sandbox/client-ID/component/eligibility setup; immediate SDK start and exact two-ID mapping; double-click prevention; same approved-capture retry without another order; cancellation; raw SDK error exclusion; missing setup; ineligibility; approval-ID mismatch; text-only output/later refunded state; wrong internal-order result rejection.

Primary references: [v6 setup](https://developer.paypal.com/sdk/js/set-up/) and [v6 API reference](https://developer.paypal.com/sdk/js/reference/), checked 9 November 2026. The latter’s promise-object requirement was used over an inconsistent migration snippet and is locked by the flow test. No assumption about actual eligibility/popup/SDK execution was promoted to PASS.

The [integration runbook](../checkout-integration.md) now lists exact prerequisites, recovery behavior, Maya payer mapping, real A4/fixture recording gates, full-client incompleteness and Render handoff. The sandbox command reports missing credentials as SKIPPED, never PASS. Full B17 seeding remains H8; no test-world fixture was copied into the development/recording world. H1/H2 are not complete and H3 has not started.
