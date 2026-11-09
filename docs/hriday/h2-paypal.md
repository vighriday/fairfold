# H2 PayPal client and checkout increments

Sources: original architecture sections 3, 8 F1/F6, 11–12 and 16 H2. D1, D3–D6 and the existing `PayPalClient`, `ForMerchant`, `CaptureResult`, Money and HTTP contracts remain fixed. O15 records the user's instruction to continue locally while H1 hosting is pending. H2 is not complete; A4, real create/capture fixtures and Maya's `/dev` purchase are NOT RUN.

## Increment order

| Increment | Deliverable                                                                                                                        | Current gate                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| H2.1      | Merchant credential lookup/decryption, per-merchant OAuth cache, sandbox-only HTTP transport, bounded retries and sanitized errors | Next local implementation; no endpoint or full `ForMerchant` client claimed                                                   |
| H2.2      | Real Orders create/capture/get/tracking bindings, exact decimal-string totals, refund/reporting helpers and seed-carrier mapping   | Use the unchanged interfaces and current primary API specifications; synthetic parsing tests do not replace recorded fixtures |
| H2.3      | Database-priced checkout creation and capture persistence, exactly-once ledger/job behavior, order reads and auth/ownership        | Resolve Q3 before storing vendor payloads; establish durable retry/reconciliation behavior, never trust browser totals        |
| H2.4      | Numbered endpoints 2–4, 7–8, 30–31 and unstyled `/dev` using sandbox JS SDK v6 with client ID only                                 | Connect source contracts and existing intelligence stubs; no Figma replacement                                                |
| H2.5      | Real sandbox A4, Maya purchase, sanitized recorded create/capture fixtures and deployment integration                              | Requires sandbox merchant/buyer accounts and H1 hosted verification; retain failures honestly                                 |

Each implementation increment has its own task-prefixed commit, tests, typecheck, changelog and evidence. Preserve the source task order; H3 is not started by this exception. Packages owned by Ishaan are unchanged.

## First transport boundary

Implement only inside `packages/paypal`. Merchant records provide client ID and AES-GCM-encrypted secret; decryption uses the existing encryption helper and key. Reject missing or simulated credentials, and reject every base URL except the exact sandbox API origin. Do not follow redirects or arbitrary vendor links with credentials.

Cache OAuth tokens only in process memory per merchant and credential version, using actual `expires_in` and refreshing 60 seconds early. Coalesce simultaneous token requests, clear rejected/rotated credentials, and keep failed refreshes retryable on the next caller. Use the injected clock and injected HTTP/sleep functions in offline tests.

Every application POST requires the existing `PostOpts.requestId`; reuse it and the serialized body across retries. Send `Prefer: return=representation`. Retry HTTP 429 and retry-safe 5xx at most three times with exponential backoff. An unconfirmed mutation must not inherit permission to replay a 5xx or ambiguous network outcome merely because a request ID was present. This preserves Q12; each operation binding must declare whether PayPal documents server idempotency. Log PayPal debug IDs and safe status/symbolic codes on every failed attempt, without request bodies, tokens, credentials, payer data or vendor free-text messages.

This transport is internal groundwork, not a partial object cast to the full `PayPalClient`. Publish `ForMerchant` only when its actual operations are implemented; do not add throwing placeholders or alter shared interfaces to make unfinished work look complete.

## Persistence review still needed

Q3 identifies a conflict between `CaptureResult.raw`/`disputes.raw`/webhook payloads and the original no-email/no-street-address persistence rule. Preserve raw webhook bytes transiently for signature verification. Keep the exact capture contract transient; do not persist its raw object or add real fixtures before joint review.

Prepare the explicit allowlist and mappings at H2.3: required PayPal/Fairfold identifiers, status, seller protection, account status, monetary amounts and item metadata; email only as a SHA-256 hash, street address only as a hash plus country/postal code. Review normalization, retained vendor fields and diagnostic samples with Hriday/Ishaan before implementation. Do not silently rename or remove `raw` from the shared contract. Database writes and real fixture capture remain gated; H2.1 can be tested with clearly synthetic data.

Primary references checked on 9 November 2026: [OAuth authentication](https://developer.paypal.com/api/rest/authentication/), [API request headers and sandbox origin](https://developer.paypal.com/api/rest/requests/), [API responses](https://developer.paypal.com/api/rest/responses/), [idempotency limits](https://developer.paypal.com/api/rest/reference/idempotency/). Operation-specific specs must be checked before H2.2 bindings.
