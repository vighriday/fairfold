# Fairfold

Fairfold is a neutral AI witness for both sides of a PayPal payment. Packing evidence supports the merchant, a cited Store Report informs the buyer, and Shared Cause Detection links complaints to possible problems before more orders ship. PayPal holds the payment and decides disputes.

Hriday and Ishaan are preparing this project for the PayPal AI Hackathon. The documented audience is Indian apparel exporters selling to overseas PayPal buyers.

**Current state, 10 November 2026:** H1's foundation, H2's complete sandbox client/checkout and H3's verified webhook/reconciliation/polling implementation run locally on `Hriday`. Actual PayPal acceptance and first Render deployment remain pending. Intelligence remains the labelled stub, and the product frontend follows Figma. The original idea and architecture remain authoritative.

The user authorized proceeding around the absent sandbox accounts. The real dispute spike is deferred, and PayPal-dependent checks remain not run. H1's first Render deployment is still pending.

For H2's complete local setup, opt-in recorded /dev rehearsal, read-only A4 audit and response-parser evidence, follow the [sandbox rehearsal guide](docs/hriday/sandbox-rehearsal.md). Account-backed PayPal approval and actual recorded fixtures remain pending.

H2's local implementation now includes all 17 PayPalClient methods and the complete ForMerchant composition used by the API. The [local closeout](docs/hriday/h2-closeout.md) records 279 offline and 126 PostgreSQL/HTTP passes, the two Q2 return-address review gates and the remaining real-account steps. H3 is locally ready; see the [H3 closeout](docs/hriday/h3-closeout.md) for 302 offline/180 PostgreSQL checks and the remaining real acceptance/H4 sync boundary.

The API exposes the seven source checkout/order routes plus signature-authenticated `/webhooks/paypal/:merchantSlug`. The source unstyled `/dev` harness remains demo-only. The normal worker consumes verified events, reconciles known/unknown captures and schedules dispute polls per configured real merchant; H4 synchronization is explicitly pending. Real SDK purchase, webhook delivery and hosted readiness are unverified. Follow the [checkout guide](docs/hriday/checkout-integration.md) and [H3 acceptance guide](docs/hriday/h3-acceptance.md); the [conditional deployment handoff](docs/hriday/ishaan-deployment-handoff.md) is prepared and unsent.

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
