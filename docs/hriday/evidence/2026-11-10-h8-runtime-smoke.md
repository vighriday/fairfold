# H8 local runtime smoke evidence

`pnpm test:e2e` now performs a credential-free local runtime smoke check when `TEST_DATABASE_URL` points to the isolated loopback PostgreSQL test database. It applies the local schema, starts the assembled API/worker runtime, and probes:

- `/healthz` reports API and database readiness.
- `/docs/json` contains `/healthz`, `/mcp` and demo-login routes.
- Unauthenticated `POST /mcp` returns 401.
- Agent demo login returns a token.
- Authenticated MCP `initialize` returns protocol version `2025-03-26`.
- Authenticated MCP `tools/list` exposes all four expected tools.

Observed on 10 November 2026:

```json
{
  "status": "LOCAL_RUNTIME_SMOKE_PASS",
  "health": "PASS",
  "openapi": "PASS",
  "unauthenticatedMcp": "PASS",
  "demoLogin": "PASS",
  "authenticatedMcpInitialize": "PASS",
  "authenticatedMcpToolsList": "PASS",
  "paypalRequests": 0,
  "acceptance": "A1-A14 NOT RUN"
}
```

Without `TEST_DATABASE_URL`, the command reports `SKIPPED` and exits 2. This smoke check does not claim Render deployment, PayPal sandbox execution, model execution or A1–A14 acceptance.
