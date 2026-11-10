# H4 — Disputes and approved evidence actions

Status: **IN PROGRESS; POLICY APPROVED**, 10 November 2026 IST. H3 local code is ready. Pure current-state/options guards, the approved dispute retention/redaction boundary, the default merchant-scoped authoritative synchronizer, endpoints 17/18 and endpoint 21 approval are implemented; PostgreSQL sync/API/approval cases and worker/event regressions passed with typecheck/lint. Evidence execution and real account-backed evidence remain pending. Hriday approved the [concrete Q3/Q4 policy](dispute-persistence-review.md); implement the remaining H4 sequence under its exact boundary. No real account-backed fixture exists, and none will be fabricated.

## Delivery sequence

1. Review the proposed retained fields, free-text boundary and existing-field amount adapter. In parallel, implement pure stage/options/approval validation with labelled synthetic inputs; this invokes no vendor and writes no dispute data.
2. **Implemented and database-verified locally:** one authoritative merchant-scoped `disputes.get` synchronizer for both H3 callbacks. It locks/upserts the dispute, joins seller_transaction_id to the receiving merchant's capture with the source exact invoice-number fallback, appends first-seen/resolution ledger effects, and publishes exact `dispute.synced` atomically. Approved redaction and durable fingerprints prevent duplicate buyer complaint text. See [sync evidence](evidence/2026-11-10-h4-sync.md).
3. **Implemented and database-verified locally:** endpoints 17/18 with SQL ownership and bounded pagination, safe dispute/order/pack projections. The source `DisputeRow` and detail envelope are preserved without exposing raw vendor mirrors or adding Figma UI.
4. **Implemented and database-verified locally:** endpoint 21 verifies merchant/pack/dispute ownership and current draft state, enforces inspect_first/merchant_decides rules, freezes approved edits under Q4, writes approval identity/time and enqueues evidence.submit in one transaction. Concurrent approvals are serialized by row locks; non-draft retries are rejected.
5. Implement evidence.submit: claim only an approved pack, load its immutable blob hashes, re-fetch the dispute, verify source stage and current allowed action/options, then invoke the existing low-level client. A failed guard yields STAGE_CHANGED and evidence.rebuild without a vendor mutation. A 422 marks failed and raises evidence_submit_failed. Uncertain outcomes are recorded for read-only reconciliation, never blindly replayed; no HTTP/database transaction can make a vendor mutation exactly once by itself.
6. Add the source Agent Toolkit-style provide_dispute_evidence tool with exactly dispute_id/evidences/files parameters. Bind merchant context privately and require an exact already-approved pack/evidence/file-hash match; use the same approved executor/job path. The tool must not turn an agent request into human approval.
7. Add the demo-only, merchant-owned adjudication route. Do not run it automatically. Keep sandboxRequireEvidence and the stage-rehearsal uncertainty explicit: current provider docs say it changes response status, not necessarily lifecycle stage (Q13).
8. Wire normal API/worker, finish the integration/human runbook and publish focused commits with checks and changelog. Keep real H4 acceptance pending until actual A12 and the specified offer/stage rehearsal pass.

The six low-level action bindings, binary multipart transport and complete ForMerchant already exist from H2. Reuse them. Do not reimplement those clients, build an AI draft pipeline, edit Ishaan-owned code or silently fix Q2 by inventing a return address.

## Verification and remaining owner work

| Area        | Local completion evidence                                                                                                                       | Real dependency                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sync        | Current-detail validation, merchant mapping, new message/outcome dedupe, concurrent webhook/poll, transaction rollback and H3 callback recovery | Actual spike JSON and real detail/message shapes                    |
| Approval    | Owner-only list/detail/approve, explicit edited parameters, 409 guard cases, duplicate/conflicting approval and atomic queue                    | Merchant's actual approval in the integrated flow                   |
| Execution   | Exact method/body/files/request ID, immutable bytes, fresh stage/options, no duplicate POST, 422/unknown outcome and safe retained result       | Actual evidence/offer acceptance and eligibility                    |
| Tool/dev    | Merchant-bound approved-only tool, base64/hash matching, demo/ownership guard, no approval bypass                                               | Actual authorized demo action                                       |
| Integration | Normal startup/shutdown, source routes/OpenAPI, existing regression suites, typecheck/lint/format and documented handoff                        | A12 after fulfilment/tracking facilities and sandbox purchase exist |

H1–H3 real PayPal/Render gates stay pending. H4's retention/mapping review is the immediate user input; Q2 shared return-address review and real spike/action execution remain separate team work. No messages are sent to Ishaan.
