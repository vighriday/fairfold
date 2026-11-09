# H2 PayPal client and checkout increments

Sources: original architecture sections 3, 8 F1/F6, 11–12 and 16 H2. D1, D3–D6 and the existing `PayPalClient`, `ForMerchant`, `CaptureResult`, Money and HTTP contracts remain fixed. O15 records the user's instruction to continue locally while H1 hosting is pending. H2.1 transport and H2.2's operation groups are implemented and locally verified; H2 is not complete. A4, real create/capture fixtures and Maya's `/dev` purchase are NOT RUN.

## Increment order

| Increment | Deliverable                                                                                                                        | Current gate                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| H2.1      | Merchant credential lookup/decryption, per-merchant OAuth cache, sandbox-only HTTP transport, bounded retries and sanitized errors | IMPLEMENTED AND LOCALLY VERIFIED; no endpoint or full `ForMerchant` client claimed              |
| H2.2      | Real Orders create/capture/get/tracking bindings, exact decimal-string totals, refund/reporting helpers and seed-carrier mapping   | IMPLEMENTED AND LOCALLY VERIFIED in three focused commits; real sandbox fixtures remain NOT RUN |
| H2.3      | Database-priced checkout creation and capture persistence, exactly-once ledger/job behavior, order reads and auth/ownership        | Creation/capture/read/recovery services wired and verified through HTTP                         |
| H2.4      | Numbered endpoints 2–4, 7–8, 30–31 and unstyled `/dev` using sandbox JS SDK v6 with client ID only                                 | Seven source endpoints/runtime locally verified; unstyled /dev remains next                     |
| H2.5      | Real sandbox A4, Maya purchase, sanitized recorded create/capture fixtures and deployment integration                              | Requires sandbox merchant/buyer accounts and H1 hosted verification; retain failures honestly   |

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

H2.2a implemented `createOrderOperations(transport)` with the unchanged create/capture/get method types. That commit returned the exact three-method subset; H2.2b subsequently added tracking to complete the Orders group. Neither claims the whole PayPalClient/ForMerchant.

Create builds one CAPTURE purchase unit with the source reference/custom/invoice IDs, string quantities and an exact item-total breakdown. Arithmetic uses BigInt hundredths and checks the existing numeric(12,2) range. Wire amounts normalize to two decimals, or integral values for HUF/JPY/TWD; nonzero fractions in integral currencies, mixed/unsupported currencies, invalid quantities and invalid shipping fields fail before credential lookup. An approval link must be a GET link on the sandbox PayPal web origin.

Capture maps the actual capture's status and seller protection, wallet account status, modern account identity with legacy payer fallback, and the exact shared shipping fields. Absent/empty optional fields remain null; multiple purchase units/captures and conflicting payer IDs require reconciliation rather than an invented singular result. `raw` is retained only in the transient return object. The shared shipping type omits address_line_2 while raw includes it: Q3's future address-hash review must account for all necessary address components without silently changing the contract.

`requestValidated` reports malformed response shapes with actual debug-ID/status metadata and never retries a potentially completed mutation because parsing failed. Order GET validates identity and returns the transient vendor object; vendor HATEOAS links are not followed. [Orders evidence](evidence/2026-11-09-h2-orders.md) records 83 offline passes and the current official schema digest. Real sandbox fixtures and A4 remain NOT RUN.

## H2.2b Tracking and carrier mapping

`createOrderOperations` now returns the complete existing Orders method group, including `addTracking`; it still does not claim the whole PayPalClient/ForMerchant. Tracking sends capture_id, tracking_number, carrier, optional carrier_name_other and the explicit notify_payer value as a flat object. It sends the source request ID but does not automatically replay 5xx because the current tracking operation does not document that idempotency header. The future H5 job must reconcile an ambiguous outcome before repeating a notification-producing call.

The returned tracker must exist in the actual response for the expected order. A matching captureId-trackingNumber ID is selected among older trackers, as illustrated in the official response examples; a unique opaque returned ID is also accepted. Missing or ambiguous IDs fail rather than being invented. The format remains subject to actual sandbox observation.

