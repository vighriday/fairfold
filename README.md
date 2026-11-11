# Fairfold

Fairfold is a neutral witness for both sides of a PayPal payment. It records proof when the merchant packs an order, turns that proof into trust the buyer can see before paying, and links complaints to a shared cause, such as one faulty production batch, before more orders ship. PayPal still holds the money and decides every dispute. Every action that touches a buyer or PayPal needs the merchant's approval first.

Built by Hriday and Ishaan for the PayPal AI Hackathon. The target user is an Indian apparel exporter selling to overseas buyers through PayPal.

> **Status (11 November 2026): work in progress, run locally.** This branch combines Hriday's platform (checkout, verified webhooks, disputes, Pack Station, watchdog, MCP tools and a catalogue seed, all implemented locally) with Ishaan's intelligence layer (Evidence Agent, Buyer Signal, Store Report, Dispute Agent, Shared Cause Detection), tested against PostgreSQL. Real PayPal sandbox acceptance, the Render deployment, the B17 demo seed and the frontend are still pending, so the end-to-end demo does not run yet. All PayPal activity is sandbox-only.

## What it does

| Moment                    | What Fairfold shows or does                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before the buyer pays     | A **Store Report** beside the PayPal button: verifiable facts, the store's fulfilment record and reviews from verified payments, each claim linked to its source.            |
| Before the merchant ships | A **Buyer Signal**: green, yellow, red, or grey for any new buyer, with reasons and a recommended action (never "cancel"). Buyers can see and contest their own band.        |
| At the packing table      | An AI reads the packing photos (item, size label, batch tag, tracking label); code decides whether they match the PayPal order. Evidence is sealed in a hash-chained ledger. |
| When complaints pile up   | **Shared Cause Detection** groups similar complaints and tests which batch, courier, packer or ship week they have in common, then proposes holds, inspections and messages. |
| When a dispute opens      | The **Dispute Agent** builds the evidence pack the dispute reason needs, or recommends inspecting first, or a fair offer, when the merchant's own batch is at fault.         |
| For AI shopping agents    | The same Store Report as an MCP tool, so an agent checks a store before paying.                                                                                              |

**Code decides, the model describes.** Every band, match, recommendation and statistic is computed by tested TypeScript. The model only reads photos and complaints, groups review themes, and drafts text, through one gateway with structured output, a timeout, and a fixed fallback. Text from buyers and reviewers is passed as quoted untrusted data with no tools. See [AI tools and how we used them](docs/ai-tools.md).

## Repository layout

```text
apps/
  api/            Fastify API with OpenAPI at /docs; routes/intel/ holds the intelligence endpoints
  worker/         pg-boss worker running the job handlers
packages/
  contracts/      shared types, zod schemas and job names
  db/             Drizzle schema and SQL migration (PostgreSQL 16)
  ledger/         hash-chained ledger and content-addressed evidence storage
  jobs/           pg-boss wrapper
  paypal/         sandbox-only PayPal client, checkout, webhooks, disputes and approved actions
  shopper/        the AI shopping agent's MCP client
  ai/             the only code that talks to a model provider
  intelligence/   Evidence Agent, Buyer Signal, Store Report, Dispute Agent, Shared Cause Detection, evals
scripts/          setup, seed, migrations, webhook registration and test launchers
```

## Run it locally

Prerequisites: Node.js 22.16 or newer, pnpm 12.4.2 (pinned in `package.json`), and Docker for PostgreSQL 16.

```sh
pnpm install --frozen-lockfile
pnpm setup:local        # creates an ignored .env with fresh local keys; never overwrites an existing one
docker compose up -d    # PostgreSQL 16 on localhost:5432
pnpm db:migrate
pnpm seed               # the synthetic demo world (batch B17); see "The demo world" below
pnpm dev                # API on http://localhost:3000 (Swagger UI at /docs) and the worker
```

### AI configuration (free)

Fairfold runs on Google Gemini's free tier; no billing is needed. Create a key at [Google AI Studio](https://aistudio.google.com), then set these in `.env`:

```sh
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=your-key
AI_MODEL_VISION=gemini-3.5-flash
AI_MODEL_TEXT=gemini-3.5-flash-lite
AI_EMBEDDING_PROVIDER=google
AI_MODEL_EMBEDDING=gemini-embedding-2
CLUSTER_SIMILARITY=0.85
```

Without a key, every AI step uses its fixed fallback and the rest of the app still works. xAI, OpenAI and Anthropic are supported by changing `AI_PROVIDER` and the model ids. The free tier allows about 20 requests per model per day; set `AI_CACHE_DIR` to cache model answers by input hash.

## Tests and evaluation

