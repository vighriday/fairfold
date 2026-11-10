# H2.1 authentication and transport verification

Date: 9 November 2026 IST. Branch: `Hriday`; working change after documentation commit `deea19a`. Source: original architecture sections 3, 8 F1/F6, 12 and 16 H2. This is the first local H2 implementation increment under O15 while H1 hosting remains pending.

## Implemented scope

- New `packages/paypal` library: merchant-only encrypted credential lookup, sandbox OAuth/HTTP transport and sanitized errors. Uses existing crypto/clock/PostOpts/AppError and the existing merchant schema. It exports actual transport/provider behavior, not an unfinished object cast to PayPalClient/ForMerchant.
- Cache isolation, actual returned expiry with a 60-second margin, concurrent grant coalescing, credential rotation/removal and token rejection handling. No persistent OAuth token storage.
- Maximum three HTTP retries after the initial attempt, stable request ID/body, exponential 500/1,000/2,000 ms delays, explicit 5xx mutation retry safety, no automatic ambiguous network replay, no cross-origin paths or redirect following. Failed attempts record debug IDs/safe symbolic diagnostics without vendor free text or bodies.
- API and worker runtime, schema/migrations, shared contracts and Ishaan-owned packages are unchanged. No live PayPal endpoint is permitted.

## Actual observed checks

| Check                                             | Result                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency install                                | PASS using normal `pnpm install --ignore-scripts`; existing supply-chain policies passed. Initial offline install failed on a missing cached `ignore@7.0.14` tarball; no policy was disabled                              |
| Dependency diff                                   | PASS; only the `packages/paypal` workspace importer was added, with existing pinned packages; no dependency version changed                                                                                               |
| `pnpm install --frozen-lockfile --ignore-scripts` | PASS; lockfile up to date, resolution skipped, existing supply-chain policy check retained                                                                                                                                |
| `pnpm typecheck`                                  | PASS                                                                                                                                                                                                                      |
| `pnpm test`                                       | PASS; 49 offline tests, 17 DB tests explicitly skipped; 4 test files passed and 4 skipped                                                                                                                                 |
| New offline coverage                              | PASS; 30 synthetic transport cases, including credential failures, merchant isolation, refresh boundary, coalescing, rotation, 401 recovery, malformed grants, bounded retries, ambiguous errors and diagnostic redaction |
| `pnpm test:db`                                    | PASS; all 17 tests across 4 files on the existing isolated local PostgreSQL test database                                                                                                                                 |
| New database coverage                             | PASS; 2 merchant-credential lookup cases cover absent/other merchant, encrypted value retention and updates; synthetic row removed and pool closed                                                                        |
| `pnpm lint`                                       | PASS                                                                                                                                                                                                                      |
| `pnpm format:check`                               | PASS                                                                                                                                                                                                                      |
| Real PayPal calls/fixtures/A4                     | NOT RUN; sandbox accounts remain absent. Unit responses and credentials are explicitly synthetic                                                                                                                          |
| H1 hosted acceptance                              | PENDING; no Render deployment or payment action was performed                                                                                                                                                             |

Offline and database runs began at approximately 18:13 IST. The integration runner now includes `credentials.integration.test.ts` behind the same isolated-loopback test-database guard. It did not use the development database or add a schema migration.

The HTTP tests inject fetch and sleep; no external PayPal request or real backoff wait occurs. Diagnostic tests assert secrets, tokens, body fields and vendor descriptions do not escape into errors/logs. Actual network sandbox behavior is still unverified.

## Remaining source gates

Continue H2.2 with current operation specifications, exact monetary/field mapping and the unchanged shared interfaces. Q3 must be reviewed before capture/raw-payload persistence. Full checkout routes, `/dev`, recorded create/capture parsing fixtures and Maya's real A4 purchase are not implemented or claimed here. H3–H8 remain unstarted. See [H2 work order](../h2-paypal.md) and the [conditional hosting handoff](../ishaan-deployment-handoff.md).
