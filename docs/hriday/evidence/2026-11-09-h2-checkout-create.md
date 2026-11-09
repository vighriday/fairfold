# H2.3c database-priced checkout creation evidence

Date: 9 November 2026 IST. Branch: Hriday. Source: original architecture F1/P264 and H2 request/identifier conventions, section 7 SQL and section 11 endpoint 3. Input: synthetic merchant/product records and injected typed vendor operation, never a recorded PayPal response.

The creation service uses the unchanged CoreRequests.createOrder DTO. Products are selected only within the requested merchant. Their price, currency, name, SKU and listing version form the snapshot sent to the real packages/paypal operation when wired. Incoming nested price/name/listing-version extras are stripped by the existing DTO and cannot price the order. Duplicate SKU quantities combine, total arithmetic uses BigInt minor units, and the current SQL quantity/numeric bounds are checked.

Source identifiers remain reference_id=order UUID, custom_id=merchant slug, invoice_id=FF-UUID and PayPal-Request-Id=ff-create-UUID. The vendor binding supplies intent CAPTURE and the exact item breakdown. After its validated return, orders (created) and order_items insert atomically using the same snapshot. A concurrent listing change does not replace the values already sent. No capture status, ledger/job or plaintext shipping data is written at creation. The result contains only orderId/paypalOrderId.

Observed checks:

- PASS: pnpm test:db — all 61 PostgreSQL checks, including 19 new creation cases. Prior capture, schema, storage, credential and queue checks passed again.
- PASS: pnpm test — 150 offline tests; all 61 database checks explicitly skipped by this ordinary command.
- PASS: pnpm typecheck and pnpm lint.
- PASS: pnpm format:check after correcting its two reported source/test formatting warnings; no behavioral test failure occurred.

The 19 cases cover forged browser item metadata and transient shipping; exact request identifiers and stored listing; 0.10/0.20 totals and duplicate SKU aggregation; a listing changed during vendor creation; four unavailable/non-payable merchant/product cases; three invalid total/currency cases; five invalid quantities; aggregated SQL integer overflow; credential/vendor failures with no order; real order/item transaction rollback when the product disappears after vendor creation; unexpected top-level input and invalid injected clock.

O17 records the original PayPal-create-before-local-write recovery gap. A local write failure after a known vendor return rolls back order/items and exposes only recovery IDs through the existing error envelope; the operation is not replayed. The test proves one injected create call, not distributed exactly-once or real PayPal success. If a process dies before storing the vendor return, durable recovery is not provided by this local increment. H3’s specified import/reconciliation is still unstarted.

Routes, owner-scoped order reads, capture HTTP orchestration, full ForMerchant composition and /dev remain pending. Shared contracts, schema, credentials, Ishaan-owned directories and Render plans remain unchanged. Sandbox A4/Maya purchase/recorded fixtures and H1 hosting are not complete.
