# Q3 webhook persistence proposal

Status: **PROPOSED; NOT APPROVED** on 10 November 2026 IST. The earlier capture approval does not authorize this boundary. This proposal covers H3's `paypal_events` only. `disputes.raw`, buyer message text, action responses and evidence remain a separate H4 review.

Architecture section 8 F4 requires original bytes for verification, a durable event and `paypal.event { eventId }`; section 12 prohibits plaintext email/street retention and requires unverified events to be ignored. The original documents were reread for H3 (architecture paragraphs 278–279, 295, 809, 812, 818 and 1077–1082). No shared column, DTO or job payload changes are proposed.

## Exact retained fields

| Destination                 | Proposed allowlist                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paypal_events` columns     | Actual event ID, explicit event type, resource type/ID, receiving merchant UUID, verified boolean, injected-clock received/processed UTC timestamps and fixed symbolic error code only |
| Verified `payload` envelope | `id`, `event_type`, optional `create_time`, `resource_type`, `event_version`, `resource_version`; no other envelope fields                                                             |
| Verified `payload.resource` | Optional `id`, `dispute_id`, `status`, `amount { currency_code, value }`, `supplementary_data.related_ids { order_id, capture_id }`; no other resource fields                          |
| Unverified `payload`        | Claimed `id` and `event_type` only. Resource columns remain null. No job is published and `processed_at` remains null                                                                  |
| Jobs                        | Existing `paypal.event { eventId }` and `disputes.poll { merchantId }` only                                                                                                            |
| Logs/errors                 | Fixed codes and internal identifiers when necessary; no raw headers/body, vendor descriptions, token, contact/address or buyer message                                                 |

Identifiers use bounded ASCII resource patterns; money uses the existing decimal-string schema, and timestamps must parse as RFC3339 and normalize to UTC. Optional values are copied only when individually valid. Required event ID/type and a resource object are mandatory for verified processing; a malformed signed event fails visibly without a processing job. Unknown fields are dropped, including nested additions. There is no generic recursive “redact a few keys” fallback.

Original UTF-8 bytes, signature headers and the complete event exist in memory only until signature postback and mapping finish. Their exact formatting is preserved for verification. Persisting the minimized `payload` does not claim that it can be reverified later; a real replay must redeliver the original event through PayPal. Saved summaries/fixtures must be synthetic or separately audited; this proposal authorizes no raw fixture or response logging.

## Durable and trust boundary

Only exact provider `SUCCESS` permits the verified insert and queue publication. Provider/network failure returns a retryable failure without trusting the event. A definite verification failure may retain the minimal untrusted envelope with `verified = false`, as section 12 requires, and returns an error; it never queues or processes the event.

The verified event row and pg-boss insert must commit in the same PostgreSQL transaction using the existing checked-out connection adapter. An enqueue failure rolls back the event. A duplicate already-verified event returns 200 without a second job. A later verified delivery may promote a prior unverified row with that ID; an unauthenticated request must never reserve an ID and suppress the authentic delivery. An unverified redelivery cannot modify an already-verified event. A verified ID already owned by another merchant is rejected without overwriting it.

Worker handling locks each event row and rechecks `verified`/`processed_at`. Capture reconciliation is idempotent and uses the approved capture store. Processing success alone sets `processed_at`; a failure leaves it unset and records a fixed code. Retries may repeat read-only vendor calls, but cannot manufacture a payment, repeat a capture POST, duplicate capture ledger/job effects, or declare a missing H4 dispute synchronizer successful.

## Scope of approval

Approval permits implementation of the above H3 event storage boundary, including synthetic PostgreSQL recovery tests. It does not approve evidence, refunds, offers, messages, raw dispute persistence, partner onboarding, billing or production calls. Capture imports reuse the existing approved capture policy. H3's real A5 and signed capture-event acceptance still require the sandbox account and hosted endpoint.
