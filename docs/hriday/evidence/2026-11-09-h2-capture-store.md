# H2.3b atomic capture persistence evidence

Date: 9 November 2026 IST. Branch: Hriday. Source: original architecture 8 F1, section 7 SQL/ledger, section 12 privacy; Hriday’s approved [capture policy](../capture-persistence-review.md). No shared contract, schema/migration, Ishaan-owned directory or hosting plan changed.

The application store takes a server-owned merchant/order context and a transient CaptureResult from packages/paypal. It minimizes the result before persistence, locks the merchant-scoped order, and validates the actual capture/order IDs, currency and decimal amount against the stored order. Returned reference/custom/invoice IDs are checked against server-owned values when present. Captures other than COMPLETED are rejected without a captured transition. Existing numeric amounts and order_items are untouched.

One checked-out client runs the Drizzle transaction, the existing ledger’s nested savepoint and pg-boss’s parameterized executeSql adapter. A successful first capture upserts buyer by payer ID, updates the allowlisted order fields, appends one curated captured entry and inserts one order.captured job with only orderId. A missing payer ID remains unknown; email is never used to merge identities. Buyer updates do not erase known fields when the new capture omits them.

A committed matching capture is a no-op on repeat, including after packing/sealing/shipping/delivery/refund. A conflicting capture/state fails. PostgreSQL’s unique capture constraint prevents assigning one capture to two orders. A queue failure, including after its actual insert, rolls back buyer/order/ledger/job changes together and allows a clean later retry.

Observed checks:

- PASS: pnpm test:db — 42 tests across five files against the isolated loopback PostgreSQL 16 test database. All 25 new capture cases pass; the prior 17 database checks also pass again.
- PASS: pnpm test — 150 offline tests; all 42 database checks explicitly skipped by the ordinary command.
- PASS: pnpm typecheck, pnpm lint, pnpm format:check.
- PASS: existing-version offline workspace linking; lockfile change is confined to the API importer’s jobs and Drizzle dependencies.

The 25 new cases cover approved persisted fields and excluded plaintext, unchanged order items/prices, verified ledger chain and minimal queue payload; eight concurrent callbacks plus repeat; five later order states; concurrent payer upsert and missing-field preservation; missing payer identity; three non-completed statuses; six order/money/metadata mismatches; decimal equivalence/approved order; foreign/missing context; cancelled/conflicting state; rollback after actual enqueue; missing job ID; cross-order unique capture collision; invalid injected clock.

No new HTTP route or vendor call is exposed by this store. It requires a trusted merchant-scoped PayPal client result; callers must resolve and authorize context before invoking PayPal and reuse ff-capture-<order uuid>. Live checkout orchestration/recovery remains a later local H2 increment; the local store’s atomicity is not a claim of distributed exactly-once PayPal execution. H3’s webhook import/reconciliation remains unstarted.

Fixtures are synthetic inputs generated in memory, not recorded PayPal successes. Real accounts, A4/Maya /dev purchase, sanitized recorded fixtures and H1 Render deployment remain NOT RUN/pending. This capture-only approval does not resolve Q3’s future webhook/dispute/reporting/action-response field reviews or imply Ishaan reviewed them.
