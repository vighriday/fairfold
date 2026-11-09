# H2.3e checkout capture recovery evidence

Date: 9 November 2026 IST. Branch: Hriday. Source: original F1, H2, shared PayPal/HTTP interfaces and approved capture policy. Primary vendor reference checked: [Show order details](https://developer.paypal.com/api/orders/v2/orders-get), including its payment_source field filter. No shared contract/schema or Ishaan-owned implementation changed.

The real checkout factory composes the existing sandbox transport/Orders group plus a readCapture helper. It is explicitly a checkout subset, not an incomplete PayPalClient cast. The helper uses the sandbox GET with payment_source, verifies order/single-unit/single-capture structure and returns the same transient CaptureResult. A completed order without a capture or multiple captures is an error; actual capture status is never promoted to COMPLETED.

The application derives merchant context from the stored order, rejects invalid/seed IDs and disallowed local states, and returns OrderSummary only. Same-process callbacks coalesce. Prior local committed captures return the current stored summary without a vendor call. Otherwise an authoritative GET precedes capture; a lost response or ORDER_ALREADY_CAPTURED permits one safe GET, not another application POST. The original ff-capture-UUID remains stable. The minimized buyer/order/ledger/job transaction is unchanged.

Observed checks:

- PASS: pnpm test:db — 94 real PostgreSQL/pg-boss checks, including 17 new integrated workflow cases. Only the sandbox HTTP boundary is injected; actual credential lookup/decryption, transport, operation parsers, pricing, persistence and queue adapter run.
- PASS: pnpm test — 161 offline tests, including 11 new recovery parser cases; 94 database cases explicitly skipped by the ordinary command.
- PASS: pnpm typecheck and pnpm lint after removing one unused test import. Final repository formatting is checked before commit.
- PASS: existing-version offline dependency linking; only the API workspace importer links packages/paypal. No network package download or dependency version change.

Workflow cases cover source create/GET/capture IDs and exact minimal result; eight concurrent callbacks and local replay without credentials; existing capture GET-only recovery; lost-response/already-captured races; uncertain no-commit retry with the same request ID; real queue-insert rollback then GET-only recovery; pending/declined results; definite decline without recovery loop; amount mismatch; no browser-subject identity reassignment; matching payer reuse; invalid state/ID/roles; current refunded state; minimal/missing/simulated/ambiguous configuration; inconsistent local capture state. Parser cases cover four uncaptured states, three actual capture statuses and four ambiguous/invalid shapes with no mutation/body logging.

Synthetic buyer email/street/recipient remain in memory and are absent from summary, ledger, jobs and diagnostics. No vendor response file was recorded. The public exception is unchanged and does not grant authenticated private order access. Maya’s verified payer-to-demo-subject setup is still required later; source accounts do not exist. Same-process coalescing plus request IDs and the database lock are not a claim of globally exactly-once PayPal execution.

HTTP route/OpenAPI/bootstrap wiring and /dev remain subsequent increments. H3 reconciliation/import is not implemented by this local checkout recovery helper. Real sandbox A4/Maya purchase/recorded fixtures and H1 Render hosting remain pending.
