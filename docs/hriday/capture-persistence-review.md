# Q3 capture persistence policy

Status: **APPROVED BY HRIDAY** on 9 November 2026 IST for H2.3. Hriday explicitly replied “Use the proposed capture policy” to the linked allowlist and exact normalization proposal. This authorizes this capture boundary without changing a shared interface; Ishaan’s review has not been received. It resolves the capture portion of Q3 only; webhook/dispute retention still needs its own field review before H3/H4.

The original architecture sections 8 F1 and 12 require capture identity/protection data, buyer email as SHA-256 only, and street address as a hash plus country/postal code. The existing CaptureResult exposes a transient raw response; the existing database has no orders.raw column. This proposal maps those requirements to the actual current schema and fixes the previously unspecified normalization before code writes data.

## Approved retained fields

| Destination                       | Retain                                                                                                                                                                                                                      | Exclude                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `buyers`                          | Existing PayPal payer ID, display_name from the capture's payer name, email_hash, country; source-defined timestamps                                                                                                        | Plaintext email, payer phone, birth date, tax IDs, raw PayPal buyer object        |
| `orders`                          | Existing order/merchant/buyer IDs, PayPal order/capture IDs, invoice ID, status, database-priced amount/currency, payer_account_status, seller_protection_status/categories, capture timestamp, ship_to_country/postal/hash | Raw response, shipping recipient name, plaintext address lines, payer email/phone |
| `order_items`                     | Existing source fields copied from server-owned product records: product/SKU/name, quantity, price and listing version                                                                                                      | Browser-supplied prices or vendor payload copies                                  |
| `ledger_entries` captured payload | Existing capture/order identifiers, database-priced amount, actual seller protection and payer account status; normal ledger sequence/hash/timestamp rules                                                                  | CaptureResult.raw, email, street/recipient name or full payer/shipping objects    |
| `order.captured` job              | Existing `{ orderId }` contract only                                                                                                                                                                                        | Any vendor body or buyer contact fields                                           |
| Public responses                  | Existing OrderSummary/OrderDetail and role/ownership rules                                                                                                                                                                  | CaptureResult.raw, PayPal credentials/tokens or extra contact/address fields      |
| Diagnostics                       | Existing request/error IDs, safe PayPal debug ID/status/symbolic codes                                                                                                                                                      | Vendor descriptions, request/response bodies, email/street/name/contact values    |

No migration or shared DTO rename is proposed. Buyer identity is still keyed by PayPal payer ID as specified. Merchant history queries remain scoped to that merchant; this does not authorize pooling buyer histories across stores.

## Approved normalization and hash rules

1. Email: if absent/empty, retain null. Otherwise apply Unicode NFC, trim surrounding whitespace and lowercase, then SHA-256 of UTF-8 bytes as lowercase hex. Keep only the hash; PayPal payer ID remains the primary identity. Do not add HMAC/salts or another identity service to the fixed design.
2. Address: transiently select exactly address_line_1, address_line_2, admin_area_2, admin_area_1, postal_code and country_code from the captured purchase unit's shipping address. CaptureResult.shipping omits address_line_2, so select it from the existing raw response in memory without changing the shared type.
3. Normalize each selected string with NFC, trim surrounding whitespace, and collapse runs of whitespace to one space. Preserve case for address/city/admin/postal fields; uppercase only country_code. Missing/empty fields become null. Do not guess abbreviations, translations, a street, or a missing postal code.
4. Compute SHA-256 over the existing canonical JSON function applied to the six-key normalized address object, using UTF-8. If both street address lines are absent, keep ship_to_hash null rather than treating country/postal alone as a known street. Persist only country, postal code and the hash; discard the normalized plaintext object.
5. Missing payer name remains null; display_name is the source-authorized name, not a manufactured identity. Do not substitute a shipping recipient for the payer. Keep uncertain account/protection values unknown rather than turning absence into a negative signal.

These rules are review choices, not claims that the original document specified case/whitespace normalization. Hriday accepted them before implementation of the capture mapper/persistence tests. They do not establish equivalence between differently written real-world addresses.

## Required capture transaction behavior

Read merchant and order context from the existing server-owned order. Match the returned PayPal order/capture, currency and actual capture amount against that order before treating payment as captured; inspect only the necessary transient raw amount fields. A PENDING or failed capture must not produce a captured ledger entry/job or claim completed payment.

Use the original transactional order lock, unique identifiers and queue integration to ensure one logical capture update, one captured ledger entry and one order.captured job under duplicate/concurrent callbacks. Preserve the original shared job/ledger/schema contracts. The database-priced order/items cannot be replaced by browser totals. These behaviors are now locally verified by the subsequent [capture store evidence](evidence/2026-11-09-h2-capture-store.md), including concurrent callbacks and actual queue-insert rollback. The policy alone was not test evidence; real vendor acceptance remains pending.

No raw vendor payload is written to JSON columns, ledger, queues, logs or fixture files. Real create/capture fixtures must be sanitized in memory before writing, explicitly retaining their observed sandbox provenance and replacing buyer email/name/address with synthetic values. Synthetic parsing tests remain distinct from recorded sandbox fixtures.

## Review and remaining boundaries

Hriday approved the allowlist, email normalization and six-component address hash on 9 November 2026 IST. The decision is recorded in DECISIONS.md; Q3 is not globally resolved by this capture-only decision. Ishaan's review of the shared privacy boundary remains part of the handoff. No message has been sent to him.

Raw webhook bytes still remain transient and unchanged until signature verification. H3's event payload allowlist, H4's disputes.raw allowlist and approved-action PayPal response retention will be reviewed against the actual required fields before those writes. Reporting fields=all rows remain transient until an explicit import mapping is reviewed. The current proposal does not approve any future blanket raw-payload storage.

See [Q3 and fixed decisions](../../DECISIONS.md), [H2 work order](h2-paypal.md), and the actual [Orders](evidence/2026-11-09-h2-orders.md) / [refund-reporting](evidence/2026-11-09-h2-payments-reporting.md) evidence. All real PayPal acceptance gates and H1 hosting remain pending.
