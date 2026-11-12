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

## Published and deployed preparation

- Implementation **`2ba9753d25d5227f10edfd23fe80ed420ae0bf1e`** was committed and pushed normally to `origin/main`; private-value/protected-path checks PASS and local main synchronized.
- API deploy **`dep-dbr11vbtqb8s739l8r70`** started **2026-11-12T19:18:21Z / 13 November 00:48:21 IST** and became **live at 19:20:04 UTC / 00:50:04 IST**, at exactly that source. Pre-deploy migrations passed at 19:19:19 UTC. Existing API settings, database/key and automatic-deploy-off policy are preserved. No worker source/handler/contract changed; its prior live deploy was retained.
- Hosted `/healthz` reports HTTP 200 and `database: ready`; `/dev` returns HTTP 200. Read-only checkout configuration returns expected **503 `PAYPAL_CREDENTIALS_MISSING`**, confirming activation has not occurred. This configuration endpoint does not call PayPal.
- Direct local execution of the hosted command exited 1 with **`RENDER_SETUP_TARGET`**, before connecting to a database, as expected. The original local setup guard is unchanged.
- Repository formatting PASS. No new resource, key rotation, credential transfer, hosted apply, PayPal request or registration ran. The next step is explicit authorization of the linked activation plan; deployed code alone does not close H2 acceptance.
