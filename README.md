# Fairfold

Fairfold is a neutral AI witness for both sides of a PayPal payment. Packing evidence supports the merchant, a cited Store Report informs the buyer, and Shared Cause Detection links complaints to possible problems before more orders ship. PayPal holds the payment and decides disputes.

Hriday and Ishaan are preparing this project for the PayPal AI Hackathon. The documented audience is Indian apparel exporters selling to overseas PayPal buyers.

**Current state, 9 November 2026:** the H1 backend foundation runs locally. It includes the PostgreSQL 16 schema, shared contracts, role authentication, OpenAPI, pg-boss jobs, evidence storage and a transactional hash-chain ledger. PayPal checkout, model calls and the product frontend belong to subsequent tasks. Work is on `Hriday`; the existing idea and architecture remain the governing specification.

The user authorized proceeding around the absent sandbox accounts. The real dispute spike is deferred, and PayPal-dependent checks remain not run. H1's first Render deployment is still pending.

While hosting is pending, H2 has begun locally: `packages/paypal` now provides encrypted merchant credential lookup and sandbox OAuth/HTTP transport, verified with synthetic offline responses and isolated PostgreSQL tests. Checkout bindings, routes and `/dev` remain pending. This package does not yet expose the complete `PayPalClient`/`ForMerchant` interface. Follow the [H2 increments](docs/hriday/h2-paypal.md); the [conditional deployment handoff](docs/hriday/ishaan-deployment-handoff.md) is ready if hosting moves to Ishaan.

## Run the local foundation

Prerequisites: Node.js 22.16 or newer, the pinned pnpm 12.4.2, and PostgreSQL 16. Docker Compose supplies PostgreSQL when Docker is available.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
docker compose up -d
pnpm db:migrate
pnpm dev
```

`setup:local` creates an ignored `.env` with fresh encryption/signing keys and leaves PayPal/model credentials blank. It never overwrites an existing `.env`. The default API serves [health](http://localhost:3000/healthz) and [Swagger UI](http://localhost:3000/docs/). The worker starts with an explicitly empty intelligence handler map until Ishaan's implementation arrives.

For this workspace's validated native PostgreSQL setup, `.env` uses port 55432 and the API uses port 3110. The running API documentation is [http://localhost:3110/docs/](http://localhost:3110/docs/). See [H1 setup and handoff](docs/hriday/h1-foundation.md) for exact commands and limitations.

## Verify

```sh
pnpm test
pnpm test:db
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:sandbox
```

Offline tests do not contact external services. Database integration checks require an isolated loopback PostgreSQL 16 database named `fairfold_*test` in `TEST_DATABASE_URL`; they are skipped by the default offline run and explicitly executed by `test:db`. Sandbox checks report SKIPPED when credentials are absent. `test:e2e` reports not implemented until the later application tasks are delivered.

The Render blueprint defines the chosen API, worker and PostgreSQL 16 services. It has not been deployed or purchased. Read the [deployment preparation](docs/hriday/h1-foundation.md) before creating services.

Start with the [Hriday work guide](docs/hriday/README.md). It links the sequential build plan, verified PayPal research, sandbox dispute runbook, responsibilities, acceptance tests, and submission preparation.

- [Current status and next action](docs/hriday/status.md)
- [Architecture decisions and open questions](DECISIONS.md)
- [Change history](CHANGELOG.md)
- [Contributor instructions](AGENTS.md)

The internal source documents remain local and are excluded from Git. This README describes the working H1 foundation; the full application setup, seed, sandbox demonstration and measured AI results are completed in H8 after their acceptance gates pass.

Licensed under the [MIT License](LICENSE).
