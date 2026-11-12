# Fairfold

Fairfold is a neutral witness for both sides of a PayPal payment. It records packing proof, shows buyers a fact-linked Store Report, gives merchants a transparent Buyer Signal, detects shared product issues and prepares dispute evidence or fair offers. PayPal holds the funds and decides disputes. Humans approve evidence submissions, holds, messages, offers and refunds.

Built by Hriday and Ishaan for the PayPal AI Hackathon. The source idea and D1–D18 remain unchanged. All PayPal integration is sandbox only.

**12 November 2026: integrated website on `main`; external acceptance pending.** The combined branch includes both reviewed histories. The supplied landing page and merchant console now form one routed website with real API reads, camera capture and explicitly reviewed actions. Its original components, styles, fonts and animations are preserved. See the [website and Render guide](docs/hriday/website-deployment.md) for routes, deployment and remaining human setup.

## Run locally

Use Node.js 22.16+, pnpm 12.4.2 and PostgreSQL 16. Docker Compose supplies PostgreSQL; an existing local PostgreSQL 16 installation also works with the same environment variables.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
# Inspect the generated ignored .env; use private values, never commit it.
docker compose up -d
pnpm db:migrate
pnpm seed
pnpm dev
```

Open `http://localhost:3000/` (or your configured `PORT`) for the landing page and `/console/orders` for the merchant console. The same API serves the website, `/docs`, `/healthz`, `/mcp` and the unstyled `/dev` sandbox checkout harness. Demo access requires `DEMO_MODE=true`; the console obtains the documented short-lived Neel role token in memory. The API and worker use the same database and pg-boss queue. No account credentials are required for the local catalogue, deterministic logic or fixture tests.

## Configure models

All provider calls pass through `packages/ai`. The integrated candidate configuration uses `AI_PROVIDER=google`, `AI_MODEL_VISION=gemini-3.5-flash`, `AI_MODEL_TEXT=gemini-3.5-flash-lite`, `AI_EMBEDDING_PROVIDER=google` and `AI_MODEL_EMBEDDING=gemini-embedding-2`. Set `GOOGLE_GENERATIVE_AI_API_KEY` privately, or use another documented provider supported by the gateway. Keep the original `CLUSTER_SIMILARITY=0.80` default.

Verify model access and quota for your own project against [Google's model catalogue](https://ai.google.dev/gemini-api/docs/models) and [embedding documentation](https://ai.google.dev/gemini-api/docs/embeddings). This checkout does not guarantee a free quota. Without configuration, descriptive steps use their documented fixed fallbacks; new complaints remain unembedded until a provider is available. No substitute embedding algorithm is activated automatically.

## Verify

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:db
pnpm test:e2e
pnpm --filter @fairfold/intelligence eval
pnpm --filter shopper-agent start --check
```

Database tests require a separate loopback database named `fairfold_*test` in `TEST_DATABASE_URL`. They may truncate its synthetic data. `test:db` includes intelligence and platform tests and removes provider settings from its child process. Model tests use injected doubles. `test:e2e` starts the actual local API and exercises the official AI SDK MCP client, without a PayPal payment. These checks do not establish hosted or real sandbox acceptance. [Evidence and limits](docs/hriday/evidence/2026-11-11-audit.md) distinguish observed results from pending A1–A14 requirements.

## The demo world

`pnpm seed` creates the source's labelled synthetic B17 world: the three merchants, hoodie and T-shirt populations, shipments, packing photos, seed attestations, verifiable ledgers, complaints, reviews, Alex and simulated network data. It preserves existing Neel sandbox configuration and uses `SEED-` PayPal identifiers. It runs the normal shared-cause scan and Store Report builders. A missing embedding provider leaves the hypothesis pending; the PostgreSQL seed tests inject explicitly synthetic vectors to verify the complete B17 path. Seeded photos and attestations are not real vision evidence.

Alex retains one earlier refund. Under the original points table his fixture is yellow at 25, with filed/lost-dispute, new-address and verified-payer reasons. The source's conflicting refund-ratio narrative remains Q9 in [DECISIONS.md](DECISIONS.md).

## Shopper and PayPal

[Sandbox rehearsal](docs/hriday/sandbox-rehearsal.md) covers Neel/Maya setup, private configuration and actual acceptance recording. The shopper executable uses Fairfold's official SDK MCP client and the PayPal Agent Toolkit, enabling only sandbox create/capture. It skips caution stores, pauses for non-verified-store confirmation, then pauses separately for PayPal approval. Configure a private short-lived `SHOPPER_AGENT_TOKEN` and model access before running:

```sh
pnpm --filter shopper-agent start -- "navy hoodie under $45"
```

The resulting sanitized `docs/agent-run.txt` must come from an actual run; none is manufactured. Return-address offer/accept-claim operations remain blocked at Q2 before OAuth. Unknown external outcomes require reconciliation rather than automatic replay.

## Layout and remaining work

`apps/web` builds the supplied design into browser assets served by `apps/api`; `standalone/` remains the unchanged visual reference. `apps/api` hosts the website, REST/OpenAPI/MCP and demo routes; `apps/worker` runs the 16 job handlers. `packages/paypal` owns PayPal access; `packages/ai` owns model access; `packages/intelligence` computes signals, reports, evidence and shared causes. Contracts, database, jobs, ledger and shopper boundaries remain separate packages. `apps/shopper-agent` is the executable shopper.

[Website/Render handoff](docs/hriday/website-deployment.md) is the current website deployment guide; [earlier backend closeout](docs/hriday/local-closeout.md) retains the account-backed acceptance steps. Render remains the source hosting architecture: one web service for site/API, one worker and PostgreSQL. The Blueprint selects `main`, builds the website, migrates before API start and seeds the labelled demo world after the first API deployment. Automatic deployment stays disabled. Actual hosting, provider/camera evaluations, sandbox acceptance and submission evidence remain pending; no billing details were entered.

Earlier provider measurements remain in [Ishaan's acceptance record](docs/evidence/2026-11-11-intelligence-local-acceptance.md) and [AI usage write-up](docs/ai-tools.md). They are historical measurements with their recorded settings, not newly verified results for the restored source defaults.

[MIT license](LICENSE) © 2026 Hriday and Ishaan.
