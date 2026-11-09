# H2 checkout and order integration

Updated 9 November 2026 IST. This is the implemented local API handoff, grounded in original F1 and endpoints 2/3/4/7/8/30/31. Real PayPal A4, recorded vendor fixtures, Maya’s purchase and H1 Render hosting remain pending. Complete PayPalClient/ForMerchant methods outside the implemented checkout subset remain future work; no throwing placeholders are exposed.

## Implemented HTTP surface

| Endpoint                                         | Access                        | Success                             |
| ------------------------------------------------ | ----------------------------- | ----------------------------------- |
| GET /api/checkout/config?merchant=slug           | Public                        | 200: clientId, merchantId, currency |
| POST /api/checkout/orders                        | Guest or buyer                | 201: orderId, paypalOrderId         |
| POST /api/checkout/orders/:paypalOrderId/capture | Guest or matching known buyer | 200: OrderSummary                   |
| GET /api/merchant/orders?status=&limit=&cursor=  | Owning merchant               | 200: OrderRow array                 |
| GET /api/orders/:id                              | Owning merchant or buyer      | 200: role-projected OrderDetail     |
| GET /api/buyer/orders?limit=&cursor=             | Owning buyer                  | 200: OrderSummary array             |
| GET /api/buyer/orders/:id                        | Owning buyer                  | 200: buyer-projected OrderDetail    |

OpenAPI at /docs/ and /docs/json is generated from the actual schemas. Private calls send Authorization: Bearer with an existing demo token; tokens/credentials do not belong in committed examples. The configured API normally uses port 3110 in this workspace. A separate temporary process on 3112 verified the real bootstrap and was stopped after the smoke check; that test is not a hosted URL.

## Create and approve

Fetch public config for the actual merchant slug. Configure the sandbox JS SDK with only the returned clientId and paypal-payments component. POST the unchanged body: merchantId, items with sku/quantity, and optional shipping. The browser cannot choose prices, listing version, capture amount, merchant credentials or PayPal REST URLs. The API snapshots the merchant’s products, creates the vendor order with source IDs, and atomically stores the order/items. Browser SDK approval uses paypalOrderId; Fairfold orderId identifies the internal order.

The catalogue must have one unambiguous checkout currency. A missing/non-payable merchant, absent client ID or ambiguous catalogue fails visibly. No dummy client ID, invented capture or forced-success fallback is provided. Store Report/catalogue UI and intelligence endpoints remain Ishaan’s ownership.

## Capture and recovery

The approval callback POSTs to the capture path, with no body or {}. The server resolves the merchant from the stored PayPal ID. It returns only the source minimal summary; public possession of an opaque PayPal ID never grants private order details. Raw PayPal responses stay transient, then the approved policy retains only allowlisted values and hashes.

A committed local capture returns the current stored summary, including later fulfillment/refund states. Otherwise the server checks PayPal before capture. Existing captures go directly to the atomic store. A lost response or ORDER_ALREADY_CAPTURED race permits read-only re-fetch without an application-level second POST. Stable ff-capture-UUID and the store’s order lock/unique capture constraint/atomic pg-boss insert protect retries. PENDING, declined, amount mismatch and conflicting state fail without a captured ledger/job. This does not claim distributed exactly-once or H3 webhook reconciliation.

The source create-before-local-write crash window remains documented as O17. Failed local persistence returns safe recovery identifiers when known and does not automatically create another PayPal order. Do not call a new create operation merely to retry an existing capture.

## Private reads and identity

Merchant tokens see only their merchant’s rows; buyer tokens see only their actual buyer_id. Missing and foreign details share a 404. Admin/agent roles receive no implicit bypass. Buyer detail returns neutral values for merchant-only signal/hold/investigation, batch and account-status fields without changing the shared DTO. Lists default to 50; pass the last returned UUID as cursor under the same role/status filter. Sorting uses created_at DESC then UUID DESC.

Capture identity is the actual PayPal payer ID. The browser’s subject is not written as buyer_id and email hashes are not used to claim identity. When accounts exist, Maya’s fixed seeded demo buyer must be linked to her verified actual payer ID before demonstrating authenticated history. This is pending setup, not an account association performed here.

Merchant detail calls the documented computeBuyerSignal seam only after authorization. The current result explicitly says INTELLIGENCE_STUB. Merchant list uses the latest matching stored signal row; the API does not invent a features JSON layout or recompute risk rules. Ishaan replaces the existing export/handler in his owned package and can supply caching there. No outbound handoff message was sent.