```sh
pnpm test              # offline unit and API tests; no network
pnpm test:db           # adds PostgreSQL integration tests (needs TEST_DATABASE_URL, an isolated *test database)
pnpm --filter @fairfold/intelligence test:db   # the intelligence package's unit and PostgreSQL tests
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:sandbox      # PayPal sandbox checks; SKIPPED without credentials
pnpm test:e2e          # starts the assembled local runtime for a credential-free smoke check
pnpm --filter @fairfold/intelligence eval                 # prints the evaluation table
pnpm --filter @fairfold/intelligence cost <eval log>      # call-log summary: calls, failures, tokens
```

Offline tests do not contact external services. Database integration checks require an isolated loopback PostgreSQL 16 database named `fairfold_*test` in `TEST_DATABASE_URL`; they are skipped by the default offline run and explicitly executed by `test:db`. Sandbox checks report SKIPPED when credentials are absent. With `TEST_DATABASE_URL` set, `test:e2e` starts the assembled local runtime and performs a credential-free smoke check; without it, the command reports SKIPPED. Neither local smoke nor database tests satisfy the acceptance tests A1–A14.

Tests never call a real model; the database test launcher strips model settings before it runs.

Evaluation results measured on 10 November 2026 (details and method in [docs/ai-tools.md](docs/ai-tools.md)):

| Set                                         | Target                 | Result                                                           |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| 24 complaint texts, 3 true clusters + noise | Precision ≥ 0.85       | 1.00 over 45 grouped pairs (Gemini embeddings); re-run pending\* |
| 8 scripted disputes                         | 8 of 8                 | 8 of 8                                                           |
| 30 synthetic buyer profiles                 | 30 of 30               | 30 of 30                                                         |
| Batch B17 scenario (unit fixture)           | B17, strong            | B17, strong: rate ratio 30, p 0.000129, q 0.00154                |
| Same volume, no defect                      | No hypothesis          | No hypothesis                                                    |
| 20 packing-photo sets                       | ≥ 18 of 20; ≥ 16 of 20 | Not measured yet (free-tier quota; current photos are synthetic) |

\* Measured before the cluster centroid became the exact normalised mean of its members ([DECISIONS.md](DECISIONS.md) I-D24); re-run the evaluation before quoting it.

## PayPal platform

The PayPal side is built in `packages/paypal` (sandbox-only client, checkout, webhooks, disputes and approved actions), `apps/api` (checkout, orders, Pack Station, disputes, alerts, MCP and the demo-only `/dev` harness) and `apps/worker`. Start with the [platform build guide](docs/hriday/README.md) and the [current status](docs/hriday/status.md); the [sandbox rehearsal guide](docs/hriday/sandbox-rehearsal.md), [H2 closeout](docs/hriday/h2-closeout.md), [H3 closeout](docs/hriday/h3-closeout.md), [checkout guide](docs/hriday/checkout-integration.md) and [H3 acceptance guide](docs/hriday/h3-acceptance.md) cover the local rehearsal and the remaining real-account steps. Real SDK purchases, webhook delivery and hosted readiness are not yet verified.

### The demo world

`pnpm seed` builds the same synthetic world every time (architecture section 19): Neel Block Prints (the sandbox merchant `pnpm setup:sandbox` connects), Indigo Loom and QuickTees Outlet; 239 delivered hoodie orders from batches B14–B17 and 4 in transit, 18 hoodie orders waiting to be packed, 80 T-shirt orders and one shipment the watchdog flags; the 12 complaint and 85 review texts from `packages/intelligence/eval/fixtures/`, with pre-read extractions so no model reads them; Alex R., whose history makes his signal yellow; and simulated network data for 10 buyers. Every order has its shipment, packing photo, attestation (`model = 'seed'`) and verifiable ledger. It ends with one shared-cause scan and the three store reports: batch B17 is a strong shared cause (5 of 39 orders, p ≈ 0.0006, q ≈ 0.007) with 18 orders to hold, and the stores are verified, verified and caution. It makes no PayPal request, every seeded PayPal id starts with `SEED-`, and running it again changes nothing.

## Data and labels

All stores, buyers and orders in the tests and seed are fictional and synthetic. Seeded PayPal identifiers start with `SEED-`. Cross-merchant buyer data appears only as a clearly labelled simulation of a tier only PayPal could run. Stored buyer emails and addresses are never sent to a model, and emails and phone numbers that a buyer types into a complaint, review or dispute message are removed in code before any model reads the text. A street address typed into free text is not detected.

## More

- [AI tools and how we used them](docs/ai-tools.md)
- [Decisions and contract questions](DECISIONS.md)
- [Change history](CHANGELOG.md)
- [Platform build guide (Hriday)](docs/hriday/README.md)
- [Contributor instructions](AGENTS.md)

## Licence

[MIT](LICENSE) © 2026 Hriday and Ishaan.
