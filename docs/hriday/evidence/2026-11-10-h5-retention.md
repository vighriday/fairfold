# H5 retention evidence

The worker now registers `retention.sweep`. It clears only `evidence_blobs.bytes` after the 180-day delivery boundary and records `purged_at`; blob rows and SHA-256 identifiers remain. A blob stays available when any ledger reference belongs to an undelivered order or an order delivered within the retention window.

Validation:

- `pnpm test`: **329 passed**, 200 skipped.
- `pnpm test:db`: **194 passed**.
- `pnpm typecheck`: **PASS**.
- Targeted ESLint and Prettier checks: **PASS**.
- `git diff --check`: **PASS**.

The retention run was synthetic local evidence. Real hosted retention timing remains **NOT RUN**.
