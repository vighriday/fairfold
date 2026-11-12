# Hosted PayPal setup preparation

13 November 2026 IST. Working tree based on main `24abdf6`; the user requested the next integration step after showing Business/Personal sandbox accounts, then supplied Client ID, Secret and buyer-reference email privately in ignored `.env`. No values were displayed or copied into a tracked file.

## Implementation and observed checks

- Added `pnpm setup:sandbox:render check` and explicit `apply --confirm-service srv-dbr099on74is73b3i420`. The separate Render boundary pins the existing API/main/repository/origin and exact internal database/user/name, validates the preserved encryption key and enforces sandbox/demo mode. Preview, unrelated host/service, live PayPal, query overrides and incomplete credentials are refused before connecting.
- Reused the existing encrypted/idempotent source merchant/product transaction and read-only readiness checker. No schema, shared REST/job contract, public credential endpoint, provider or frontend change. No buyer mapping, seed/reset, key rotation, webhook registration or PayPal call occurs in the setup command.
- **44 focused tests PASS** across the new hosted-boundary tests, unchanged local operator tests and actual isolated PostgreSQL setup-preservation tests. Real PayPal/model keys were removed from the test child environment; the tests used synthetic credentials only.
- **Build/typecheck and lint PASS**. Lint initially rejected a control-character regex; replaced it with explicit character-code validation and reran the 44 checks plus build/lint successfully. Documentation integrity PASS with 182 local references, 16 SVGs and both unchanged seven-capture sets.
- Authenticated Render inspection confirmed the expected internal database host, `/fairfold`, user `fairfold`, no query parameters and external allow-list `[]`. Sensitive connection values stayed in process memory; only non-secret metadata was output. No database networking/configuration changed.
- `.env` is ignored. Account screenshot/field presence is prerequisite evidence, not OAuth, permissions, ownership, capture or signature evidence.

## Actual request gate

Automatic approval review rejected the proposed `packages/paypal` OAuth plus read-only webhook-list check **before execution**, stating that local credentials would make an actual PayPal request prohibited by the current `AGENTS.md`. No workaround, indirect call or retry was used. No PayPal request occurred.

The [concrete activation plan](../hosted-paypal-setup.md) specifies sandbox authentication/read-only capability checks, individual-key temporary credential transfer, one bounded private setup job and cleanup, existing read-only worker polling, and explicit seven-event webhook registration. This scope needs user authorization. It does not authorize a purchase/capture, tracking push, evidence, message, offer, refund, adjudication or return-address operation.

Credential transfer/apply, actual OAuth, webhook registration and real checkout remain **NOT RUN**. The implementation can be deployed without activating credentials; record its actual deploy separately. Full PayPal/provider/photo/A1–A14 acceptance remains pending.
