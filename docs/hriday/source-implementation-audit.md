# Hriday source-to-implementation audit

Audit baseline: `e49240c` on `Hriday`, with the route-registration correction in
the commit that adds this document. The authoritative inputs were the protected
architecture and submission DOCX files, `source-contract.md`,
`contracts-handoff.md`, `execution-plan.md`, `validation.md`, and the current
tracked implementation. The protected DOCX SHA-256 values still match the
recorded source contract. No file under `docs/internal/` was changed or staged.

## Executive result

Hriday's local platform implementation is substantial and runnable, but the
project is not end-to-end complete against the source definition of done.
The branch has a real API/worker/database/queue/ledger/PayPal boundary and
meaningful local tests. It does not yet have the external evidence that the
architecture explicitly requires, and Ishaan's intelligence implementation and
Figma's frontend are not present on this branch.

| Area                         | Audited result                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Branch and source protection | PASS: exact `Hriday`; protected originals untouched                                      |
| Database model               | 25/25 source tables represented in Drizzle and migration                                 |
| Local runtime                | PASS: API, worker, PostgreSQL, `/healthz`, `/docs`, MCP smoke                            |
| Hriday-owned platform        | SUBSTANTIALLY IMPLEMENTED locally; external acceptance pending                           |
| Intelligence-owned work      | NOT IMPLEMENTED here; labelled stubs remain                                              |
| Figma frontend               | NOT PRESENT; outside Hriday ownership                                                    |
| Render                       | Blueprint prepared; no Fairfold services or database deployed                            |
| PayPal                       | Sandbox-only boundary implemented; no real account, capture, webhook or dispute evidence |
| A1-A14                       | A7 library tamper case PASS; all other acceptance evidence NOT RUN                       |

## H1-H8 status matrix

The source's “Done when” clauses are treated as gates, not suggestions. “Local
ready” therefore does not mean the H task is formally complete.

| Phase           | Local implementation found                                                                                                                                                                                            | Verification found                                                             | Source gate result                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| H1 Foundation   | Workspace, strict TypeScript, contracts, 25-table schema, migration, jobs wrapper, ledger/blob store, Fastify/auth/OpenAPI, worker bootstrap and Render blueprint                                                     | Offline, PostgreSQL/HTTP, typecheck, lint/format and runtime smoke pass        | **PARTIAL / HOSTED BLOCKED**: first Render deployment and hosted `/docs` are absent                |
| H2 Checkout     | Sandbox-only client, encrypted merchant credentials, token cache, retry/error handling, order/capture/tracking/refund/reporting bindings, checkout routes and `/dev` harness                                          | Recorded-response parsing, local API tests, rehearsal and read-only audit pass | **LOCAL READY / A4 NOT RUN**: no real Maya purchase/capture or Q2 return-address review            |
| H3 Webhooks     | Raw-body verification, merchant webhook registration, durable event row, dedupe/recovery, reconciliation, refund handling, polling schedules and worker integration                                                   | 302 offline and 180 PostgreSQL/HTTP checks; worker startup pass                | **LOCAL READY / A5 NOT RUN**: no real verified delivery/redelivery                                 |
| H4 Disputes     | Dispute projections, evidence-pack state, approval identity/ownership, stage guards, multipart evidence, execution worker, idempotency, ledger/result persistence and demo-only adjudication                          | Local dispute/action integration coverage and type/lint checks                 | **LOCAL READY / A9-A10/A12 NOT RUN**: no real dispute fixture or PayPal action response            |
| H5 Pack Station | Photo limits and MIME checks, EXIF freshness, normalized content-addressed blobs, attestations boundary, blockers, overrides, inventory locking, sealing, tracking queue, retention and shared-cause action execution | Packing, inspection, tracking, retention and action tests                      | **LOCAL CORE READY**: real attestation, tracking/refund behavior and A6/A11 remain unavailable     |
| H6 Watchdog     | 15-minute sweep, 72-hour tracking/seal thresholds, 48-hour dispute deadline, deduplicated alerts, acknowledgement and DEMO_MODE scan/delivery routes                                                                  | Watchdog and runtime tests                                                     | **LOCAL READY / ACCEPTANCE PENDING**: no hosted observation                                        |
| H7 MCP/shopper  | Authenticated JSON-RPC boundary, role/ownership checks, four tools, injected shopper transport, strict result/error parsing and human approval pause                                                                  | MCP HTTP and shopper route-boundary tests                                      | **LOCAL READY / A13 NOT RUN**: intelligence provider and real sandbox capture absent               |
| H8 Seed/deploy  | Idempotent simulated catalogue seed, explicit `SEED-`/no-PayPal behavior, README and runtime smoke harness                                                                                                            | Seed and local smoke checks                                                    | **PARTIAL**: seed is not the B17 world, Ishaan fixtures/evals are absent, Render deployment absent |

## API contract reconciliation

The handoff specifies 42 numbered endpoints. The current source registers 16
Hriday-owned functional surfaces locally, but two dispute surfaces use a
merchant-prefixed path rather than the authoritative canonical path.

### Exact canonical routes present

`1, 2, 3, 4, 7, 8, 15, 16, 17, 30, 31, 37, 38, 39`.

These cover demo auth, checkout, merchant/buyer order reads, alert reads and
acknowledgement, merchant dispute listing, webhook ingress, MCP, and inspection
photo intake.

### Functional route with canonical-path mismatch