The source carrier map handles DHL, FedEx, UPS, India Post, Delhivery and Blue Dart. `carriers.toDisputeCarrier` keeps the existing one-string interface. For a shipment tracked as OTHER, its caller passes the actual stored carrier_name_other value; bare OTHER fails. Known names map to the verified disputes enum; an explicit unlisted name remains OTHER with that supplied name. No default courier identity is guessed. [Tracking evidence](evidence/2026-11-09-h2-tracking.md) records 111 offline passes. Refund/reporting helpers follow before persistence.

## H2.2c Refund and reporting helpers

`createPaymentOperations(transport)` implements the existing refund interface: empty JSON for a full refund, or a positive exact amount plus optional bounded note/invoice fields. It returns the actual refund ID/status and uses documented request-ID retry support. It is a low-level vendor binding: merchant/capture ownership, human approval, remaining refundable balance and source refund-age checks still belong to the approved calling workflow. No refund route, action execution or money movement is implemented by this increment.

`createReportingOperations(transport)` implements searchTransactions with fields=all and complete local page-number pagination. A request must use explicit RFC3339 UTC/offset timestamps with up to millisecond precision and span at most 31 days. The helper requests 500 rows/page, verifies page/count consistency, ignores vendor next links and preserves distinct rows with duplicate transaction IDs. Changed totals, short/incomplete pages or subsequent failures reject the result. A local 100-page guard asks for a narrower date window rather than truncating; this is an implementation budget, not a claimed PayPal limit. Longer backfill periods must be divided into bounded windows by the future caller, outside the live checkout path.

All history rows remain transient unknown[] objects. This code does not persist fields=all payloads or send them to models. [Refund/reporting evidence](evidence/2026-11-09-h2-payments-reporting.md) records 136 offline passes. Actual response/pagination behavior remains unverified without sandbox accounts; helpers are not yet wired to API/worker routes. Dispute/webhook methods and complete ForMerchant composition remain outside this H2.2 operation increment.

## H2.3a Approved capture mapper

Hriday approved the [capture persistence policy](capture-persistence-review.md) on 9 November 2026 IST: “Use the proposed capture policy.” The application mapper now returns only the approved IDs, amount, payer display name/hashed email, account/protection fields and country/postal/address hash. It includes address_line_2 transiently without changing CaptureResult.shipping. Invalid response identity/status/amount shapes fail with a safe error. Fourteen synthetic cases pass; see [mapper evidence](evidence/2026-11-09-h2-capture-policy.md).

The mapper itself does not write data or expose a route. The subsequent capture store now uses an order-locked transaction with amount/ownership guards and atomic buyer/order/ledger/job persistence; see [capture store evidence](evidence/2026-11-09-h2-capture-store.md). Twenty-five new PostgreSQL cases pass. Database-priced checkout creation is now verified in its own increment, below. Vendor-call capture orchestration and owner-scoped reads/routes remain pending. Raw remains transient; real vendor fixtures remain unrecorded. Ishaan’s broader privacy review and Q3’s webhook/dispute/reporting/action-response allowlists remain open. Raw webhook bytes must remain unchanged until verification.