## Verify and unblock

The complete executable sequence is now in [sandbox rehearsal](sandbox-rehearsal.md): setup:sandbox, test:sandbox, test:sandbox serve, test:sandbox verify and recorded-sandbox parser tests. It includes the account/approval boundary, sanitized fixture workflow and same-order recovery. This supersedes the earlier setup/tooling gaps below; real accounts and their acceptance observations remain pending.

Run pnpm typecheck, pnpm test, pnpm test:db, pnpm lint and pnpm format:check. The database command requires the isolated loopback fairfold_*test database. HTTP checks use real PostgreSQL, pg-boss and PayPal client/transport code with only sandbox HTTP responses injected. They do not satisfy real PayPal acceptance. See [HTTP evidence](evidence/2026-11-09-h2-http.md) and [capture recovery evidence](evidence/2026-11-09-h2-capture-recovery.md).

The source unstyled /dev harness is now implemented and locally verified; its actual SDK browser session remains unverified. Next is actual account/credential setup and real A4/Maya/recorded-fixture checks when available. H3 has not started. The separate [Render handoff](ishaan-deployment-handoff.md) remains prepared but unsent; no plan/payment change or quota recovery is assumed.

## Unstyled /dev rehearsal and remaining gates

With the configured API running and DEMO_MODE=true, open /dev on its origin. The source defaults are merchant neel-block-prints and hoodie HD-IND-01. Select Load checkout, then the eligible PayPal button. Sign in only to PayPal’s own sandbox window using Maya’s personal sandbox account and inspect the server-priced total before approval. The harness calls Fairfold REST only; the SDK owns the PayPal browser flow. It does not request any app secret, access token or card data.

The SDK promise resolves to {orderId: paypalOrderId}; the Fairfold UUID is not the SDK order ID. Capture JSON is printed as text only after the capture endpoint confirms the active order and stored state. Cancel/error are not payment success. If an approved capture is uncertain, use Check the approved capture again, which reuses its PayPal ID without a fresh create. That recovery context is memory-only: after reload/lost context, inspect the existing server/PayPal order before beginning another purchase. No durable browser retry or automatic new payment is claimed.

Before a real run, the database must contain the source Neel merchant/product records and the actual sandbox client ID/encrypted secret under the configured encryption key. Merely placing an app secret in a browser or obtaining a demo JWT does not configure the merchant row. The full B17 seed remains H8 work; test fixtures live only in the isolated test database and are not a recording world. Accounts and real app setup were explicitly deferred by Hriday, so an empty/unconfigured development catalogue should produce a setup error, not a dummy purchase.

| Gate                   | Required observation                                                                                       | Current state                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Real account/app setup | Neel merchant app and Maya personal sandbox account, credential scopes verified                            | NOT AVAILABLE / DEFERRED BY USER                   |
| Demo buyer identity    | Existing fixed Maya buyer row linked to her verified actual payer ID                                       | PENDING REAL SETUP                                 |
| A4                     | Real create/approve/capture, actual protection/account data, one captured ledger and job                   | NOT RUN                                            |
| /dev browser session   | Actual SDK eligibility/pop-up/approval/capture with Maya                                                   | NOT RUN; synthetic flow and HTTP asset checks PASS |
| Recorded fixtures      | Observed real create/capture responses sanitized in memory before any write, provenance retained           | NOT RECORDED; unit inputs remain synthetic         |
| Full PayPal interface  | Remaining dispute/webhook operations implemented without placeholder methods or shared-contract alteration | INCOMPLETE                                         |
| H1 hosting             | Existing Render Blueprint deployment and actual health/Swagger/worker verification                         | PENDING CAPACITY/BILLING/ACCESS                    |

When recording fixtures, retain only the reviewed required vendor fields and substitute synthetic payer/name/email/street values before serialization. Keep raw capture responses transient. The approved capture policy does not approve blanket webhook/dispute/reporting/action-response retention. No success fixture, pass metric or screenshot should be manufactured to bridge these gates.

Official references checked on 9 November 2026: [v6 setup](https://developer.paypal.com/sdk/js/set-up/) for the sandbox core and client-ID authentication, and [v6 session reference](https://developer.paypal.com/sdk/js/reference/) for eligibility, callbacks and the order-promise object. O20 records why the precise reference takes precedence over an inconsistent migration-guide snippet.
