# Contract and handoff inventory

This inventory is derived from architecture sections 7–8, 11 and 14–17. It makes ownership and integration visible without replacing the original schemas. All endpoints, jobs and tables below are **PLANNED**, not implemented. The API table retains the source numbering, auth, ownership and response labels.

## Ownership and handoff

| Surface | Hriday provides | Ishaan provides | Review or integration gate |
| --- | --- | --- | --- |
| Shared contracts | Initial types, Zod boundaries, jobs, valid stubs, clock and crypto | Intel route schemas in `packages/contracts/src/intel.ts` | Both review changes; keep original field names |
| Database | Drizzle schema/migrations, client and typed tables | Reads/writes owned intelligence records | SQL section 7 is authoritative |
| Jobs and worker | publish/work/schedule/debounce, process bootstrap, platform handlers | Intelligence handler maps | Register both maps without editing the other's implementation |
| Ledger and files | `ledger.append`, `ledger.verify`, `blobs.put`, `blobs.get` | Attestations and PDF files through these interfaces | One canonicalization/hash rule; PDFs preserved |
| PayPal | `paypal.forMerchant(merchantId)` and all typed vendor operations | Evidence JSON, recommended action and parameters | Ishaan does not bypass the client or execute money actions |
| Evidence Agent | Photo bytes, labels, batch codes, order items and inspection context | `attestPackingPhotos(input)` and persisted results | Current order/rule/result must agree before sealing |
| Buyer Signal | Capture/history data, auth and owner-scoped routes host | `computeBuyerSignal(orderId)` and contest routes | New buyers grey; no cancellation recommendation |
| Store Report/catalogue | Fulfilment/payment records and API host | `buildStoreReport(merchantId)`, `searchCatalog(input)` | Cited themes and correct denominators |
| Disputes | Authoritative sync, approvals, submission worker, vendor response and ledger | `buildEvidencePack(disputeId)`; packs and drafts | Recheck current stage and approval before execution |
| Shared causes | Approved holds/rules/messages/refunds, inspection photo upload | `readComplaint`, `runSharedCauseScan`, confirm/dismiss, drafts and proposals | Shared context stays out of filed evidence |
| Messages | Sends approved messages and records result | `draftBuyerMessages(hypothesisId, 'suspected' or 'confirmed')` | No unsolicited/automatic real-world messaging |
| Seed and eval | Deterministic seed script and deployed integration runs | Complaint/review/buyer/dispute/photo fixtures and measured eval table | Distinguish SEED IDs, seed attestations and real sandbox records |
| Frontend | REST/OpenAPI, errors, demo auth, unstyled `/dev` | Intel response schemas | Figma owner binds UI; neither backend owner redesigns it |

After H1, the handoff to Ishaan contains the reviewed contracts commit, import paths, migration command, stub mode, actual OpenAPI URL, job registration convention and outstanding questions. It must not contain app secrets. Ishaan's return handoff contains intel schemas, implementation commit, fixture paths, measured evals and accurate AI usage wording. This is a prepared handoff checklist; no message or pull request has been sent.

## All 42 endpoint contracts

`H` = Hriday; `I` = Ishaan. List pagination is limit 50 by default plus cursor. Authenticated requests use the role token; subject and resource ownership still need checking. Preserve the public checkout exceptions exactly as specified and protect their order context. The frontend calls Fairfold REST, never PayPal REST; only PayPal's browser SDK runs client-side.