| Contract                                          | Current path                                                   | Assessment                              |
| ------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| 18 `GET /api/disputes/:id`                        | `GET /api/merchant/disputes/:id`                               | Implemented behavior, contract mismatch |
| 21 `POST /api/disputes/:id/packs/:packId/approve` | `POST /api/merchant/disputes/:disputeId/packs/:packId/approve` | Implemented behavior, contract mismatch |

The mismatch is not counted as exact contract coverage. It should be resolved
with a reviewed compatibility decision before frontend integration.

### Missing canonical routes

The following source contracts are not registered on this branch:

`5, 6, 9, 10, 11, 12, 13, 14, 19, 20, 22, 23, 24, 26, 27, 28, 29, 32, 33,
34, 35, 36, 40, 41, 42`.

Most are explicitly Ishaan-owned intelligence, buyer, review, complaint,
shared-cause, message and store-report surfaces. The absence is therefore a
real integration gap, not evidence that Hriday should implement them.

The demo-only routes are present and DEMO_MODE-gated. `/healthz` and `/docs`
are present. The corrected H5 inspection and shared-cause approval routes are
now registered during application startup rather than from inside another
request handler.

## Job and worker reconciliation

All 16 source job names have Zod payload definitions in
`packages/contracts/src/jobs.ts`. The worker currently owns and registers:

`paypal.event`, `disputes.poll`, `evidence.submit`, `tracking.push`,
`action.approved`, `retention.sweep`, and `watchdog.sweep`.

The remaining nine handlers are absent from the current intelligence map:

`order.captured`, `pack.photos_uploaded`, `dispute.synced`,
`evidence.rebuild`, `complaint.created`, `sharedcause.scan`,
`sharedcause.sweep`, `inspection.uploaded`, and `storereport.refresh`.

This is consistent with the explicit H1 boundary: `packages/intelligence` and
`packages/ai` remain labelled stubs and are Ishaan-owned after handoff. It is
nevertheless a deployment blocker for the full system and must not be reported
as complete.

## Data model and persistence checks

- The Drizzle schema exports all 25 source tables: merchants, buyers, products,
  inventory batches, orders, order items, shipments, evidence blobs, ledger
  entries, inspection rules, alerts, PayPal events, disputes, attestations,
  evidence packs, buyer signals, signal contests, simulated buyer network,
  reviews, store reports, complaint clusters, complaints, hypotheses, actions
  and messages.
- Money uses decimal database values and the implementation's API contracts
  use decimal strings where required.
- Evidence bytes are content-addressed and retention purges bytes without
  discarding the hash row.
- Ledger append/verify and the direct-payload tamper case are implemented and
  tested. The public deployed A7 endpoint observation remains pending.
- Raw webhook bytes are verified before durable processing; unverified events
  are not dispatched.
- The repository contains no committed internal source copy or secret.

## Acceptance evidence matrix

| ID  | Current truth                                                            |
| --- | ------------------------------------------------------------------------ |
| A1  | NOT RUN: B17/Ishaan shared-cause seed absent                             |
| A2  | NOT RUN: Ishaan statistical fixture absent                               |
| A3  | NOT RUN: Ishaan null fixture absent                                      |
| A4  | NOT RUN: no sandbox account/capture                                      |
| A5  | NOT RUN: no real verified webhook/redelivery                             |
| A6  | NOT RUN: no real attestation/tracking path                               |
| A7  | **PASS at library level only**; deployed HTTP/Render observation pending |
| A8  | NOT RUN: buyer-signal fixtures/implementation absent                     |
| A9  | NOT RUN: no real Maya dispute                                            |
| A10 | NOT RUN: no real inspection/action response                              |
| A11 | NOT RUN: B17 hold population absent                                      |
| A12 | NOT RUN: no separate delivered INR dispute                               |
| A13 | NOT RUN: no real provider/sandbox shopper capture                        |
| A14 | NOT RUN: store-report implementation/fixtures absent                     |

The local runtime smoke is a useful wiring check, not A1-A14 evidence. It
intentionally reports A1-A14 as NOT RUN and made zero PayPal requests.

## Ownership and next gates

### Hriday-owned remaining work

1. Deploy the approved Render blueprint only after capacity/billing and account
   authorization are available; record actual service, database and `/docs`
   observations.
2. Resolve the two canonical dispute route path mismatches through the shared
   contract review.
3. Run real A4/A5 and the real PayPal portions of A9-A13 when sandbox accounts
   exist. Keep all credential-dependent checks explicitly pending meanwhile.
4. Re-run the full acceptance sequence against the deployed commit, including
   the real webhook redelivery and separate A12 case.

### Ishaan-owned remaining work

Replace the labelled stubs with `packages/ai`, `packages/intelligence`,
intelligence routes, handlers, fixtures and measured evals. This includes the
B17 seed-side intelligence world, A1-A3, A8 and A14, plus the intelligence
portions of A6 and A9-A11.

### Figma-owned remaining work

The Figma-built frontend is not present on this branch. It must consume the
reviewed REST/OpenAPI contracts and must not call PayPal REST directly.

## Audit conclusion

The implementation is not shallow scaffolding: the local Hriday-owned
platform has meaningful persistence, concurrency, integrity, approval and
vendor-boundary behavior. It is also not a complete hackathon build. The
honest overall status is **substantive local platform, external acceptance
blocked, intelligence/frontend integration incomplete**.
