# H3 acceptance and human handoff

Status: **REAL ACCEPTANCE NOT RUN**, 10 November 2026 IST. H3 and the event policy are approved. Local registration, ingress, reconciliation, polling, runtime and read-only inspection are implemented; see the [closeout](h3-closeout.md). The real-run steps below remain unexecuted. Follow the [implementation plan](h3-webhooks.md) and [approved event policy](webhook-persistence-review.md).

## What Hriday needs to supply

1. Create the real Neel merchant sandbox REST app and Maya personal sandbox account. Use the existing [H2 rehearsal](sandbox-rehearsal.md) to store credentials locally/encrypted and verify setup; never paste secrets into chat, documents or Git.
2. Make the first existing-architecture Render deployment available, or explicitly assign the prepared [deployment handoff](ishaan-deployment-handoff.md) to Ishaan. The handoff is currently unsent. Use the actual HTTPS API origin; no invented URL, free-plan substitution or card entry is authorized.
3. The event retention policy and H3 phase exception are already approved; do not request them again. H4 dispute/message/action retention is separate. Later, jointly review the return-address contract (Q2) and bind Maya's verified payer ID before private buyer-history acceptance.
4. Complete the real buyer approval/purchase in PayPal. Neither a saved research instruction nor running a setup command is approval for a financial/dispute action.

## Registration rehearsal after implementation

- Check the exact `Hriday` revision, database connectivity, normal API/worker health and the source merchant's non-simulated status. Confirm the public endpoint path and the app's sandbox identity before registration.
- Inspect the merchant's current `paypal_webhook_id` and the corresponding app's Dashboard webhooks. A stored ID must not cause a second registration. If a previous attempt timed out or returned an ID that was not saved, reconcile the existing Dashboard registration first; an empty local column alone does not prove no remote registration exists.
- Run `pnpm exec tsx scripts/register-webhook.ts <merchantSlug>` only when credentials and hosting are ready. Confirm the actual returned ID was saved on that same merchant and all seven source events target the exact public URL. Do not use `*`, a simulator webhook ID or another app's registration.
- If the vendor call fails ambiguously, stop automatic retries. Record only a fixed error code, operation/time and safe IDs; inspect the app's existing registrations before another mutation. If the database write fails after a known response, preserve the returned ID privately for reconciliation.

## Real capture and A5

1. Complete H2's actual `/dev` purchase with Maya and record the real Fairfold order ID, PayPal order/capture IDs and actual UTC times privately. Verify the approved capture fields and ledger as in H2; retain no raw buyer contact/address values.
2. Observe the actual `PAYMENT.CAPTURE.COMPLETED` delivery in the merchant app's webhook Dashboard. Confirm signature postback returned `SUCCESS` for the stored merchant webhook ID. A synthetic test returning `true`, a simulator delivery or a manually inserted database row does not meet this step.
3. Run `pnpm exec tsx scripts/verify-webhook.ts <merchantSlug> <observed-event-id>` for read-only local state inspection; it deliberately leaves real-delivery/redelivery proof to operator observation. Read the matching `paypal_events` row's ID/type, merchant ID, `verified`, `received_at`, `processed_at` and fixed error only. Check `verified = true`, the correct merchant, successful processing and the expected order/capture link. Do not dump `payload`, headers or vendor bodies into terminal logs/evidence.
4. Redeliver that same actual event twice through PayPal. Record the observed delivery attempts/statuses/times. Check one verified row with that actual event ID, one logical capture effect, one captured ledger entry and no duplicated order/items. Queue delivery is at least once; repeat read-only GET calls after a crash do not establish duplicate payment effects.
5. Compare order and ledger state before/after redelivery. A row count alone does not prove the handler completed once; a 200 duplicate alone does not prove its first transaction queued work. Keep the local atomic-enqueue/restart tests alongside this real evidence.
6. Recheck the ledger hash chain and owner-scoped order response. Publish only a sanitized evidence summary and its commit/deployment revision. Actual transaction IDs can remain in ignored local evidence; public fixtures must pass their separate audit.

## Additional reconciliation checks

| Case                             | Required observation                                                                                                       | Boundary                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Toolkit order unknown locally    | Human-approved sandbox capture imports one merchant-owned order and matched catalogue items; replay is idempotent          | H7 later supplies the real agent; synthetic H3 import tests are local evidence only |
| Missing SKU                      | Exact name matches one product in the receiving merchant; ambiguous/missing names fail visibly                             | Never match a product owned by another merchant or guess the first result           |
| Known order / late capture event | Existing capture remains unchanged; sealed/shipped/delivered/refunded status is not regressed                              | No capture POST in the event worker                                                 |
| Partial/full refund              | Read-only reconciliation distinguishes partial from fully refunded capture state; duplicates have no second logical effect | A refund must first be separately human-approved through its documented workflow    |
| Bad signature                    | No processing job/effect; only the proposed minimal unverified record if the envelope is valid                             | Never bypass verification to make simulator testing pass                            |
| Verification provider failure    | Retryable failure, no trusted row/job; eventual authentic redelivery can succeed                                           | Do not mark the event invalid merely because the provider was unavailable           |
| Dispute webhook / polling        | Same H4 synchronizer receives the actual ID, authoritative detail GET and idempotent result                                | Pending H4 cannot be represented as a successful no-op                              |
| Poll page failure/restart        | Complete retry from a safe overlapping cursor; no skipped merchant/page/update                                             | A cursor is not advanced after a partially successful sweep                         |

For refund, reversal and dispute cases, record observed provider behavior and lifecycle separately. Do not infer PayPal's decision, invent a reversal-to-order mapping or execute evidence/offers/messages as part of a read-only H3 check.

## Evidence record and completion rule

Use the existing [evidence template](evidence/README.md). Record revision, actual public URL, sandbox app/merchant linkage confirmation without secrets, event type, operation timestamps, verification result, duplicate delivery counts, logical row/ledger effects and any fixed error. Record **PASS**, **FAIL**, **BLOCKED** or **NOT RUN** per observation. A pending or failed check retains its reason and next owner/action; do not replace it with an expected value.

H3 is complete only when its specified local checks, typecheck and real A5/verified capture-event acceptance pass. H1/H2 remain formally pending until their own independent hosted/account-backed checks pass. Current state: all real H3 acceptance **NOT RUN**; no actual webhook registration, signature result, refund or dispute has been observed.