Primary references checked on 9 November 2026: [OAuth authentication](https://developer.paypal.com/api/rest/authentication/), [API request headers and sandbox origin](https://developer.paypal.com/api/rest/requests/), [API responses](https://developer.paypal.com/api/rest/responses/), [idempotency limits](https://developer.paypal.com/api/rest/reference/idempotency/). Operation-specific specs must be checked before H2.2 bindings.

## H2.3c Database-priced creation

The application creation service validates the existing CoreRequests.createOrder body, scopes products to the merchant and snapshots server-owned price/name/listing version. It combines duplicate SKUs, checks SQL quantity/decimal total limits and rejects missing/simulated merchants, foreign products, mixed currencies and invalid totals before invoking the injected merchant client. Source request/reference/custom/invoice IDs remain unchanged.

After the validated vendor operation returns, order and item inserts share one transaction. A listing changed during the vendor call does not change the snapshot already sent. The response remains exactly orderId/paypalOrderId; shipping plaintext is not stored at creation. Nineteen new PostgreSQL cases pass; see [creation evidence](evidence/2026-11-09-h2-checkout-create.md).

O17 documents the original create-before-insert crash window. Local persistence failure returns only safe recovery IDs and no automatic second vendor creation. This is not a durable HTTP retry claim; H3’s specified import/reconciliation is still unimplemented. Public routes, authorization reads and /dev follow as separate increments.

## H2.3d Scoped order reads

Lists and details filter by the authenticated merchant_id or buyer_id in SQL. No admin/agent bypass exists. The list cursor is the last returned order UUID, resolved inside the same owner/status filter; ordering is created_at descending then UUID descending. Default limit remains 50. Invalid/foreign cursors fail without identifying another account. Arrays and DTOs remain unchanged.

Buyer details keep required DTO fields with neutral values for merchant-only content: buyerSignal=null, hold=null, sharedCauses=[], item batchCode=null and buyer payerAccountStatus=null. Merchant summaries use the latest matching merchant/order/buyer signal row, first three stored reason labels, unacknowledged alerts and unresolved disputes. Details report the real ledger verifier result and never return ledger payloads or contact/address hashes.

Merchant detail calls the source computeBuyerSignal function only after authorization; the API bootstrap will inject the existing intelligence export. Current output is labelled INTELLIGENCE_STUB; no new score/model implementation or private features JSON layout is assumed. Buyer reads never call it. See O18 and [read evidence](evidence/2026-11-09-h2-order-reads.md). Public HTTP wiring is the following increment.

## H2.3e Checkout recovery orchestration

createCheckoutClientFactory exposes only implemented checkout methods and authoritative readCapture; it does not pretend to be the full ForMerchant contract. The recovery GET requests payment_source, parses existing captures through the same mapper, preserves PENDING/DECLINED, and fails closed on ambiguous shapes. No raw vendor data is persisted by the client.

The application resolves the PayPal order to its stored merchant before credential access. An existing local committed capture returns its current minimal summary, preserving later states. Otherwise it re-fetches PayPal first, captures only if no capture exists and the local state allows it, and writes through the approved atomic store. An ambiguous capture POST or ORDER_ALREADY_CAPTURED error permits one read-only reconciliation, never another application POST. Concurrent callbacks coalesce within the process; stable IDs and the database transaction remain the cross-instance protections. See O19 and [recovery evidence](evidence/2026-11-09-h2-capture-recovery.md).

Guest checkout retains the original public exception and returns OrderSummary only. It does not grant private order reads. A known order’s authenticated buyer must match its stored buyer ID; browser token subjects are never used to manufacture PayPal identity. Maya’s seeded buyer row must be linked to her actual verified payer ID when accounts exist, before demonstrating authenticated buyer history. Configuration exposes only clientId/merchantId/currency and rejects missing/simulated setup or a catalogue without one unambiguous currency. HTTP routes and /dev are still next.

## H2.4a HTTP/bootstrap wiring

The seven source endpoints are implemented under routes/core and documented live by Fastify/Zod. Config/create/capture keep the public checkout exceptions; private lists/details enforce their exact source roles and ownership. Create returns the unchanged two-ID response with HTTP 201. Capture accepts absent body or {}, rejects nonempty bodies and returns OrderSummary. Shared DTOs and error envelopes remain fixed.

The actual server starts pg-boss before listening, injects stored merchant credentials through packages/paypal and the existing computeBuyerSignal export, and closes HTTP/jobs/database on shutdown. Health reports phase H2 and intelligence stub. See the [integration guide](checkout-integration.md) and [HTTP evidence](evidence/2026-11-09-h2-http.md). The /dev harness and real sandbox/hosting acceptance remain open; intelligence routes are still Ishaan-owned.