| No. | Method and path | Auth | Owner | Request | Response |
| --- | --- | --- | --- | --- | --- |
| 1 | POST /api/auth/demo-login | none | H | { role: 'merchant' \| 'buyer' \| 'admin' \| 'agent', subjectId } | { token, role, subjectId } |
| 2 | GET /api/checkout/config?merchant=<slug> | none | H | — | { clientId, merchantId, currency } |
| 3 | POST /api/checkout/orders | buyer or none | H | { merchantId, items: [{ sku, quantity }], shipping } | { orderId, paypalOrderId } |
| 4 | POST /api/checkout/orders/:paypalOrderId/capture | buyer or none | H | — | OrderSummary |
| 5 | GET /api/stores/:merchantId/report | none | I | — | StoreReport |
| 6 | GET /api/catalog?q= | none | I | — | [{ merchantId, sku, name, price, storeBand }] |
| 7 | GET /api/merchant/orders?status= | merchant | H | — | [OrderRow] with buyerSignal, hold, alerts |
| 8 | GET /api/orders/:id | merchant, own buyer | H | — | OrderDetail (below) |
| 9 | GET /api/orders/:id/buyer-signal | merchant | I | — | BuyerSignal |
| 10 | POST /api/orders/:id/pack/photos | merchant | H | multipart: photos[], labels[], batchCodes (JSON { [orderItemId]: code }) | 202 { photoShas[] } |
| 11 | GET /api/orders/:id/pack | merchant | H | — | { photos[], attestation \| null, inspectionRule \| null, batches[], canSeal, blockers[] } |
| 12 | POST /api/orders/:id/pack/override | merchant | H | { reason } | { ok } — records a ledger entry |
| 13 | POST /api/orders/:id/pack/seal | merchant | H | { batchCodes, carrier, carrierNameOther?, trackingNumber, packer } | OrderDetail or 409 { error.code } |
| 14 | GET /api/orders/:id/ledger | merchant, own buyer | H | — | { entries[], verified, brokenAtSeq \| null } |
| 15 | GET /api/merchant/alerts | merchant | H | — | [Alert] |
| 16 | POST /api/merchant/alerts/:id/ack | merchant | H | — | { ok } |
| 17 | GET /api/merchant/disputes | merchant | H | — | [DisputeRow] |
| 18 | GET /api/disputes/:id | merchant | H | — | { dispute, order, packs[], timeline[] } |
| 19 | POST /api/disputes/:id/packs | merchant | I | — (rebuild now) | EvidencePackDraft |
| 20 | GET /api/disputes/:id/packs/:packId/pdf | merchant | I | — | application/pdf |
| 21 | POST /api/disputes/:id/packs/:packId/approve | merchant | H | { recommendation? (required for merchant_decides), offerType?, acceptClaimType?, amount?, note? }; 409 PACK_NOT_ACTIONABLE for inspect_first | { status: 'approved' } |
| 22 | GET /api/shared-causes | merchant | I | — | [HypothesisSummary] |
| 23 | GET /api/shared-causes/:id | merchant | I | — | HypothesisDetail (below) |
| 24 | GET /api/shared-causes/:id/trend | merchant | I | — | { weeks: [{ weekStart, value, rate, n, k }] } |
| 25 | POST /api/shared-causes/:id/actions/:actionId/approve | merchant | H | { edits? } | { status } |
| 26 | POST /api/shared-causes/:id/confirm | merchant | I | none — counts come from the inspection attestations | HypothesisDetail |
| 27 | POST /api/shared-causes/:id/dismiss | merchant | I | { reason } | HypothesisDetail |
| 28 | GET /api/merchant/messages?status=draft | merchant | H | — | [Message] |
| 29 | POST /api/reviews/:id/reply | merchant | I | { text } | Review |
| 30 | GET /api/buyer/orders | buyer | H | — | [OrderSummary] |
| 31 | GET /api/buyer/orders/:id | buyer | H | — | OrderDetail without merchant-only fields (no buyer signal) |
| 32 | POST /api/buyer/orders/:id/report-problem | buyer | I | multipart: text, photos[] (≤ 4) | { complaintId } |
| 33 | POST /api/buyer/orders/:id/review | buyer | I | { rating, text } | Review |
| 34 | GET /api/buyer/signal?merchantId= | buyer | I | — | { band, reasons[], simulatedNetworkUsed } |
| 35 | POST /api/buyer/signal/contest | buyer | I | { signalId, text } | { contestId } |
| 36 | GET /api/buyer/messages | buyer | H | — | [Message] sent to this buyer |
| 37 | POST /webhooks/paypal/:merchantSlug | PayPal signature | H | PayPal event | 200 |
| 38 | POST /mcp | bearer (agent token) | H | MCP streamable HTTP | MCP |
| 39 | POST /api/shared-causes/:id/inspections | merchant | H (stores photos); I (attests via inspection.uploaded) | multipart: photos[], labels[] (the rule's photo label) | 202 { photoShas[] } |
| 40 | GET /api/merchant/signal-contests | merchant | I | — | [SignalContest] |
| 41 | POST /api/merchant/signal-contests/:id/resolve | merchant | I | { status: 'upheld' \| 'corrected', merchantNote } | SignalContest |
| 42 | GET /api/stores/:merchantId/reviews | none | I | — | [Review] with merchant replies |

The demo-only routes additionally include POST `/api/dev/seed`, POST `/api/dev/shipments/:id/scan`, POST `/api/dev/shipments/:id/deliver`, POST `/api/dev/disputes/:id/adjudicate`, and GET `/dev`. DEMO_MODE must gate them. `/healthz` and `/docs` belong to H1. No new UI route is implied by this table.

## Jobs and triggers

The exact payload schemas live in the H1 shared contract. The original specifies some payload fields explicitly and leaves others to that contract; this inventory does not invent missing wire shapes.

| Job | Publisher or trigger | Handler owner | Original behavior |
| --- | --- | --- | --- |
| `order.captured` | Checkout/capture sync | I | Compute Buyer Signal for the order |
| `pack.photos_uploaded` | H upload route | I | Attest orderId, photoShas, labels and batchCodes |
| `tracking.push` | H after seal commit | H | Push tracking; three retries; final-failure alert |
| `paypal.event` | H verified persisted event | H | Reconcile capture/refund or authoritative dispute sync |
| `dispute.synced` | H sync | I | disputeId, isNew, newBuyerMessages; one complaint and evidence draft |
| `disputes.poll` | One-minute schedule per real merchant | H | Updated-since reconciliation through same sync handler |
| `evidence.submit` | H approved pack route | H | Re-fetch, guard, execute and retain actual response |
| `evidence.rebuild` | Stage change or confirmed shared cause | I | Rebuild affected dispute pack or packs |
| `complaint.created` | Buyer report, review or dispute sync | I | Extract and embed; debounce scan |
| `sharedcause.scan` | Debounced 60 seconds by merchant or seed | I | Stable groups, stats, hypotheses, affected sets, proposals |
| `sharedcause.sweep` | 02:00 IST nightly | I | Scan every merchant |
| `inspection.uploaded` | H batch inspection upload | I | hypothesisId, batchCode and photoShas; persist attestation |
| `action.approved` | H approval route | H | Execute approved action and record result |
| `storereport.refresh` | Tracking push or resolved dispute | I | Recompute report |
| `watchdog.sweep` | Every 15 minutes | H | Gap, seal overdue and dispute deadline alerts |
| `retention.sweep` | Nightly | H | Purge expired evidence bytes, preserve hashes/rows |

Use UTC for persisted/scheduled timestamps; 02:00 IST corresponds to 20:30 UTC on the preceding calendar date. Set scheduler timezone explicitly or make the conversion explicit; do not depend on a host timezone.

## Table ownership

| Group | Exact tables | Writer |
| --- | --- | --- |
| Merchant/buyer/catalogue | merchants, buyers, products, inventory_batches | H for seed/checkout |
| Orders/fulfilment | orders, order_items, shipments, evidence_blobs, ledger_entries, inspection_rules | H |
| PayPal mirror | paypal_events, disputes | H |
| Intelligence | attestations, evidence_packs, buyer_signals, signal_contests, buyer_network_simulated, store_reports, reviews, complaints, complaint_clusters, hypotheses | I; H writes pack approval/submission state |
| Shared execution records | alerts, actions, messages | I proposes/drafts; H executes and stores status/result; each owns its alert types |

There are 25 tables. Read architecture section 7 for every column, key, constraint and index. A summary table is insufficient to implement the migration. `complaints` has one row per source/source_ref; later messages append to the same dispute complaint. Do not create a fourth `dispute_message` source value from the ingest narrative table; the SQL enum and event-flow rule keep it as `dispute`.

## Cross-boundary invariants

- Vendor capture ID maps to `orders.paypal_capture_id`; invoice `FF-<order uuid>` is the fallback. Keep provider IDs verbatim. Never send SEED IDs to PayPal.
- Money crossing an API is `{ currency_code, value }` with decimal-string value. Database money is numeric(12,2); no floating-point amount arithmetic.
- `dispute_life_cycle_stage` is the PayPal field; `life_cycle_stage` is the database column. Application response `lifeCycleStage` is separate again. Map deliberately.
- `EvidencePackDraft.actionParams.amount`, stored action_params and approval amount need the explicit Q4 mapping. Do not rely on structurally similar unvalidated objects.
- `inspection` attestations may have no order_id and use hypothesis_id. The order-ledger helper cannot append to a null order.
- Photo SHA-256 identifies normalized stored bytes; the ledger hashes server time at exactly millisecond precision. The verification algorithm must match both writers.
- The five seal errors are ORDER_HELD, INSPECTION_REQUIRED, ATTESTATION_MISMATCH, BATCH_MISMATCH and TRACKING_LABEL_MISMATCH. Override only the attestation mismatch.
- Stage change is STAGE_CHANGED; inspect-first approval is PACK_NOT_ACTIONABLE. HTTP errors use `{ error: { code, message, details } }`.
- Public/buyer responses omit merchant-only signals and shared investigation information. An agent token does not automatically own every private order.
- Unit tests may use fixed stubs; the final demo/evals may not present stub model='seed' attestations as live vision output.

## Environment inventory for H1

This is the source-defined inventory, not an `.env` file or installed configuration. No values or credentials have been supplied in this pass.

| Variable | Purpose or required shape | Secret |
| --- | --- | --- |
| DATABASE_URL | Local/Render Postgres connection | Yes if credentials included |
| APP_BASE_URL | Actual public API URL for links/webhooks | No |
| FRONTEND_ORIGIN | Authorized Figma frontend origin for CORS | No |
| APP_ENCRYPTION_KEY | 32 random bytes encoded base64 for AES-256-GCM | Yes |
| DEMO_TOKEN_SECRET | Random signing secret for seeded role tokens | Yes |
| PAYPAL_API_BASE | Exactly https://api-m.sandbox.paypal.com | No |
| PAYPAL_CLIENT_ID | Neel sandbox REST app identifier | Configuration; keep with private app setup |
| PAYPAL_CLIENT_SECRET | Same sandbox app secret, encrypted into merchant record | Yes |
| PAYPAL_BUYER_EMAIL | Maya sandbox identity, private test setup | Personal/test configuration |
| AI_PROVIDER | openai, anthropic or google, selected by Ishaan via environment | No |
| AI_EMBEDDING_PROVIDER | Separate openai/google provider when needed | No |
| AI_MODEL_VISION | Configured vision model ID | No |
| AI_MODEL_TEXT | Configured text model ID | No |
| AI_MODEL_EMBEDDING | Configured embedding model ID | No |
| OPENAI_API_KEY | Only if selected provider requires it | Yes |
| ANTHROPIC_API_KEY | Only if selected provider requires it | Yes |
| GOOGLE_GENERATIVE_AI_API_KEY | Only if selected provider requires it | Yes |
| SHARED_CAUSE_HORIZON_DAYS | Default 14; transit not_received horizon remains 30 per statistics spec | No |
| SHARED_CAUSE_MIN_COMPLAINTS | 3 | No |
| SHARED_CAUSE_MIN_RATE_RATIO | 3 | No |
| SHARED_CAUSE_MAX_Q | 0.05 | No |
| CLUSTER_SIMILARITY | 0.80 | No |
| DEMO_MODE | true for sandbox demo; gates demo-only routes | No |

The registered webhook ID is stored per merchant in the database, not introduced here as a new global env variable. PayPal's optional standalone MCP uses PAYPAL_ENVIRONMENT=SANDBOX and a private PAYPAL_ACCESS_TOKEN; those are tool-specific settings, not a reason to expand the application's core contract. Do not persist OAuth tokens.
