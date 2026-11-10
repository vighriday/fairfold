# H2.3d owner-scoped order read evidence

Date: 9 November 2026 IST. Branch: Hriday. Source: original architecture section 11 endpoints 7/8/30/31, OrderSummary/Row/Detail, section 12 ownership and section 16 H2. The original schema and DTOs remain unchanged.

Implemented an application read layer, not HTTP routes yet. Every list/detail/cursor anchor is scoped by the authenticated merchant or buyer in SQL. Missing/foreign orders return ORDER_NOT_FOUND; admin/agent receive no bypass. List ordering is deterministic by descending created_at then UUID. The caller passes the last UUID as cursor, default limit is 50, and foreign/filtered-out anchors cannot move the pagination boundary.

Related reads use repeatable-read read-only snapshots. Merchant list counts do not fan out across joins, and signal rows must match merchant, order and buyer before the latest one is selected. Seller protection, shipment and disputes come from stored source fields. Details expose only ledger length and the actual verifier result, including false after tampering. Associated investigations are merchant-scoped through their cluster and affected-order/dispute/complaint/hold links.

Buyer responses neutralize merchant-only fields while preserving the shared required DTO: no buyer signal/hold/investigation, no stock batch or payer account status. List responses are OrderSummary only. Neither view exposes secrets, PayPal payer IDs, email/address hashes, postal data, raw dispute/scan objects, packer fields or ledger payloads. Buyer reads never invoke intelligence.

Merchant detail invokes the existing computeBuyerSignal function only after ownership checks. Its result is validated with the existing BuyerSignal schema; current test/runtime dependency remains an explicit INTELLIGENCE_STUB until Ishaan replaces it. The read layer does not invent how I3 stores its explanation in features, compute risk scores or edit Ishaan-owned code.

Observed checks:

- PASS: pnpm test:db — 77 real PostgreSQL checks, including all 16 new read cases and the earlier 61 cases.
- PASS: pnpm typecheck and pnpm lint. An initial readOnly option failed the compiler; inspecting the pinned Drizzle definition established accessMode='read only', which now passes.
- PASS: pnpm test — 150 offline passes, with 77 database cases explicitly skipped.
- PASS: final pnpm format:check after correcting the read test file’s formatting warning.

The 16 cases cover exact merchant/buyer list scope, tied-time pagination and filters, foreign cursors, four invalid query cases, latest matching signal and non-inflated counts, authorized detail/intelligence timing, buyer redaction, merchant-scoped disputes/shipment and tampered ledger, unknown/allowlisted DTOs, both denied admin/agent roles, missing/invalid context and malformed intelligence output. The independent repeatability correction is committed separately and documented in its own evidence.

Public/private route schemas and runtime orchestration remain next. No PayPal request, sandbox account, persistent real vendor fixture, H3 webhook or Render deployment was exercised here. H1/H2 acceptance remains incomplete.
