# H2 PayPal client and checkout increments

Sources: original architecture sections 3, 8 F1/F6, 11–12 and 16 H2. D1, D3–D6 and the existing `PayPalClient`, `ForMerchant`, `CaptureResult`, Money and HTTP contracts remain fixed. O15 records the user's instruction to continue locally while H1 hosting is pending. H2.1's transport is implemented and locally verified; H2 is not complete. A4, real create/capture fixtures and Maya's `/dev` purchase are NOT RUN.

## Increment order

| Increment | Deliverable                                                                                                                        | Current gate                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| H2.1      | Merchant credential lookup/decryption, per-merchant OAuth cache, sandbox-only HTTP transport, bounded retries and sanitized errors | IMPLEMENTED AND LOCALLY VERIFIED; no endpoint or full `ForMerchant` client claimed                                            |
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

## H2.1 implementation and verification

`packages/paypal` exports `databaseCredentials(db)` and `createMerchantTransportFactory(options)`. The provider reads only the selected merchant's client ID, encrypted secret and simulation flag. The factory takes the existing decoded encryption key and a logger. It performs credential lookup for each request, decrypts inside this package, keeps per-merchant/version tokens only in memory, and notices credential rotation/removal even through an existing transport. Tokens refresh 60 seconds early; simultaneous grants are coalesced. A rejected resource token is cleared without automatically replaying the failed request.

The transport permits only the exact sandbox API origin and relative `/v1/` or `/v2/` resource paths, rejects redirects, and applies a 15-second timeout per HTTP attempt. GETs retry 429/5xx; POSTs require PostOpts and a declared `retrySafe` value. POST 429 responses can retry; 5xx replay requires documented operation idempotency. There are at most three retries with 500/1,000/2,000 ms backoff and unchanged body/request ID. Ambiguous network failures and malformed successful responses are not replayed. `PayPalError.outcomeUnknown` keeps ambiguity visible for the future operation/reconciliation layer.

Diagnostics contain merchant ID, phase/method, attempt, upstream status, validated debug ID and bounded symbolic error codes. Vendor descriptions, request/response bodies, tokens, credentials and payer fields are excluded. The shared contracts and existing API/worker are unchanged; no operation binding or complete `ForMerchant` client is exported yet.

The [verification record](evidence/2026-11-09-h2-transport.md) records 49 offline passes, 17 isolated PostgreSQL integration passes, typecheck/lint/formatting and the dependency-install observations. All vendor responses are labelled synthetic; no PayPal request or persistent buyer payload was used. H2.2 is the next increment.

## H2.2a Orders bindings

`createOrderOperations(transport)` now implements the unchanged order create/capture/get method types. Tracking is the next sub-increment, so this currently returns that exact three-method subset rather than claiming a complete PayPalClient/ForMerchant.

Create builds one CAPTURE purchase unit with the source reference/custom/invoice IDs, string quantities and an exact item-total breakdown. Arithmetic uses BigInt hundredths and checks the existing numeric(12,2) range. Wire amounts normalize to two decimals, or integral values for HUF/JPY/TWD; nonzero fractions in integral currencies, mixed/unsupported currencies, invalid quantities and invalid shipping fields fail before credential lookup. An approval link must be a GET link on the sandbox PayPal web origin.

Capture maps the actual capture's status and seller protection, wallet account status, modern account identity with legacy payer fallback, and the exact shared shipping fields. Absent/empty optional fields remain null; multiple purchase units/captures and conflicting payer IDs require reconciliation rather than an invented singular result. `raw` is retained only in the transient return object. The shared shipping type omits address_line_2 while raw includes it: Q3's future address-hash review must account for all necessary address components without silently changing the contract.

`requestValidated` reports malformed response shapes with actual debug-ID/status metadata and never retries a potentially completed mutation because parsing failed. Order GET validates identity and returns the transient vendor object; vendor HATEOAS links are not followed. [Orders evidence](evidence/2026-11-09-h2-orders.md) records 83 offline passes and the current official schema digest. Real sandbox fixtures and A4 remain NOT RUN.

## H2.2b Tracking and carrier mapping

`createOrderOperations` now returns the complete existing Orders method group, including `addTracking`; it still does not claim the whole PayPalClient/ForMerchant. Tracking sends capture_id, tracking_number, carrier, optional carrier_name_other and the explicit notify_payer value as a flat object. It sends the source request ID but does not automatically replay 5xx because the current tracking operation does not document that idempotency header. The future H5 job must reconcile an ambiguous outcome before repeating a notification-producing call.

The returned tracker must exist in the actual response for the expected order. A matching captureId-trackingNumber ID is selected among older trackers, as illustrated in the official response examples; a unique opaque returned ID is also accepted. Missing or ambiguous IDs fail rather than being invented. The format remains subject to actual sandbox observation.

The source carrier map handles DHL, FedEx, UPS, India Post, Delhivery and Blue Dart. `carriers.toDisputeCarrier` keeps the existing one-string interface. For a shipment tracked as OTHER, its caller passes the actual stored carrier_name_other value; bare OTHER fails. Known names map to the verified disputes enum; an explicit unlisted name remains OTHER with that supplied name. No default courier identity is guessed. [Tracking evidence](evidence/2026-11-09-h2-tracking.md) records 111 offline passes. Refund/reporting helpers follow before persistence.

## Persistence review still needed

Q3 identifies a conflict between `CaptureResult.raw`/`disputes.raw`/webhook payloads and the original no-email/no-street-address persistence rule. Preserve raw webhook bytes transiently for signature verification. Keep the exact capture contract transient; do not persist its raw object or add real fixtures before joint review.

Prepare the explicit allowlist and mappings at H2.3: required PayPal/Fairfold identifiers, status, seller protection, account status, monetary amounts and item metadata; email only as a SHA-256 hash, street address only as a hash plus country/postal code. Review normalization, retained vendor fields and diagnostic samples with Hriday/Ishaan before implementation. Do not silently rename or remove `raw` from the shared contract. Database writes and real fixture capture remain gated; H2.1 can be tested with clearly synthetic data.

Primary references checked on 9 November 2026: [OAuth authentication](https://developer.paypal.com/api/rest/authentication/), [API request headers and sandbox origin](https://developer.paypal.com/api/rest/requests/), [API responses](https://developer.paypal.com/api/rest/responses/), [idempotency limits](https://developer.paypal.com/api/rest/reference/idempotency/). Operation-specific specs must be checked before H2.2 bindings.
