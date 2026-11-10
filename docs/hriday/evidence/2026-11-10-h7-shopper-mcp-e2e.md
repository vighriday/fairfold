# H7 shopper MCP end-to-end evidence

The shopper policy now has a real route-boundary test: a PostgreSQL-backed Fastify app receives the authenticated MCP JSON-RPC calls through an injected fetch transport, returns the catalogue and verified store report, and causes the shopper to pause for PayPal approval before invoking checkout. The checkout adapter is still a test boundary; no PayPal request or capture is claimed.

Validation on 10 November 2026:

- `pnpm test`: 333 tests passed; credential/database-dependent suites were skipped by their existing guards.
- `pnpm test:db`: 22 files, 201 tests passed.
- `pnpm typecheck`: passed.
- Targeted ESLint and `git diff --check`: passed.

The first database run had one transient pg-boss schedule assertion failure; the immediate rerun passed all 201 tests. No production schedule code was changed.
