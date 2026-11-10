# H3 local closeout

Updated 10 November 2026 IST. **Local implementation ready; real H3 acceptance pending.** Hriday explicitly approved H3 progression and the [event policy](webhook-persistence-review.md). H1 hosting/H2 real purchase acceptance remain independent pending gates. H4 owns the actual dispute synchronizer; this H3 delivery exposes the required callback and reports its absence honestly.

## Delivered and verified locally

| Source obligation        | Implementation and observed local evidence                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seven-event registration | `scripts/register-webhook.ts <merchantSlug>`; exact source path/events, merchant lock, existing-ID preservation and safe failure. Synthetic vendor tests only; actual command unrun                              |
| Endpoint 37              | `/webhooks/paypal/:merchantSlug`, original UTF-8 bytes to merchant-scoped postback, isolated JSON parser, approved nested allowlist, no unverified processing                                                    |
| Q11 ingress durability   | Event plus pg-boss insert in one transaction; failed enqueue rollback; authentic promotion of an unverified ID; concurrent duplicates/one job; committed queue visibility from a new instance                    |
| Event processing         | Per-event lock and processed marker; capture/order/items/buyer/ledger/job all share one transaction; rollback/fresh-handler recovery and real pg-boss delivery                                                   |
| Toolkit capture import   | Authoritative GET only; merchant-owned SKU first, unique exact name only without SKU; catalogue prices/listing snapshots, exact decimal totals, source-orphan IDs and import concurrency                         |
| Refund observation       | Full/partial authoritative capture status; no fulfilment regression; full-refund report refresh; missing relations fail visibly; no capture/refund POST                                                          |
| Dispute handoff          | `resource.dispute_id` then `resource.id`; callback shared by event and poll; absent H4 reports `H4_DISPUTE_SYNC_PENDING` without processed marker                                                                |
| Minute reconciliation    | Independent keyed UTC schedules for real configured merchants; dynamic refresh/removal; all pages, safe overlap, failed-sweep recovery and full-window restart replay                                            |
| Runtime                  | Normal API and worker composition, eight source OpenAPI routes, demo on/off gating and preserved intelligence handler ownership; idle/starting worker close tested                                               |
| Read-only inspection     | `scripts/verify-webhook.ts <merchantSlug> <eventId>` checks verified/processed merchant event, matching capture, exactly one first capture ledger entry, amount and chain; labels real delivery proof separately |

Final observed checks: **302 offline passes**, **180 actual PostgreSQL/HTTP passes across 17 files**, typecheck/lint and normal/rehearsal API startup. The worker CLI started with phase H3, two handlers, intelligence stub, H4 pending and zero configured merchants in the local development database. Synthetic vendor results do not prove any live sandbox behavior. See [runtime evidence](evidence/2026-11-10-h3-runtime.md) and the linked earlier unit evidence.

Delivery is incremental: `67adc20` registration/ingress, `4d97cbc` transactional capture reconciliation, `f9e1d52` polling/schedules, then this worker/acceptance closeout unit. Every unit includes checks, changelog and evidence. No shared schema/DTO/job expansion, intelligence implementation, Figma UI or plan change was introduced.

## Remaining real acceptance and ownership

1. **Hriday/account owner:** create Neel/Maya sandbox accounts and complete H2's [purchase/rehearsal](sandbox-rehearsal.md), including human PayPal approval and verified payer binding. Do not send secrets in chat.
2. **Hriday, or Ishaan only after explicit reassignment:** resolve the existing Render capacity/billing gate and perform the first [deployment](render-deployment.md). The conditional [Ishaan handoff](ishaan-deployment-handoff.md) is prepared and unsent. The worker now references the API's existing APP_ENCRYPTION_KEY; retain the same key and sync/deploy the reviewed configuration. Current JSON Schema validation passes; CLI platform validation is blocked by absent CLI login. No hosted URL or deployment is claimed.
3. **Hriday:** once accounts, public HTTPS and explicit actual-registration authorization exist, run `pnpm exec tsx scripts/register-webhook.ts neel-block-prints` and reconcile uncertain outcomes in the app Dashboard. Automatic approval review rejected executing that mutation during this pass; the command did not run. No real webhook ID was generated or saved.
4. **Hriday:** follow the [real acceptance guide](h3-acceptance.md): observe actual signature SUCCESS and captured event, redeliver the original event twice through PayPal, compare one logical capture/ledger effect, and run `pnpm exec tsx scripts/verify-webhook.ts neel-block-prints <observed-event-id>`. The inspector alone cannot prove provider provenance or redelivery observations. **A5 and real verified capture-event acceptance are NOT RUN.**
5. **Hriday's H4:** implement authoritative dispute synchronization and wire the same callback into event/poll handlers after separate dispute/message/action-response retention review. Q2 return address and the real dispute spike remain pending. H3 stores no raw dispute/message/action response.

## Recovery and limits

An authentic duplicate is verified and acknowledged without another enqueue. It does not revive a job that exhausted its existing three retries. Diagnose the fixed event error and retained pg-boss job, fix the dependency, and use pg-boss's supported redrive for that failed job with the same eventId. Never delete the event, clear a success marker, mark an unverified event trusted or replay a minimized body as a signature fixture. H4 sync must remain idempotent when retried across transactions.

Poll watermarks are volatile by design: restart replays the client-supported 180-day window, and successful sweeps overlap by two minutes. The local budget is 100 pages of 50 items; failure/exhaustion retains the safe window. This does not establish measured vendor latency or guarantee visibility beyond PayPal's supported history. See O28.

Unknown imports deliberately reject ambiguous/missing products, price/currency/quantity conflicts, multiple purchase units/captures, unsupported invoice syntax and contradictory merchant IDs. A refund without retained related IDs cannot be guessed from its refund ID; its actual shape still needs the real run. Reversal events retain `REVERSAL_REQUIRES_REVIEW` without an invented order-state transition. These are visible guards, not fabricated success or changes to PayPal's role.

**Next source task is H4. Five implementation tasks remain (H4–H8), alongside the explicitly pending real H1–H3 acceptance gates.**
