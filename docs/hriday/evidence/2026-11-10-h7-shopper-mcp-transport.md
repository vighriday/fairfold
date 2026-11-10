# H7 shopper MCP transport evidence

The shopper package now includes an injected HTTP transport for the authenticated Fairfold MCP route. It sends `tools/call` JSON-RPC requests with the supplied bearer token, validates the result envelope and JSON tool payload, and preserves explicit MCP error codes. No token or raw response is written to the shopper transcript.

Validation on 10 November 2026:

- `pnpm test`: 333 tests passed; credential/database-dependent suites were skipped by their existing guards.
- Shopper tests: 4 tests passed.
- `pnpm typecheck`: passed.
- Targeted ESLint and `git diff --check`: passed.

This is local transport and policy evidence. It does not claim a deployed run, real model invocation, PayPal capture or A13 acceptance.
