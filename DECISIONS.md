# Fairfold decisions and contract questions

Recorded 9 November 2026 IST. The architecture's choices below are inherited, not newly selected. The user has authorized H1 around the absent sandbox accounts. Current questions remain review inputs; no shared-contract alteration has been approved.

## Fixed architecture decisions

| ID  | Existing choice                                                                                   | Source                |
| --- | ------------------------------------------------------------------------------------------------- | --------------------- |
| D1  | Per-merchant REST app credentials behind `PayPalCredentials`; partner mode is future work         | Architecture 5        |
| D2  | Verified webhooks plus a one-minute dispute reconciliation poll                                   | Architecture 5, 8 F4  |
| D3  | TypeScript, Node.js 22 LTS or newer                                                               | Architecture 5, 14    |
| D4  | Fastify 5, Zod and generated OpenAPI                                                              | Architecture 5        |
| D5  | PostgreSQL 16 with Drizzle                                                                        | Architecture 5, 7     |
| D6  | pg-boss using the same Postgres                                                                   | Architecture 5        |
| D7  | Content-addressed Postgres `bytea`; image max dimension 2,048 px; BlobStore abstraction           | Architecture 5, 12    |
| D8  | Per-order SHA-256 hash chain; external anchoring is stretch only                                  | Architecture 5, 7     |
| D9  | Vercel AI SDK with structured output and embeddings                                               | Architecture 5, 10    |
| D10 | Environment-selected models/provider; optional separate embedding provider                        | Architecture 5, 14    |
| D11 | Embeddings in `real[]`, cosine comparison in memory                                               | Architecture 5, 9     |
| D12 | Fixed-taxonomy extraction, deterministic product/category grouping and cosine threshold 0.80      | Architecture 5, 9     |
| D13 | Exposure-based exact conditional binomial test, Benjamini–Hochberg correction; Fisher cross-check | Architecture 5, 9     |
| D14 | Transparent points and reason codes for Buyer Signal                                              | Architecture 5, 10    |
| D15 | Separate Fairfold MCP server alongside PayPal tools                                               | Architecture 5, 16 H7 |
| D16 | REST/JSON contract; OpenAPI at `/docs`                                                            | Architecture 5, 11    |
| D17 | Seeded role/subject demo bearer tokens                                                            | Architecture 5, 12    |
| D18 | Render web service, worker and Postgres from one blueprint                                        | Architecture 5, 14    |

## Operational instructions for this branch

