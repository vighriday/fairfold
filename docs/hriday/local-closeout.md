# Fairfold local completion handoff — 11 November 2026

Branch: exact `Hriday`. Source: the protected submission and architecture originals, indexed in [source-contract.md](source-contract.md). No source document, secret or private inspection output is published.

## Integrated work

Ishaan already merged published Hriday baseline `762c497` in `3f8c436`; his reviewed tip is `d6104af`. The integration preserves that history, his intelligence, fixtures, 18 routes, nine handlers and B17 seed. New Hriday audit fixes were preserved as focused H4–H7 commits, rather than recreating his work.

The combined implementation includes checkout/capture recording, verified webhooks and reconciliation, owner-scoped reads, packing/inspection/sealing, tracking, dispute packs and approval execution, shared-cause actions, retention/watchdog jobs, official SDK MCP transport, the shopper executable and the source B17 world. [Audit evidence](evidence/2026-11-11-audit.md) records the actual checks and remaining limits.

Source scoring/history/default threshold are restored under [Hriday's explicit integration approval](ishaan-integration-review.md). The bounded buyer-note extension is applied under the approved privacy policy. No new table, money representation, payment provider or hosting architecture was introduced.

## Start and inspect

1. Follow the root [README](../../README.md) setup with PostgreSQL 16. Keep `.env` private. Use a distinct loopback `fairfold_*test` database for tests; the integration tests truncate synthetic data.
2. Run typecheck, lint, formatting, offline tests, `pnpm test:db` and `pnpm test:e2e`. The smoke starts the real API and official MCP client, not a mock HTTP server. Tests use injected provider/vendor doubles.
3. Run `pnpm seed` against the intended demo database. It creates synthetic world records and proposals, never executes a PayPal action. Configure an embedding provider for a real provider-backed scan; missing embeddings remain pending. Seed tests use labelled mock vectors only.
4. Run `pnpm dev`. Inspect `/docs` and `/healthz`. Auth uses the documented role/subject pairs through POST `/api/auth/demo-login`; keep returned tokens private. The unstyled `/dev` harness is the backend owner's surface.
5. DEMO_MODE exposes admin-only POST `/api/dev/seed`, merchant-owned courier scan/delivery and adjudication helpers. These routes disappear when demo mode is off. A runbook or seeded proposal is never a human approval.

## Remaining work requiring accounts, assets or human decisions

| Gate                                  | Concrete next action                                                                                                                                                                                                                                | Evidence needed                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Neel and Maya sandbox accounts        | Create the merchant sandbox REST app and separate buyer account; use [sandbox rehearsal](sandbox-rehearsal.md) and `pnpm setup:sandbox`. Enter secrets only in private environment/setup surfaces.                                                  | Actual OAuth and buyer purchase/capture records; A4 and the deferred dispute discovery spike                                                                 |
| Public API and Render                 | Resolve capacity/billing in confirmed My Workspace, or have Ishaan apply the prepared [deployment handoff](ishaan-deployment-handoff.md) in his approved workspace. Use the existing Blueprint, branch Hriday and D18 web/worker/Postgres topology. | Actual deploy IDs/URL, hosted health/docs, worker registration/schedules and database readiness; H1 remains incomplete until verified                        |
| Webhook acceptance                    | Register the real sandbox merchant webhook at the deployed endpoint; run [H3 acceptance](h3-acceptance.md) with real delivery and redelivery.                                                                                                       | Signature verification, exactly-once local projection/jobs and reconciliation evidence; a synthetic verifier is insufficient                                 |
| Real dispute and actions              | Follow [sandbox spike](sandbox-spike.md), approved retention and the H4 guards. Review each exact pack/action row and explicitly approve before execution.                                                                                          | Actual current stage/allowed options, evidence/message/offer/refund response, ledger/result and account-level effect; ambiguous outcomes reconciled manually |
| Q2 return-address contract            | Jointly review the required return address and typed offer/accept-claim inputs with Ishaan.                                                                                                                                                         | Reviewed complete contract before enabling those branches; no fabricated address or OAuth bypass                                                             |
| Models and packing photos             | Configure private provider access; take the source's real photo sets and run the current-default evals.                                                                                                                                             | Actual extraction/vision/embedding results, A6/eval metrics and limitations; synthetic photos/vectors do not satisfy this                                    |
| Figma product frontend                | Supply the approved Figma implementation/export and bind it to the existing OpenAPI/DTOs. The backend, demo harness and integration surfaces are available.                                                                                         | Real merchant/buyer journeys; no invented product design replaces the required Figma frontend                                                                |
| Shopper A13                           | Mint a private agent JWT, run `pnpm --filter shopper-agent start --check`, then the actual shopper with configured models/accounts. Confirm store when required, approve on PayPal and confirm capture separately.                                  | Sanitized actual `docs/agent-run.txt` and verified captured order; no live endpoints or caution-store payment                                                |
| A1–A14, feature freeze and submission | Use [validation](validation.md) and [submission preparation](submission.md), rerun against the deployed branch and record actual results.                                                                                                           | Hosted/account-backed acceptance, final demo/video/Devpost materials and explicit team approval for publication/submission                                   |

No message has been sent to Ishaan and no Devpost/YouTube submission has been made. This document is a reviewable handoff, not an external communication.

## Interpreting failure safely

A missing model can produce fixed descriptive text, but cannot count as a successful provider evaluation. A missing embedding stays unembedded. A changed PayPal stage fails the approved attempt and queues a rebuild; it does not authorize a different action. A claimed/uncertain external operation cannot be blindly replayed. Reconcile authoritative PayPal state before deciding the next approved action.

H4 redaction is bounded controlled-demo handling. It is not a universal PII detector. Approved additional notes have strict roles/leaves and list/text budgets; uncertain contacts or overflow abort the whole sync. Real buyer histories are merchant-scoped, with only a labelled synthetic network tier.

Q9 remains a source narrative conflict: one earlier refund out of two does not trigger the >50% refund rule. The original arithmetic, rather than a desired narrative, determines Alex's reasons.