| ID  | Instruction or clarification                                                                                                                           | Basis                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | All authored work stays on `Hriday`; no task branches or direct main updates                                                                           | Explicit user instruction overrides architecture 14/16 workflow wording                                                                                          |
| O2  | The initial pass was research/documents only; the user subsequently authorized building H1 around absent sandbox accounts                              | User's two explicit replies on 9 November; application work now permitted                                                                                        |
| O3  | Internal sources and extracted media never enter Git                                                                                                   | Local internal README; `.gitignore` protects them                                                                                                                |
| O4  | No app success, deployment, evaluation, interview or prize outcome is claimed without evidence                                                         | Architecture completion checks and submission 18                                                                                                                 |
| O5  | Standard v6 checkout uses client ID only; do not add a client-token route from the summary table                                                       | Architecture 3 and 16 H2 are specific; current [migration guide](https://developer.paypal.com/v5-v6) supports this                                               |
| O6  | The sandbox buyer opens the dispute manually; no ordinary API creation script is assumed                                                               | Architecture 3 and pre-H1 brief; current [setup guide](https://developer.paypal.com/platforms/disputes/set-up) requires additional buyer scopes for API creation |
| O7  | Public testing instructions may explain access; they must not publish PayPal passwords, app secrets or bearer tokens                                   | Architecture 1/12 no-secrets rule governs older submission wording about credentials in README                                                                   |
| O8  | CP0 is past its planned date and unverified; preserve the original milestones, record actual completion dates                                          | Current date is 9 November; architecture 18 planned CP0 for 8 November                                                                                           |
| O9  | `AI_EMBEDDING_PROVIDER` selects the embedding provider; the adjacent “Webhook verification” cell is a clerical mismatch                                | Architecture D10, section 14 variable description and I1 agree                                                                                                   |
| O10 | Planning preparation uses `DOCS:` commits and does not satisfy H1                                                                                      | Architecture 16 requires working acceptance evidence for H tasks                                                                                                 |
| O11 | Defer the real pre-H1 sandbox spike and proceed with H1; retain all sandbox acceptance gates as NOT RUN                                                | User confirmed accounts do not exist and instructed “In the meantime build around it”                                                                            |
| O12 | Pin pnpm 12.4.2/TypeScript 5.9.3 and compatible packages; use SQL column names in Drizzle, one-hour demo JWTs and local generated secrets              | H1 implementation details within D3–D5/D17; no architectural replacement                                                                                         |
| O13 | Validate locally against isolated native PostgreSQL 16.15 on loopback because Docker is absent; retain Compose postgres:16 and Render major version 16 | Official Windows binaries linked by PostgreSQL; no Windows service or production database changed                                                                |

### O14 — Initial hosted URL configuration

On Render only (`RENDER=true`), use its documented `RENDER_EXTERNAL_URL` as the default APP_BASE_URL, and default FRONTEND_ORIGIN to that app URL while H1/H2 serve Swagger and the unstyled harness from the API origin. Explicit APP_BASE_URL and FRONTEND_ORIGIN still take precedence; local configuration still requires both. Configure the actual Figma frontend origin when it exists. This avoids guessing a hostname before first resource creation and preserves the section 14 environment names and section 12 CORS boundary. Source: [Render's default environment variables](https://render.com/docs/environment-variables).

### O15 — Continue local H2 while H1 hosting is pending

The user reports deleting a stale Blueprint and asks to wait for synchronization while continuing the other pieces, with a possible later deployment handoff to Ishaan. Continue the next source task, H2, locally in focused increments. H1 remains IN PROGRESS until hosted verification passes; H2 cannot pass A4 without real sandbox accounts. The supplied screenshot establishes a separate payment-information requirement for the paid Blueprint, not a measured quota reset or synchronization delay. Retain D18 and the existing service plans; prepare the handoff without assigning it to Ishaan or sending a message. Q3 still gates capture persistence, and H3 has not been authorized as a skipped-ahead task.

### O16 — Bounded reporting helper

Transaction Search uses the source-prescribed maximum 31-day request window and current documented 500-row page size. The local helper has a 100-page budget and fails with PAYPAL_REPORTING_PAGE_LIMIT rather than returning a truncated array; this is an implementation guard, not a PayPal platform limit. It requires stable page/count metadata, retains all rows even when transaction IDs repeat, and rejects a changed/incomplete result. Future history callers split longer periods into bounded windows; backfill stays outside live checkout. Current behavior is tested with synthetic responses only. Source: [Transaction Search reference](https://developer.paypal.com/api/transaction-search/v1/search-get).

## Questions to resolve before the affected implementation

| ID  | Finding and consequence                                                                                                                                                                                   | Required evidence or review                                                                                                                                                                                                                                                                                                                              | Gate                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Q1  | Actual dispute status, lifecycle stage, available links/options and arrival delay are unknown                                                                                                             | Run the pre-H1 spike; record both detail snapshots and timing                                                                                                                                                                                                                                                                                            | Before H1 per brief            |
| Q2  | `REFUND_WITH_RETURN` needs a return address, absent from `PayPalClient.acceptClaim` and action parameters; `makeOffer` also omits address support for that choice                                         | Joint Hriday/Ishaan contract review after observing allowed options; no new field added here. [PayPal offer reference](https://developer.paypal.com/api/customer-disputes/v1/disputes-make-offer) and [schema](https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/customer_disputes_v1.json) establish the requirement | Before return-based H4 actions |
| Q3  | `CaptureResult.raw`, `disputes.raw` and event payloads can retain email/street addresses, conflicting with privacy requirements if persisted unchanged                                                    | Agree a sanitization boundary that preserves verification inputs transiently and required identifiers; review fixture redaction before commits                                                                                                                                                                                                           | Before H2/H3 persistence       |
| Q4  | `EvidencePackDraft.actionParams.amount` differs from stored `action_params.offerAmount`/`refundAmount` and approval body `amount`                                                                         | Agree explicit mapping at the existing boundary; test all three shapes; do not rename shared fields implicitly                                                                                                                                                                                                                                           | H4/I5 integration              |
| Q5  | API detail/schema renders accept-claim as multipart with incomplete structured fields, while the official integration guide demonstrates JSON `note`; full `accept_claim_reason` enum remains unspecified | Sandbox-test the supported JSON path and allowed types. Omit optional reason until verified. Do not generate a guessed enum                                                                                                                                                                                                                              | Pre-H1/H4 spike                |
| Q6  | Webhook resource shape is still an external uncertainty                                                                                                                                                   | Observe a real dispute webhook; preserve `resource.dispute_id` then `resource.id` fallback and authoritative GET; do not invent a fixture                                                                                                                                                                                                                | H3/H4                          |
| Q7  | H4's full A12 uses fulfilment/delivery facilities implemented later; H1's first deploy depends on Render access                                                                                           | Use the documented stub pack and recorded PayPal transaction for the H4 component check; record full A12 as pending until deployed integrated test; acquire Render access before declaring H1 done                                                                                                                                                       | H1, H4 and H8                  |
| Q8  | The seed's B14 “received 75 days ago” and comparison population “delivered in last 60 days” need explicit delivered dates                                                                                 | Choose delivery dates that satisfy both existing rules; keep received dates unchanged; assert the population and denominator before trusting A1/A2                                                                                                                                                                                                       | H8/I6 fixture review           |
| Q9  | A1 needs 18 unshipped orders with B17 stock; live checkout adds an order that must be sealed before recounting. Seeded disputes also affect Store Report bands                                            | Verify exact counts before and after live capture/seal/dispute. Keep seam complaints as complaints unless specified as disputes; do not silently alter band thresholds or seed totals                                                                                                                                                                    | H8/A1/A14                      |
| Q10 | Agent tool `get_order_proof` needs an ownership policy for private order IDs; H7 names role access but not this finer rule                                                                                | Review with Hriday/Ishaan against section 12 ownership rules before exposing private proof to an arbitrary agent                                                                                                                                                                                                                                         | H7                             |
| Q11 | A durable event row followed by a failed enqueue can leave an unprocessed event if every duplicate exits immediately; one-minute dispute polling alone does not repair capture imports                    | Resolve the atomic/retry boundary within the chosen Postgres/pg-boss design; prove recovery without changing the event/API contract                                                                                                                                                                                                                      | H3                             |
| Q12 | PayPal documentation establishes Orders request-id support, not universal idempotency for every dispute operation                                                                                         | Keep deterministic IDs as specified; establish local dedupe/claiming and re-fetch on ambiguous outcomes; verify per-operation behavior before retrying money actions                                                                                                                                                                                     | H2/H4/H5                       |
| Q13 | The H4 check expects an offer to fail after `sandboxRequireEvidence`, but that endpoint documents response-status changes, not necessarily a move out of INQUIRY                                          | Observe status and lifecycle stage separately; agree the exact stage-change rehearsal before declaring STAGE_CHANGED coverage                                                                                                                                                                                                                            | Pre-H1/H4 spike                |

Q2–Q13 are focused review items. None authorizes a new architecture, payment rail, safety verdict, or change to the idea. Where external behavior blocks a specified path, record the failure and use only a jointly accepted documented fallback.

### Q3 capture policy approved by Hriday

The [capture persistence proposal](docs/hriday/capture-persistence-review.md) maps the existing schema/contracts to an explicit allowlist and proposed email/address normalization. It keeps raw transient and includes address_line_2 in the in-memory hash input without changing CaptureResult.shipping. Status: APPROVED BY HRIDAY on 9 November 2026 IST. Hriday replied “Use the proposed capture policy” to this concrete proposal. Implement the capture mapper and transaction under that allowlist; Ishaan’s review has not been received. Webhook/dispute/action-response retained fields still need separate review before their tasks; Q3 remains open for those boundaries.

## Sandbox spike result

Status: **DEFERRED BY USER; NOT RUN**. The user confirmed accounts do not currently exist and authorized H1 around that dependency. No sandbox transaction, dispute, webhook, evidence upload or offer has been observed. Fill the result fields in `docs/hriday/sandbox-spike.md` after the real run. No guessed PayPal identifiers or success responses belong here.

## O17 — Checkout create and local persistence failure boundary

Original F1 creates the PayPal order before inserting its non-null PayPal ID into orders. Keeping that source order and schema means a crash/database failure after vendor creation can leave an unpaid PayPal order without a local row. The local creation service does not repeat the vendor operation after a local write failure; it rolls back order/items together and reports only the generated Fairfold order ID and returned PayPal order ID when available. No raw response or shipping/contact fields enter diagnostics.

The source deterministic ff-create-<order uuid> ID still governs retries inside the existing vendor operation. This does not claim durable HTTP request deduplication across newly generated order UUIDs or storage recovery after a process crash. H3’s source-defined unknown-order import/reconciliation remains future work, not implemented by the creation service. No shared request change, placeholder PayPal ID, new table or alternate architecture is introduced. Test evidence covers item-insert rollback after synthetic vendor creation and confirms one invocation, without claiming an actual sandbox success.

## O18 — Private order projections and pagination

Implement section 12 ownership in the SQL predicate for every list/detail, including cursor anchors. Endpoint 8 uses the same buyer projection as endpoint 31. Keep the unchanged required OrderDetail fields, using null/empty values for merchant-only buyerSignal, hold and sharedCauses, and for internal batchCode/payerAccountStatus on buyer views. No private ledger payload, address/email hash, raw vendor mirror or implicit admin/agent bypass is exposed.

Source list arrays accept limit (default 50) and cursor. Use the last returned UUID as cursor and stable created_at DESC, id DESC ordering; resolve it only inside the owner/status filter. Reject invalid/foreign/filtered-out anchors uniformly. Limits retain the shared contract subject to SQL integer bounds. alertCount means unacknowledged order alerts; disputeOpen requires an unresolved matching-merchant dispute.

List signal summaries use the latest persisted matching merchant/order/buyer row and first three stored reason labels. Merchant detail invokes the existing computeBuyerSignal function after ownership verification; current labelled stubs remain stubs. This uses the documented intelligence function seam instead of inventing a storage layout for sentence/simulatedNetworkUsed in features. Ishaan still owns its implementation and can supply its caching through that seam; no outbound message or review is claimed.

## O19 — Public checkout context and capture recovery

Preserve the source buyer-or-none checkout exceptions and their minimal response. Resolve a capture’s PayPal ID to a local order, derive its merchant from that row and reject invalid/SEED identifiers before vendor calls. A logged-in buyer cannot act on an order already owned by another buyer. Guest possession of the opaque PayPal ID permits only the source public capture/OrderSummary surface; it is not authorization for private order details. No cookie/auth/request DTO is added.

Do not assign buyer_id from a browser token. The approved store upserts by actual PayPal payer ID. Maya’s seeded fixed demo subject therefore needs her verified payer ID linked to the existing buyer row when real accounts become available; no identity is guessed from email or session role. This remains a setup dependency before authenticated real buyer-history acceptance.

Before a new capture POST, use the authoritative order GET with fields=payment_source and recover an existing capture if present. After an ambiguous mutation or ORDER_ALREADY_CAPTURED, allow one read-only reconciliation and no application-level second POST. Local coalescing reduces same-process races; it does not claim distributed exactly-once or replace PayPal request IDs and the transactional store. Other vendor errors fail normally. Pending/declined/mismatched captures never produce local payment success.

Checkout currency has no merchant column in the fixed schema. The public configuration derives one distinct currency from the merchant catalogue and fails if absent/ambiguous, rather than guessing USD. The source Neel catalogue uses USD. Official GET reference: [Show order details](https://developer.paypal.com/api/orders/v2/orders-get). The real external path, eligibility and payer identity remain unverified until sandbox setup.

## O20 — v6 harness promise shape and test claims

Use the current [v6 session reference](https://developer.paypal.com/sdk/js/reference/), updated 29 October 2026, which specifies an orderPromise resolving to an object containing orderId. The [migration guide](https://developer.paypal.com/v5-v6) includes a contrasting string-return snippet; use the precise API reference and test {orderId: paypalOrderId}, not a raw string or Fairfold UUID. This is SDK binding detail, not a shared Fairfold contract change.

The unstyled source harness uses only the [sandbox core and client ID](https://developer.paypal.com/sdk/js/set-up/), paypal-payments, currency eligibility and the one-time session. Start the session directly on the click before awaiting creation to preserve browser activation. Capture only the active approved PayPal ID, display only safe server JSON/text, and retry an uncertain approved capture without a new create. In-memory guards do not survive reload and do not establish durable browser idempotency.

A VM test with synthetic SDK/DOM/network is a logic check; serving assets over HTTP is a route/bootstrap check. Neither verifies actual SDK compatibility, eligibility, popup/cookie behavior or a PayPal transaction. Those remain explicit real-browser A4/Maya gates while accounts are absent. The full Figma frontend and H3 remain outside this increment.

## O21 — H2 response recording within the approved capture boundary

The local rehearsal may record only in-memory sanitized create/capture responses into ignored .work/h2-sandbox. It keeps the observed operation, UTC timestamp and required IDs/status/money/protection/source metadata; substitutes synthetic buyer identity/name/email and shipping values; and excludes other vendor fields and nonessential URL queries. Capture GET observations stay labelled separately and do not replace the required capture POST fixture. Recording failure preserves the successful payment result and emits only a fixed diagnostic. Replay rejects extra or unsanitized fields. Real provenance still requires review of the actual account-backed run; a JSON label is not proof by itself. This implements the existing H2 completion requirement and approved Q3 capture fixture policy without extending webhook/dispute/reporting retention or changing shared contracts. See [recording evidence](docs/hriday/evidence/2026-11-09-h2-response-recording.md).

## O22 — Finish the source full-client obligation inside H2

Hriday explicitly chose “Finish remaining local H2 client work first.” Original section 16 H2 requires section 3's complete PayPalClient and ForMerchant. Implement the remaining low-level dispute/webhook methods and type-checked composition here. Earlier notes assigning these methods entirely to future tasks were an implementation-scope error; H3 event/poll handlers and H4 approval/action execution remain separate and unstarted. This clarification changes no architecture, contract, review gate or ownership.

The existing opaque nextPageToken transports legacy vendor tokens unchanged and adapts current page links as page:N. Only cursor values are extracted from exact sandbox resource links; no vendor URL is followed. A colon cannot occur in the documented legacy token alphabet. Keep filters/page size stable while paging. See [client policy](docs/hriday/paypal-client.md); real pagination remains unverified.

## O23 — Dispute binding limits and existing review gates

Implement non-return offer/accept-claim bodies and messages from the official JSON examples, leaving Q5's real accept-claim behavior unverified. Both REFUND_WITH_RETURN branches fail with PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED before OAuth because Q2's shared return address is missing; no field, address or default is invented. Source offer types determine required/omitted amounts. H4 still owns approval, stage/options, ownership and dedupe. No broad raw-payload retention is authorized.

Evidence uses stable multipart bytes with input JSON and file1..n. Conservative decimal ceilings are less than 10,000,000 bytes per file and at most 50,000,000 for the encoded body; MIME/extension/signature must agree and filenames cannot inject headers. PDF bytes pass through unchanged. Input depth is locally bounded at 20 and non-JSON values are rejected rather than silently altered. These local guards do not claim measured sandbox limits. See [action evidence](docs/hriday/evidence/2026-11-09-h2-dispute-actions.md).

## O24 — Exact-body signature postback without an H3 handler

The official postback guide requires unchanged webhook_event formatting. The client therefore validates raw JSON without replacing it, embeds the original text and restricts raw-JSON transport to verify-webhook-signature. It requires five non-duplicate headers, registered ID and exact sandbox certificate URL; only provider SUCCESS returns true. Invalid metadata returns false and provider errors fail safely. No certificate URL is followed, no simulator bypass is added and no event is persisted/processed. The 1 MiB input limit is local, not a PayPal platform claim. Verify is read-only and can retry; register has a generated stable-per-call request ID but no assumed provider idempotency, so uncertain registration is not replayed. See [webhook client evidence](docs/hriday/evidence/2026-11-09-h2-webhook-client.md).

## O25 — H3 preparation after local H2 closeout

The user asks to continue after the complete local H2 delivery. Prepare the [H3 source plan](docs/hriday/h3-webhooks.md) and [Q3 event allowlist](docs/hriday/webhook-persistence-review.md). Current AGENTS.md explicitly says not to advance H3 while H1/H2 gates remain pending, and capture approval does not extend to event retention. Obtain an explicit exception and concrete policy review before H3 implementation. Do not repeat finished H2 work or call H1/H2 formally complete. No assumption of approval or new architecture is made by this preparation.

### O25 approval received

On 10 November 2026 IST Hriday explicitly replied “Proceed with H3 and approve the event policy.” This authorizes H3 local implementation under that exact event allowlist while H1 hosting/H2 account-backed acceptance remain pending. Update AGENTS.md to preserve the exception. This does not authorize H4 dispute/message/action-response retention or close any real acceptance gate. Registration uses a merchant row lock and never overwrites an existing webhook ID; ambiguous outcomes require Dashboard reconciliation before another attempt. No automatic registration retry or vendor call is performed by tests/startup.

## O26 — Atomic event processing and merchant catalogue import

Move the existing approved capture policy/store into packages/paypal, retaining API compatibility re-exports. The worker and checkout use the same mapper/store; no shared DTO/schema changes. A private database connection/transaction context lets event processing, imported order/items, buyer/capture, ledger, order.captured and processed_at commit together. The PayPal-order advisory lock serializes different event IDs and checkout recovery. Errors roll back first and save only a fixed diagnostic on that same connection; concurrent retries cannot overwrite a success marker.

Unknown toolkit orders are read authoritatively, use one purchase unit/capture and one to 100 items, and match merchant-owned SKU or exact unique name only when SKU is absent. Prices/currencies and item/PU/capture totals must agree with the server catalogue using integer minor units. Snapshot the existing listing version. Preserve a valid source reference UUID/invoice when recovering a create-before-local-write orphan; otherwise allocate a Fairfold UUID and FF-UUID invoice when absent. Opaque toolkit references such as default are permitted only on the private verified-webhook path; normal checkout checks remain strict. Present custom_id must match the merchant slug; a configured PayPal merchant ID must match the imported unit payee. Ambiguity or unsupported invoice syntax fails visibly instead of inventing a mapping.

## O27 — Observing refunds and unspecified event transitions

Authoritative Orders GET capture states distinguish COMPLETED, PARTIALLY_REFUNDED and REFUNDED. Only the verified-webhook store path accepts observed refunded capture history: it preserves actual response status, never fabricates a COMPLETED response, imports missing capture history atomically and sets fully refunded status only for REFUNDED. Normal checkout still requires COMPLETED. Partial refunds retain fulfilment status; old capture events never regress later state. A newly observed full refund queues storereport.refresh in the same transaction. H3 performs no capture/refund POST and adds no unapproved raw/ledger refund payload.

Refund mapping requires retained related order/capture IDs or an already-known capture-to-order link. Missing relations fail with PAYPAL_EVENT_REFERENCE_MISSING; no refund ID is guessed to be a capture ID and no discarded HATEOAS link is followed. Real refund resource shape remains unobserved. CHECKOUT.ORDER.APPROVED acknowledges receipt without capturing. Source H3 defines no reversal-to-order transition; a reversal is acknowledged with REVERSAL_REQUIRES_REVIEW and no guessed financial state. H4 dispute sync is an explicit callback; its absent implementation fails with H4_DISPUTE_SYNC_PENDING and leaves processed_at unset. Primary references: [capture status](https://developer.paypal.com/api/payments/v2/definitions/capture_status/) and [related IDs](https://developer.paypal.com/api/payments/v2/definitions/supplementary_data/).

## O28 — Poll recovery within the fixed schema and job contract

Use one keyed pg-boss cron per configured non-simulated merchant, every minute in UTC; missing/blank app credentials defer the schedule until setup. The existing source job stays disputes.poll { merchantId }. Runtime refreshes schedules at startup/every minute and removes stale keys. No new table, fabricated PayPal event or cursor field is added.

Watermarks remain in memory. Each process starts at the client-supported 180-day boundary plus one second; restart replays that history through H4's required idempotent synchronizer. A successful complete sweep advances to its start time minus two minutes, allowing update-boundary overlap; page/item/sync failures never advance it. Same-process runs coalesce per merchant; separate workers may repeat safe reads/syncs. Page size is 50, with a local 100-page budget (5,000 items) and loop checks; exhaustion fails visibly without claiming completeness. This is a bounded implementation, not proof of real provider latency or retention behavior. The exact recovery window and runtime limits are tested synthetically; real scopes/pages/arrival behavior remain acceptance dependencies.

## O29 — Normal H3 runtime, key wiring and acceptance evidence

The normal worker merges the two Hriday handlers with existing intelligence handlers, rejects conflicting ownership and reports H4_PENDING until its sync callback exists. Worker configuration needs only its database, canonical encryption key and exact sandbox origin; it does not require API-only URL/JWT variables. Startup/close are guarded and cron refresh runs at startup/every minute. Wire the worker's APP_ENCRYPTION_KEY to the API's existing variable using current fromService/envVarKey syntax. No new key, plan, resource or hosted mutation is introduced; reference values refresh on Blueprint sync, and the existing key must be retained. Current JSON Schema validates, while CLI platform validation remains blocked by absent CLI login. See [runtime evidence](docs/hriday/evidence/2026-11-10-h3-runtime.md).

The read-only capture-event inspector checks local verified/processed merchant state, capture IDs, first captured ledger amount/count and hash chain. It labels real delivery/redelivery provenance as REQUIRES_OPERATOR_OBSERVATION; database inspection alone cannot close real A5. Automatic approval review rejected executing the registration CLI because it can persist a PayPal registration while actual account/hosting authorization remains pending. Do not bypass or repeat that command in this pass. Synthetic registration tests passed; actual registration, signed delivery and hosted acceptance remain unrun.

## O30 — H4 source guards while retention review is pending

Continue with H4 after H3's local closeout. The [retention and mapping proposal](docs/hriday/dispute-persistence-review.md) and [H4 plan](docs/hriday/h4-disputes.md) are prepared; approval is pending, not inferred from the event policy. Work that writes disputes/messages/action results waits. The pure action guard performs no I/O and is not action approval.

Original section 4 says every Fairfold dispute action occurs while PayPal waits for the seller. Apply that rule to all four supported operations; F4 additionally requires INQUIRY for offers/messages. Offer/accept-claim types must appear in the fresh corresponding allowed_response_options list; missing/removed options refuse with STAGE_CHANGED. Unknown/mismatched details fail with a fixed response error. Q2 REFUND_WITH_RETURN remains blocked before any operation. The future worker must obtain fresh merchant-scoped details immediately before invoking this helper; a historical snapshot is not proof of current eligibility. No shared contract or PayPal eligibility claim changes.

### O30 policy approval received

Hriday explicitly replied “Approve the H4 policy and mapping” on 10 November 2026 IST. Implement the [exact proposal](docs/hriday/dispute-persistence-review.md); its controlled-demo text limitations and review-required failure are part of the approval. This supersedes the pending Q3/Q4 local retention gate, not Q2/joint shared-contract review or real action approval. Read invoice_number transiently for the original exact merchant-scoped invoice fallback without expanding retained raw fields. No real fixture or PayPal action is authorized by this policy review.

## Ishaan (intelligence)

### I-D1 — AI provider is Grok (xAI) — 2026-11-09

- `AI_PROVIDER=xai` through the Vercel AI SDK provider `@ai-sdk/xai`, with key `XAI_API_KEY`. `AI_MODEL_VISION` and `AI_MODEL_TEXT` hold Grok model ids.
- `packages/ai` still supports `openai | anthropic | google` (D10 is unchanged).
- Embeddings: `AI_EMBEDDING_PROVIDER` (default = `AI_PROVIDER`). If the chosen provider has no embedding model in the AI SDK, `embed()` throws `EMBEDDING_PROVIDER_UNSUPPORTED` with a clear message instead of failing silently.
- Contract change: none. `.env.example` (Hriday) should add `XAI_API_KEY` and `xai` to the `AI_PROVIDER` options.

### I-D2 — Buyer Signal points: no double count for lost disputes; refund ratio +10 — 2026-11-09

- The section 10 table made the seeded buyer "Alex R." red (at least 35 points), while sections 17 and 19 require him to be yellow for the video.
- Change:
  - OWN_DISPUTES_FILED (+10 each, max +30) counts only disputes the buyer did **not** lose.
  - OWN_DISPUTES_LOST (+15 each, max +30) counts the lost ones.
  - OWN_REFUND_RATIO is **+10** (was +15).
- Alex: OWN_DISPUTES_LOST 15 + OWN_REFUND_RATIO 10 + NEW_ADDRESS 5 + PAYER_VERIFIED −5 = 25 → yellow.
- Contract change: **yes**, to section 10's points table. Needs Hriday's approval.

### I-D5 — Alex R.'s seeded history must give a refund ratio above one half — 2026-11-09

- OWN_REFUND_RATIO needs at least 2 orders with **more than** half refunded. With "one earlier refund" over 2 orders (exactly half), the rule cannot fire. The eval profile therefore gives Alex 2 earlier orders, both refunded, one of which he later disputed and lost, plus a new ship-to address.
- Action for Hriday's `scripts/seed.ts`: seed Alex's history to match this profile (`packages/intelligence/eval/fixtures/buyers.json`, id `b15`).
- Contract change: none (seed data only).

### I-D3 — Dispute messages are appended, not new complaint rows — 2026-11-09

- Section 9 lists a `dispute_message` source, but the `complaints.source` check constraint allows only `buyer_report | dispute | review`, and section 7 says dispute messages are appended to the dispute's complaint text. We follow section 7.
- Contract change: none.

### I-D4 — Contracts shim replaced by H1's `@fairfold/contracts` — 2026-11-09

- H1 landed on `Hriday`; it is merged into `ishaan` locally. The temporary shim is deleted and every intelligence import uses `@fairfold/contracts`.
- Ishaan's route schemas live in `packages/contracts/src/intel.ts`, imported as `@fairfold/contracts/intel` (the existing `./*` export), so `contracts/src/index.ts` is unchanged. This file reaches Hriday by pull request as section 14 asks.
- The worker imports a ready `handlers` map and the API registers the intel plugin without options, so `packages/intelligence/src/runtime.ts` builds the database and a lazily-started pg-boss publisher from `DATABASE_URL` on first use. Tests inject their own runtime.
- For Hriday: `/healthz` and the worker log reported `intelligence: 'stub'` until I-D13 retired the stubs.
- Contract change: adds `intel.ts` only.

### I-D6 — Buyer Signal sentence is stored inside `buyer_signals.features` — 2026-11-09

- `BuyerSignal` (section 10) has a `sentence`, but `buyer_signals` (section 7) has no column for it. The stored `features` JSON carries `{ ...features, sentence }`, so endpoint 9 returns the same sentence without a second model call.
- Endpoint 34 also returns `signalId`, because a buyer needs it to call endpoint 35 (contest). The field is additive.
- A missing model configuration now degrades to each component's template fallback (logged as `model_not_configured`) instead of failing the job.
- Contract change: none (additive response field).

### I-D7 — Local embedding when no embedding provider is configured — 2026-11-09

- xAI (our chosen provider, I-D1) has no embedding model, so with Grok alone shared-cause grouping would never run.
- When `AI_EMBEDDING_PROVIDER` / `AI_MODEL_EMBEDDING` and its key are not set, `readComplaint` embeds the extracted `category | component | failure_mode` string with a deterministic local feature-hashed bag of stemmed words (`localEmbedding`, 256 dimensions), and logs `embedding: local`. A configured OpenAI or Google embedding model always takes precedence.
- The clustering eval reports which embedding it used; the 0.80 threshold still applies (raise `CLUSTER_SIMILARITY` if precision falls below 0.85).
- Contract change: none.

### I-D8 — Hypothesis explanation, headline and cluster label are written by code — 2026-11-10

- Section 11 calls `HypothesisDetail.explanation` "model-written, from the stats only", but none of section 10's five model components produces it. Code writes it from `HypothesisStats` alone (`sharedCause/wording.ts`): counts, rate ratio, p, q, tests run, median days since delivery, spread and the listing-change flag. No model call, so no number can be invented.
- The cluster label is `component: failure_mode` from the first member's extraction (else the category). Model-extracted phrases are reduced to at most 60 plain characters before they reach the Message Drafter prompt or a buyer message.
- Contract change: none.

### I-D9 — A dispute that joins a live hypothesis gets its pack rebuilt — 2026-11-10

- `dispute.synced` builds the first pack before the Complaint Reader and the debounced scan have placed the dispute's complaint in a cluster, so that first pack cannot see the hypothesis. After a scan, every open dispute whose complaint was newly clustered with an open or confirmed hypothesis (or whose cluster's hypothesis is new) is sent to `evidence.rebuild`, which supersedes the earlier draft with `inspect_first`. Maya's live dispute therefore shows `inspect_first` about a minute after it syncs.
- Contract change: none.

### I-D10 — Buyer message drafts: one per buyer, level kept in the action payload — 2026-11-10

- `send_buyer_messages` carries `{ messageIds, level }`; `level` (`suspected` | `confirmed`) is additive and lets re-scans skip buyers already drafted at that level, so scans stay idempotent. Orders without a buyer get no draft (an in-app message needs a recipient). Drafts go to the hypothesis's in-transit and delivered-without-complaint orders (section 9 stage 5).
- Contract change: additive field in an action payload.
- Amended 2026-11-10 (Phase 2, template-first): the Message Drafter is called at most once per hypothesis and level, not once per buyer. It writes one template with `{order}` and `{product}` placeholders from the approved wording only (no buyer, no order reference, no name reaches the model); code fills each buyer's own order. The template is kept as `template: { subject, body, usedTemplate }` in the `send_buyer_messages` payload, so a re-scan that adds buyers reuses it without a model call. A draft is used only if its body contains `{order}`, it has no other brace, it fits the 120/1200-character limits with 80 characters reserved per placeholder, and it names none of the affected buyers; otherwise the fixed template of section 10 is used. Section 10's "one message per buyer" still holds: each buyer gets their own message. With 38 affected buyers the seeded demo spent 38 free-tier requests per level before this change and spends 1 now.
- Contract change: additive field (`template`) in the same action payload.

### I-D11 — Confirm, dismiss and trend details — 2026-11-10

- Confirm counts one inspected unit per inspection attestation; a unit is defective when its `inspection.defectVisible` and `inspection.matchesCluster` are both true. With no defective unit, 409 `NO_DEFECTIVE_UNIT` carries `{ inspected, defective, clean, suggestDismiss }`; `suggestDismiss` is true at ten or more clean units. `HypothesisDetail` has no field for the suggestion, so it lives in that error.
- Dismiss accepts open or confirmed hypotheses. The `{ reason }` has no column, so it is stored in the proposed `release_orders` payload (`{ orderIds, reason }`) and in the result of every still-proposed action, which dismiss withdraws (`status: failed`, `result: { withdrawn: 'hypothesis_dismissed', reason }`) so nothing is approved for a dismissed cause. A re-scan never reopens a dismissed hypothesis.
- A superseded hypothesis is history: endpoint 22 leaves it out and endpoint 23 answers 409 `HYPOTHESIS_SUPERSEDED` (its status is not in `HypothesisDetail`'s enum).
- Trend `rate` is complaints per order-day of exposure, exactly as stage 4 counts them; weeks are ISO weeks of delivery (of shipping for transit categories), keyed by their Monday.
- Contract change: none.

### I-D12 — Shared Cause and report-problem routes — 2026-11-10

- Endpoint 22 takes the merchant from the token. A1 calls it with `?merchantId=`; the parameter is accepted and must equal the token's merchant (403 otherwise).
- Endpoint 32 accepts files in `photos` or `photos[]` (at most 4, else 400 `TOO_MANY_PHOTOS`) and a required `text`; only the buyer's own paid order (captured or later) can be reported. Photos go through `blobs.put`, so its JPEG/PNG and size checks apply. No ledger entry is written for a report (section 8 names none).
- Clustering precision on `complaints.json` (task I6 gate) needs the real model's extractions and is measured in I7's eval run; it is NOT RUN as of this entry because no provider key is configured locally.
- Contract change: none.

### I-D13 — H1 intelligence stubs retired — 2026-11-10

- The worker registers the real intelligence handler map (9 handlers) and the API registers all 18 intelligence endpoints, so the H1 stand-ins were false. At Ishaan's instruction ("no scaffolding throughout the project") they are removed: `packages/contracts/src/stubs.ts` and its test are deleted (nothing else imported them), `/healthz` returns `intelligence: 'ready'`, the worker logs `intelligence: 'ready'`, and the OpenAPI description no longer says the intelligence endpoints are missing. Hriday's H1 deployment checklist, status and handoff lines that expected the stubs are corrected to match.
- Not changed: Hriday's unbuilt H2–H8 work (checkout, PayPal actions, seed, `test:e2e`) keeps its accurate NOT RUN / not-implemented labels; building it is outside I1–I7.
- Contract change: **yes** — `/healthz`'s `intelligence` literal changes from `stub` to `ready`, and `@fairfold/contracts/stubs` no longer exists. Needs Hriday's review.

### I-D14 — Model provider switched from Grok (xAI) to Google Gemini's free tier — 2026-11-10

- Ishaan cannot add billing, and xAI's API needs paid credits. The Gemini API's free tier needs only a Google AI Studio key, so `.env` now uses `AI_PROVIDER=google` with `GOOGLE_GENERATIVE_AI_API_KEY`. This replaces I-D1's provider choice; the code is unchanged because `packages/ai` already supported Google (D10).
- Gemini also offers embedding models, so `AI_EMBEDDING_PROVIDER=google` with an `AI_MODEL_EMBEDDING` id gives real complaint embeddings; left blank, the local embedding (I-D7) still applies.
- Free-tier rate limits apply. A rate-limited call counts as a failed attempt and then uses the component's fallback, which would lower an eval score without the model being wrong, so eval runs are checked with the call-log summary (`cost`) for failed calls before their numbers are published. Free-tier inputs may be used by Google to improve its products; Fairfold sends only synthetic data, Fairfold ids and no buyer email or street address.
- Contract change: none (environment only). Hriday's `.env.example` still defaults to `openai` and lacks `XAI_API_KEY`; it should list `google` as the team's free option.

### I-D15 — Free-tier quota: retry only schema failures, cache answers, never score a fallback — 2026-11-10

- The first Gemini eval run hit the free tier's daily cap: 60 calls returned `429 RESOURCE_EXHAUSTED` ("Generate content requests per day … limit: 20"). The gateway also retried every failure, so each refusal cost two requests.
- `packages/ai` now retries **only schema failures**, as section 10 states ("a schema failure retries once, then the fallback runs"). A timeout or a provider refusal goes straight to the fallback, and the log line carries the HTTP `status`.
- Model answers can be cached by provider, model, input hash and output schema when `AI_CACHE_DIR` is set (architecture section 21's own fallback: "cache attestation and extraction results by input hash; record the video from cached runs"). Only schema-valid answers are stored, and they are re-validated on read; fallbacks are never cached. The eval runner sets the cache to the ignored `.work/ai-cache`, so a run cut short by the quota resumes without paying twice. The API and worker cache nothing unless the variable is set.
- The photo and complaint evals report `not measured: k of n model calls fell back …` whenever any call fell back, instead of a score. The 2026-11-10 quota-starved run (photos "5 of 20", grouping "1.00") is therefore not a result and is not published.
- Contract change: none.

### I-D16 — CLUSTER_SIMILARITY 0.85 with Gemini embeddings; Gemini models chosen — 2026-11-10

- The task I6 gate (clustering precision ≥ 0.85 on `complaints.json`) measured **0.60** at the default 0.80 with `gemini-embedding-2`, because these embeddings rate short `category | component | failure_mode` strings as very similar. As the plan prescribes, the threshold is raised to **0.85** (`CLUSTER_SIMILARITY=0.85` in the environment; the code default stays section 9's 0.80). Measured on the same 24 texts: 0.85 → precision 1.00 with 45 of 53 same-cluster pairs grouped; 0.88 → 24 of 53; 0.90 → 19 of 53. The threshold was chosen on the evaluation set itself, so it is calibrated rather than independently validated.
- Demo check at 0.85: the five B17 and one B15 seam complaints of the seed plus Maya's live-dispute text form one cluster; size, late and colour complaints stay apart.
- The local embedding (I-D7) grouped 0–1 pairs at any threshold with real model-written phrasing, so it is only a last-resort fallback; the demo needs `AI_MODEL_EMBEDDING=gemini-embedding-2`.
- Models (all free tier, probed 2026-11-10): `gemini-3.5-flash` for vision; `gemini-3.5-flash-lite` for text, which has its own daily quota; `gemini-embedding-2`. `gemini-3.8-flash` and `gemini-3.7-flash` gave no valid answer within the 30-second limit, and `gemini-2.5-flash` was refused.
- For Hriday (Render): set `AI_PROVIDER=google`, the three model ids, `AI_EMBEDDING_PROVIDER=google`, `GOOGLE_GENERATIVE_AI_API_KEY` and `CLUSTER_SIMILARITY=0.85` on both the API and the worker.
- Contract change: none (environment only).

### I-D17 — One Buyer Signal per order, returned from storage after capture — 2026-11-10

- Section 10 says the signal is "computed per order at capture". `computeBuyerSignal(orderId)` (section 15) now returns the order's stored signal when one exists and computes and stores it only on first use. Hriday's merchant order detail calls this function on every read (his DECISIONS.md: "Ishaan … can supply its caching through that seam"); before this change each read inserted a new `buyer_signals` row, spent one model call and could show a band that drifted from the capture-time value.
- The `order.captured` handler and endpoint 9 use the same path, so a redelivered job stores nothing new. Concurrent first calls take a transaction-scoped advisory lock on the order (`pg_advisory_xact_lock`) and re-check before inserting, so exactly one row is written without a schema change.
- An order with no buyer cannot be stored (`buyer_signals.buyer_id` is required) and is scored on each call.
- Contract change: none (the function keeps its section 15 signature; behaviour now matches section 10).

### I-D18 — Safety complaints alert immediately — 2026-11-10

- Section 12 (owner Ishaan): "A complaint with severity = safety raises an immediate alert and blocks automatic buyer messaging." Before this change the alert was raised only when the complaint's cluster produced a significant hypothesis, so a lone safety complaint alerted nobody.
- `readComplaint` now raises `safety_complaint` with `ref_id` = the complaint id and the complaint's order, in the same transaction that stores the extraction. The scan still raises its own `safety_complaint` for a safety-flagged hypothesis (`ref_id` = hypothesis id), and a safety flag still means no buyer message drafts.
- Alerts are raised once per (merchant, type, ref_id). `alerts` has no unique key (Hriday owns the migration), so the check and insert run under a transaction-scoped advisory lock on that triple.
- Contract change: none.

### I-D19 — Buyer photos are described with step buyer_photo — 2026-11-10

- Task I2: "Photos a buyer attaches to a problem report are described with step buyer_photo." Until now only the prompt knew the step; nothing stored such an attestation. `readComplaint` now runs the Evidence Agent on a complaint's readable photos (after the extraction is saved) and stores one `attestations` row with `step = 'buyer_photo'`, the order id, no hypothesis and no batch code. No ledger entry is written: the ledger is the merchant's packing evidence chain, and section 8 names none for a report.
- The status answers "do these photos show the item that was ordered?" (idea doc section 8: the agent "compares the buyer's photos with the packing photos and flags differences — it does not decide"). A visible defect is what the buyer is reporting, so it is not a mismatch; an unreadable size label, the number of units photographed and fields a buyer photo is not expected to show (batch tag, shipping label) are not compared. A different colour, or a readable size label that differs, is `mismatch`; an ordered item that is not visible is `could_not_verify`.
- One attestation per set of photos: a redelivered `complaint.created` job does not call the model again. Photos whose bytes were purged by retention are skipped.
- Contract change: none (`attestations.step` already allows `buyer_photo`).

### I-D20 — Evidence-integrity flags shown in the pack — 2026-11-10

- Section 12, "Evidence integrity": the duplicate-photo check and the EXIF 15-minute rule are Hriday's (ledger, blobs); showing the flag in the pack is Ishaan's. The pack now flags each attested packing photo that (a) is recorded — by SHA-256 — for another order of the same store, using H1's `blobs.photoUsedByMerchant(hash, merchantId)` over ledger `photo` and `inspection` entries, or (b) carries `exifOutsideWindow` / `exifUnreadable` on its ledger `photo` entry.
- Each flagged photo adds one code-written line to `EvidencePackDraft.rationale` (e.g. `Packing photo "item": the same photo is recorded for 1 other order of this store.`) and a FLAG note to its PDF caption. The count of other orders is shown, never their ids.
- Flags inform the merchant and PayPal's reviewer; they do not change the recommendation, because section 10's decision table has no integrity row.
- For Hriday (H5): the ledger `photo` entry payload is expected to carry `label` and, when the EXIF check fires, `exifOutsideWindow: true` or `exifUnreadable: true` (the fields `inspectImage` already computes).
- Contract change: none.

### I-D21 — A pack attestation covers all of the order's packing photos so far — 2026-11-10

- F2 publishes `pack.photos_uploaded` per upload, and the seal checks the latest pack attestation. Attesting each upload alone failed whenever photos were taken one at a time: an upload holding only the sealed parcel reads the item as missing (quantity 0), so the latest attestation is `mismatch` and the seal is refused.
- Each pack attestation now covers this upload plus the photos of the order's latest pack attestation (which already holds every earlier photo). An earlier photo whose label this upload shoots again is a retake and is replaced, so a corrected photo can clear an earlier mismatch. At most 6 photos (the Evidence Agent's limit) are kept, dropping the oldest carried-over photos first. The ledger `attestation` entry lists the photos actually attested.
- An upload whose `batchCodes` is empty keeps the batch code recorded on the latest pack attestation, so the batch's active inspection rule (and its required photo) still reaches the agent.
- One model call per upload, as before; each upload still writes one attestation and one ledger entry.
- Contract change: none (job payload unchanged).

### I-D22 — Section 15 signatures restored, with a compile-time check — 2026-11-10

- Section 15 lists the functions Ishaan provides. Four had drifted to take an `IntelRuntime` (or extra dependencies) first, so code written against the contract — Hriday's H8 seed "ends by running one sharedcause.scan", H7's tools — would not compile: `readComplaint`, `runSharedCauseScan`, `draftBuyerMessages`, `attestPackingPhotos`.
- They now keep the documented signatures and use the process runtime (`getIntelRuntime()`), like `computeBuyerSignal`, `buildStoreReport`, `buildEvidencePack` and `searchCatalog` already did. The runtime-injected forms used by handlers, routes and tests are `readComplaintWith(rt, id)`, `runSharedCauseScanWith(rt, merchantId)`, `draftBuyerMessagesWith(rt, hypothesisId, level)` and `attestPackingPhotosWith(input, deps)`. `readComplaint` returns `Promise<void>` as documented; `draftBuyerMessages` defaults to the suspected level; `attestPackingPhotos` returns the attestation result plus its `status` and `model` (a superset of `AttestationResult`).
- `packages/intelligence/test/db/contract.integration.test.ts` assigns the package to a `Section15` interface, so `pnpm typecheck` fails whenever an export stops matching the contract — the guarantee `@fairfold/contracts/stubs` gave before I-D13 retired it — and exercises the four runtime-bound functions against PostgreSQL.
- Contract change: none (restores section 15).

### I-D23 — Intelligence list endpoints page with ?limit= and ?cursor= — 2026-11-10

- Section 11: "list endpoints accept ?limit= (default 50) and ?cursor=". Endpoints 6, 22, 40 and 42 returned every row and ignored both.
- The convention is the one Hriday's order lists use (origin/Hriday `apps/api/src/orders/read.ts`): the response stays the bare array of section 11; the cursor is the id of the last item the client received; rows are keyset-ordered `created_at desc, id desc`; a cursor that is not an item of that caller's list is 400 `INVALID_CURSOR`.
- The catalogue (endpoint 6) is ordered by `name, sku, id` and, because `CatalogItem` has no id, its cursor is the last item's `merchantId:sku` (`catalogCursor()`), unique per store. Reviews (endpoint 42) are weighted over the whole store first (at most three per buyer count, earliest first), then the page is cut. Shared causes accept a cursor naming any of the merchant's hypotheses, so a page still works if that one was superseded meanwhile.
- `limit` is 1–100 (`IntelListQuerySchema` in `@fairfold/contracts/intel`). Section 11 sets no maximum; one is needed because endpoints 6 and 42 are unauthenticated. Hriday's order lists accept up to 2³¹−1; aligning the two is a review item.
- `searchCatalog(input)` (section 15, the MCP tool) returns the first page of 50 as before.
- Contract change: additive (`IntelListQuerySchema`; query parameters section 11 already promised).

### I-D24 — Cluster centroid is the exact normalised mean of its members — 2026-11-10

- Section 9 stage 3: "recompute the centroid as the normalised mean". The previous update `normalise(centroid × memberCount + v)` treated the stored unit centroid as the members' sum; the sum's length is smaller than the member count unless all members coincide, so the existing members were over-weighted and the centroid drifted from the mean.
- `assignClusters` now keeps each cluster's sum of member unit vectors and sets the centroid to that sum normalised. An existing cluster's sum is rebuilt from its members among the complaints the scan loads (all of the merchant's read complaints), so the result is exact regardless of how the centroid was stored; only a cluster with none of its members passed falls back to its stored centroid weighted by its stored count. Members embedded by a different model (another vector length) are left out of the mean.
- Effect on published numbers: the clustering precision in README.md and docs/ai-tools.md (1.00 over 45 pairs at threshold 0.85, 2026-11-10) was measured with the old update. Re-run `pnpm --filter @fairfold/intelligence eval` before quoting it again; not re-run here because it spends the free-tier model quota.
- Contract change: none.

### I-D25 — Review themes are reused while the store's reviews are unchanged — 2026-11-10

- `storereport.refresh` runs after every review, and `buildStoreReport` also runs on demand; each run called the Review Themer although its input rarely changes. The stored report now carries `themesInputHash`, the SHA-256 of exactly what the themer reads (the first 100 counted reviews' ids, ratings and texts, newest first). When the next build would send the same input, the stored themes are reused and no model call is made; any added, re-weighted out, re-rated or re-worded review changes the hash. A merchant reply is not themer input and changes nothing.
- A fallback (no themes because the model failed) is stored without the hash, so the next refresh asks again instead of keeping an empty theme list.
- `themesInputHash` lives inside `store_reports.report` next to the StoreReport fields. It is not part of the StoreReport contract: `StoreReportSchema` strips it on read, so endpoint 5 and `get_store_report` never return it. No column was added (section 7 unchanged).
- Contract change: none.

### I-D26 — Seed complaints are pre-read; the scan embeds read complaints that have no vector — 2026-11-10

- Section 19 has `scripts/seed.ts` (Hriday, H8) read the complaint texts from `packages/intelligence/eval/fixtures/complaints.json`. Reading the 12 seed complaints through the Complaint Reader would spend 12 generative calls, more than half of the free tier's daily text quota, before the demo starts.
- Each seed complaint in the fixture now carries `extracted`, a hand-written ComplaintExtraction (validated by a test against `ComplaintExtractionSchema`), and `model: "seed"`, the marker section 19 uses for seeded attestations. `complaints` has no model column, so the marker stays in the fixture. The six seam complaints share the fault `sleeve seam | stitching came apart`, so they group together however the embedding model scores paraphrases.
- For H8: insert each seed complaint with `extracted` set from the fixture (and `order_item_id` / `product_id` from the seeded order) and do not publish `complaint.created`; the final `sharedcause.scan` for Neel does the rest.
- `runSharedCauseScan` now embeds every read complaint without an embedding (category `other` excepted) in one `embed()` request before grouping, and stores the vectors. Seeding therefore makes no Complaint Reader call and one embedding request (none when the local embedding is used). The seed's vectors come from the same embedding model as the live complaints, so Maya's live dispute is compared in the same space. The same step re-embeds a complaint whose embedding was never stored.
- The scan's own proposals still cost what they cost: one Message Drafter call for the suspected template (I-D10) and none for the themes when the reviews are unchanged (I-D25).
- Contract change: additive fields in Ishaan's fixture JSON.

### I-D27 — Embeddings follow the same timeout and no-retry policy as other model calls — 2026-11-10

- `generateStructured` had a 30-second timeout and retried only schema failures (I-D15), but `embed()` called `embedMany` with the AI SDK defaults: no timeout and two automatic retries, so a 429 quota refusal cost three embedding requests and a hung provider could hold a `complaint.created` job indefinitely.
- `embed()` now makes one attempt with `maxRetries: 0` and a 30-second abort (`MODEL_TIMEOUT_MS`), and logs every call with `ok`, latency, count and, on failure, the error name and HTTP status, like `ai_call` lines. A failure is thrown: an embedding has no meaningful fallback (a local vector lives in another space and would not group with the rest).
- Callers degrade instead of failing: the Complaint Reader saves the extraction with no embedding and still schedules the scan; the scan leaves complaints whose embedding request failed ungrouped and goes on. The next scan embeds them in its single batched request (I-D26).
- Contract change: none.

### I-D28 — Length limits on model text are applied by code, not by the schema the model sees — 2026-11-10

- A `.max()` in the schema passed to `generateObject` turns an answer that is one character too long into a schema failure, a retry and then the fallback. On the free tier that is two requests for nothing, and for the Complaint Reader the fallback is category `other`, which never groups: a 141-character summary removed a real seam complaint from Shared Cause Detection.
- The schemas the models fill now have no length limits; code applies them (`src/text.ts`): the complaint summary is cut to 140 characters at a word with an ellipsis (a language code shorter than 2 becomes `und`) and the result is still validated against the contract's `ComplaintExtractionSchema`; a theme label is cut to 60 characters and at most 8 themes are kept; the Buyer Signal sentence (240) and the dispute narrative (2,000) keep the whole sentences that fit, and the narrative's grounding check runs on the cut text.
- Buyer messages are not cut: a message body cut mid-sentence would be sent to a buyer, so a template that does not fit falls back to the fixed template (I-D10).
- Contract change: none (`ComplaintExtractionSchema` still enforces 140 characters on what is stored).

### I-D29 — Wording post-checks on the Buyer Signal sentence and review-theme labels — 2026-11-10

- The submission requires that a Buyer Signal "never" recommends cancelling ("recommended actions never include cancel", "no auto-cancel, no auto-refusal"), and that the Store Report uses "neutral wording ('what we found'), never an AI adjective". Both rules were only in the prompts.
- The Buyer Signal sentence is now checked by code: wording that tells the merchant to cancel (`cancel`, `cancelling`, `cancellation`), not to ship (`do not ship`, `don't ship`) or to refuse the order is replaced by the template sentence, which is built from the reason labels and never contains such words.
- A review-theme label must name a topic in neutral words: a label containing praise, disparagement or an accusation (a fixed list such as great, amazing, poor, terrible, scam, fake, fraud, rip-off, avoid, unreliable) is not shown. Dropping the theme is section 10's documented fallback for the themer ("themes omitted; counts and ratings still shown"); its reviews still count. The prompt now also asks for topic-only labels.
- Contract change: none.

### I-D30 — Emails and phone numbers are removed from buyer text before any model call — 2026-11-10

- Section 10: "Inputs carry no raw email or street address". Stored email and address fields were never sent, but a buyer can type an email address or a phone number into a problem report, a review or a PayPal dispute message, and that text reached the Complaint Reader and the Review Themer verbatim. The README claimed more than the code did.
- `generateStructured` now passes every untrusted text through `removeContactDetails` (packages/ai) before it is wrapped, hashed and sent: email addresses become `[email removed]` and phone numbers (7–15 digits, optionally with `+` or `00`, spaces, dots, dashes or brackets, not inside a longer word) become `[phone removed]`. Dates, prices, quantities, SKUs, ids such as `FF-<uuid>` and carrier tracking numbers that run into letters are kept. A bare 7–15 digit number is removed even when it is not a phone number; for the Complaint Reader and the Review Themer that loses nothing they need.
- A street address typed into free text is not detected; README.md and docs/ai-tools.md now say so instead of claiming no street address is ever sent.
- Contract change: none.

### I-D31 — Catalogue search matches every word against name, SKU, colour and description — 2026-11-10

- `searchCatalog` (endpoint 6, MCP `search_catalog`) matched the whole query as one substring of the name or the SKU. A13's shopping agent asks for "navy hoodie": the seeded hoodie is named "Block-print cotton hoodie", so the phrase never matched and the agent found nothing.
- The query is now split on whitespace and every word must appear (case-insensitive substring, `%` and `_` escaped) in the product's name, SKU, colour or listing description; `maxPrice` and paging are unchanged. "navy hoodie" finds a hoodie whose colour is navy; "navy" alone finds every navy product.
- For H8: A13 relies on the seeded HD-IND-01 having `colour = 'navy'` (or "navy" in its description); section 19 does not state the hoodie's colour.
- Contract change: none.

### I-D32 — Jobs are sent in the transaction that writes their rows; the sweep re-reads unread complaints — 2026-11-10

- Every intelligence job was published after its rows committed. A crash, a deploy or a queue error between the commit and the publish left a stored complaint that was never read (it never reaches Shared Cause Detection), or a hypothesis change whose packs were never rebuilt.
- The intelligence `Publisher.publish(name, payload, { tx })` now sends the job inside the caller's drizzle transaction: `jobsPublisher(jobs)` adapts Hriday's `createJobs` queue and hands the transaction to pg-boss through pg-boss's own drizzle adapter (`fromDrizzle`, pg-boss 12.38.1, the version `@fairfold/jobs` pins; added as a direct dependency of `@fairfold/intelligence`), the same mechanism as Hriday's `{ db }` publish option. A test against PostgreSQL shows a job sent in a rolled-back transaction does not exist.
- In the transaction now: `complaint.created` with the complaint (report-problem, low review, new dispute), `storereport.refresh` with the review, `evidence.rebuild` with the Confirm and with each scanned hypothesis (one job per hypothesis instead of one per scan).
- Not in a transaction: the debounced `sharedcause.scan` after a complaint is read, because Hriday's `publishDebounced` has no transaction option. A lost one is covered by the nightly sweep's scan.
- The nightly `sharedcause.sweep` first re-sends `complaint.created` for every complaint still unread more than an hour after it was stored (`UNREAD_GRACE_HOURS`), so a job that is merely still queued is not doubled.
- Contract change: additive optional parameter on the intelligence-internal `Publisher`; new export `jobsPublisher`.

### I-D33 — Concurrency: one scan per merchant, queued sweep scans, atomic upsert, conditional Confirm/Dismiss/resolve — 2026-11-10

- Scan lock. A debounced `sharedcause.scan`, the sweep's scan and a direct `runSharedCauseScan` can overlap; two scans reading the same unassigned complaints each created clusters and a hypothesis (two B17 hypotheses in the new test). `runSharedCauseScan` now holds a session-level advisory lock per merchant (`pg_advisory_lock(hashtextextended('fairfold:scan:<merchant>'))`) on a dedicated pool connection for the whole scan; the scan's own transactions stay short. A second scan waits, then finds the first one's work and changes nothing.
- The hypothesis update in the scan sets the status from the row's current value (`case when status = 'superseded' then 'open' else status end`) instead of the value read earlier, so a Confirm or Dismiss committed during a scan is never undone.
- The nightly `sharedcause.sweep` queues one `sharedcause.scan` job per merchant with read complaints instead of running every scan inside the sweep job.
- `upsertComplaint` is one `insert … on conflict (source, source_ref) do update` that appends the text; concurrent syncs of one dispute store one row with every text, and exactly one call reports `isNew` (Postgres `xmax = 0`). It used to select then insert, so concurrent calls failed on the unique key.
- Confirm (`status = 'open'`), Dismiss (`status in ('open','confirmed')`) and contest resolution (`status = 'open'`) are conditional updates checked inside their transaction; the losing request of a double click gets 409 (`HYPOTHESIS_NOT_OPEN`, `CONTEST_RESOLVED`) and inserts no second `propose_offers`, `release_orders` or drafts.
- Contract change: none.

### I-D34 — Hypothesis lifecycle: withdraw on supersede, retire when not significant, release the rule on dismiss — 2026-11-10

- Superseded. When a cluster's primary value changes, the earlier open hypothesis was set to `superseded` but its proposed holds, inspection rule and buyer messages stayed proposed, so the merchant could still approve them. They are now withdrawn (`status: failed`, `result: { withdrawn: 'hypothesis_superseded', reason: 'The shared cause now points to batch B17.' }`).
- Retired. An open hypothesis that a scan no longer finds — its cluster is no longer eligible or no value passes the thresholds — stayed open for ever. The scan now retires it: status `superseded` (no new status; a retired hypothesis reopens on the same row if it becomes significant again), proposals withdrawn with `hypothesis_retired`. Confirmed hypotheses are never retired by the scan.
- Whatever a superseded, retired or dismissed hypothesis put in place is proposed for release in one `release_orders` action: the orders it holds and the active inspection rules it created (`inspection_rules.created_by_hypothesis_id`). Section 7 has no action type for switching a rule off and adding one is a shared-contract change, so the rule ids travel in the release payload: `{ orderIds, inspectionRuleIds, reason }`. Dismiss now proposes the release even when no orders are held, if the hypothesis created a rule.
- Executor (M8, 2026-11-11, in Hriday's `packages/paypal/src/action-execution.ts`, for his review): an approved `release_orders` now also sets `inspection_rules.active = false` for `inspectionRuleIds` (only rules of the hypothesis's merchant, else `ACTION_OWNERSHIP_FAILED` and nothing changes), accepts an empty `orderIds` when it switches off a rule, and records `inspectionRuleIds` in its result. A release with neither is still `ACTION_PAYLOAD_INVALID`. Four PostgreSQL tests in `packages/paypal/test/action-execution.integration.test.ts`, the executor's first. Not changed: section 8's "batch active" (the executor does not set `inventory_batches.status`), which stays with Hriday.
- A reopened hypothesis withdraws its pending release (`hypothesis_reopened`) and proposes again: holds for orders it does not hold now (held orders and approved-but-not-executed holds count; withdrawn or released holds do not), the inspection rule unless one is proposed, approved or done, and buyer messages for buyers whose drafts were withdrawn (the stored template is reused, so no model call).
- Contract change: additive field `inspectionRuleIds` in the `release_orders` payload; new `withdrawn` reasons in action results.

### I-D35 — No pack rebuild for a resolved dispute or after a pack was approved or submitted — 2026-11-10

- `dispute.synced`, `evidence.rebuild` (from a scan, a Confirm or a dispute update) and endpoint 19 rebuilt the pack whenever asked: after PayPal resolved the dispute, or after the merchant had approved a pack or it had been submitted, each rebuild superseded nothing useful and added a new draft beside the pack PayPal already has, inviting a second submission.
- `buildEvidencePack` now refuses with 409 `DISPUTE_RESOLVED` when the dispute has `resolved_at` or status `RESOLVED`, and with 409 `PACK_SUBMITTED` when a pack for the dispute is `approved` or `submitted`. A pack whose submission `failed` can still be rebuilt. The job handlers skip such disputes instead of failing; endpoint 19 returns the 409.
- `approved` is included although the task names only "submitted": an approved pack is the one Hriday's `evidence.submit` is about to file, and a new draft beside it would have to be approved again.
- The buyer's later messages still reach the dispute's complaint (Shared Cause Detection uses them); only the pack is frozen.
- Contract change: two new 409 codes on endpoint 19 and `buildEvidencePack`.

### I-D36 — A dispute complaint carries every place the buyer wrote, not just the first message — 2026-11-10

- Section 9's table takes a dispute's text from "dispute reason, the buyer's notes in the dispute details, and the first buyer message"; the code took only the reason and the first buyer message, and a later sync added only the messages the job listed.
- `buyerTexts(raw)` reads every field of PayPal's dispute object (customer-disputes v1 OpenAPI schema, checked 2026-11-10) that carries the buyer's words: the customer-provided issue details (`extensions.merchandize_dispute_properties` and `billing_dispute_properties.credit_not_processed`: product and service `description`, service `note`), item-level `notes` and details in `disputed_transactions[].items[]`, `supporting_info[]` and `evidences[]` notes with `source: SUBMITTED_BY_BUYER`, every `messages[]` entry `posted_by: BUYER` (an entry without `posted_by` counts as the buyer's, as before), and `offer.history[]` notes with `actor: BUYER`. Seller and arbiter text is left out; an unexpected shape is skipped, never thrown on.
- The first sync stores the reason followed by all of it; every later sync appends whatever buyer text from the stored payload or the job's `newBuyerMessages` is not yet in the complaint, so a message is added once even if the job did not list it.
- Contract change: none.

### I-D37 — The API and the worker pass their database and job queue into the intelligence package — 2026-11-10

- The intelligence services resolve their database and job queue from a process runtime. Nothing set it in the API or the worker, so on first use it built its own: a second `pg` pool (10 connections) beside the host's and, through `lazyPublisher`, a second pg-boss instance with its own pool and maintenance. On Render's small Postgres plan that doubles the connections each process holds.
- `bindIntelRuntime({ db, jobs, clock?, env? })` sets the process runtime from the host's own drizzle database and `createJobs` queue (adapted by `jobsPublisher`, so `{ tx }` publishes still go in the caller's transaction). Only a process that binds nothing — a script or an eval — still builds a runtime from `DATABASE_URL`.
- Since the M1 merge (2026-11-11) the binding lives in Hriday's runtime modules: `createRuntime` (apps/api/src/runtime.ts) calls `bindIntelRuntime({ db: database.db, jobs })` right after creating them, and `createWorkerRuntime` (apps/worker/src/runtime.ts) calls it with the worker's clock as well (M5). PostgreSQL tests check both: the API's intelligence runtime resolves with `DATABASE_URL` unset, and a job the intelligence runtime publishes lands in the worker's own queue schema.
- `bindIntelRuntime` takes any queue with `publish(name, payload, { db })` and `publishDebounced(name, key, seconds)` (`HostJobs`); the queue `createJobs` returns fits it as is.
- Contract change: additive exports `bindIntelRuntime`, `jobsPublisher`, `HostJobs`, `PublishOptions`.

### I-D38 — Intelligence settings in the Render Blueprint — 2026-11-11

- `render.yaml` had no intelligence settings, so a Render deployment would run every model component on its fallback, and Shared Cause Detection would group at the code default `CLUSTER_SIMILARITY` of 0.8 instead of the measured 0.85 (I-D16).
- Both `fairfold-api` and `fairfold-worker` now set the same plain values as the local `.env`: `AI_PROVIDER=google`, `AI_MODEL_VISION=gemini-3.5-flash`, `AI_MODEL_TEXT=gemini-3.5-flash-lite`, `AI_EMBEDDING_PROVIDER=google`, `AI_MODEL_EMBEDDING=gemini-embedding-2`, `CLUSTER_SIMILARITY=0.85` and the four `SHARED_CAUSE_*` thresholds (14 days, 3 complaints, rate ratio 3, q 0.05). Both services need them: the API answers Confirm (Message Drafter), store reports (Review Themer) and buyer-signal reads; the worker runs every job.
- The Gemini key is a secret: `GOOGLE_GENERATIVE_AI_API_KEY` is `sync: false` on the API, and the worker reads it with `fromService` (`envVarKey`), the same pattern as `APP_ENCRYPTION_KEY`. Render prompts for `sync: false` values only when the Blueprint is first created and ignores them on later syncs; no Fairfold Blueprint exists yet, so it will be prompted then.
- The updated Blueprint and Hriday's original both validate against Render's official JSON Schema (draft 2020-12; schema SHA-256 `8a3fb8da6b4f55fe686fbefa790e011d3dd7895f013f355953c572a21ab6494a`, the digest Hriday recorded).
- Review item for Hriday: his deployment guide and the conditional handoff say to supply only `APP_ENCRYPTION_KEY` at creation; with this change the dashboard also asks for the Gemini key (a free Google AI Studio key). Without a key every model step uses its fallback and the rest of the app still works.
- Contract change: none.

### I-D39 — The Pack Station reads the packing attestation and applies section 8's inspection and hold rule — 2026-11-11

- Found while merging (M9), in Hriday's `apps/api/src/packing/service.ts`, changed for his review. Section 8 F2: the seal is refused with `INSPECTION_REQUIRED` when "an active rule covers one of the batch codes and no photo labelled with the rule's required_photo_label has an attestation with inspection.defectVisible = false", and with `ORDER_HELD` when the order is "held, and no passing inspection photo yet".
- The check accepted only an attestation with step `inspection`. The Evidence Agent attests a packing upload with step `pack` (all of the order's photos so far, with the rule's inspection result inside, I-D21); step `inspection` is for batch inspections, which have no order. So no order under an inspection rule could ever pass, and B17 orders could never be sealed (A11). The check now accepts step `pack` (and `inspection`) with status `match`, the rule's photo label and `defectVisible === false`.
- `ORDER_HELD` was raised for every held order; it is now raised only while the order has no passing inspection photo, as section 8 says, so a held B17 order whose seam close-up shows no defect can be sealed.
- The pack state, the override and the seal read the order's latest attestation of any step; a buyer's photo check (step `buyer_photo`, I-D19) written after packing could become the "latest" and block or mislabel the seal. All three now read the latest step `pack` attestation.
- Three PostgreSQL tests in Hriday's `apps/api/test/packing.integration.test.ts` insert attestations in the Evidence Agent's shape: the rule passes only on the close-up without the defect and the order then seals; a held order is `ORDER_HELD` until a passing photo and then seals; a later buyer-photo check leaves the packing attestation in charge.
- Contract change: none (section 8 behaviour).

### I-D40 — Review item for Hriday: keep the buyer's written dispute fields in the sanitised dispute — 2026-11-11

- Not changed in code (M10): it decides which buyer data is persisted, which is Hriday's to settle under Q3 and his dispute retention policy.
- Section 9 stage 1 takes a dispute complaint's text from "dispute reason, the buyer's notes in the dispute details, and the first buyer message". `buyerTexts` (I-D36) reads every buyer-written field of PayPal's dispute object (customer-disputes v1): the customer-provided issue details (`extensions.merchandize_dispute_properties` and `billing_dispute_properties.credit_not_processed`: product and service `description`, service `note`), item `notes` in `disputed_transactions[].items[]`, `supporting_info[].notes` and `evidences[].notes` with `source: SUBMITTED_BY_BUYER`, `messages[]` with `posted_by: BUYER`, and `offer.history[].notes` with `actor: BUYER`.
- `sanitizeDisputeDetail` (packages/paypal/src/dispute-policy.ts), which writes `disputes.raw`, keeps the messages (content redacted with `redactMessage` for the order's known emails and street lines) but keeps `evidences` without their notes, `disputed_transactions` with only `seller_transaction_id`, and drops `supporting_info`, `offer` and `extensions`. On Hriday's data the dispute complaint therefore gets the reason and every buyer message, but none of the buyer's other notes.
- Suggested change for his review: keep, in the same PayPal shape, only those buyer-authored fields (not seller or arbiter text), each passed through `redactMessage` like the messages, so `buyerTexts` reads them unchanged and no contract changes. Suggested test: a `dispute-policy` unit test that a buyer `supporting_info` note survives redacted while a seller note does not; I-D36's PostgreSQL test then covers the rest.
- Alternative if he prefers not to persist them: list them in `dispute.synced` (`newBuyerMessages`) instead; that needs no stored copy but is a job-contract change.
- Contract change: none proposed.
