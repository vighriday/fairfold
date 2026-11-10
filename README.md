# Fairfold

Fairfold is a neutral witness for both sides of a PayPal payment. It records proof when the merchant packs an order, turns that proof into trust the buyer can see before paying, and links complaints to a shared cause, such as one faulty production batch, before more orders ship. PayPal still holds the money and decides every dispute. Every action that touches a buyer or PayPal needs the merchant's approval first.

Built by Hriday and Ishaan for the PayPal AI Hackathon. The target user is an Indian apparel exporter selling to overseas buyers through PayPal.

> **Status (10 November 2026): work in progress.** This `ishaan` branch has the backend foundation and the complete intelligence layer, tested locally against PostgreSQL. PayPal checkout, dispute filing, the Pack Station flow, the MCP server and the frontend are still being built on the `Hriday` branch, so the end-to-end demo does not run yet. All PayPal activity is sandbox-only.

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
  ai/             the only code that talks to a model provider
  intelligence/   Evidence Agent, Buyer Signal, Store Report, Dispute Agent, Shared Cause Detection, evals
scripts/          setup, migrations and test launchers
```

## Run it locally

Prerequisites: Node.js 22.16 or newer, pnpm 12.4.2 (pinned in `package.json`), and Docker for PostgreSQL 16.

```sh
pnpm install --frozen-lockfile
pnpm setup:local        # creates an ignored .env with fresh local keys; never overwrites an existing one
docker compose up -d    # PostgreSQL 16 on localhost:5432
pnpm db:migrate
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
pnpm typecheck
pnpm lint
pnpm --filter @fairfold/intelligence eval                 # prints the evaluation table
pnpm --filter @fairfold/intelligence cost <eval log>      # call-log summary: calls, failures, tokens
```

Tests never call a real model; the database test launcher strips model settings before it runs.

Evaluation results measured on 10 November 2026 (details and method in [docs/ai-tools.md](docs/ai-tools.md)):

| Set                                         | Target                 | Result                                                           |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| 24 complaint texts, 3 true clusters + noise | Precision ≥ 0.85       | 1.00 over 45 grouped pairs (Gemini embeddings)                   |
| 8 scripted disputes                         | 8 of 8                 | 8 of 8                                                           |
| 30 synthetic buyer profiles                 | 30 of 30               | 30 of 30                                                         |
| Batch B17 scenario (unit fixture)           | B17, strong            | B17, strong: rate ratio 30, p 0.000129, q 0.00154                |
| Same volume, no defect                      | No hypothesis          | No hypothesis                                                    |
| 20 packing-photo sets                       | ≥ 18 of 20; ≥ 16 of 20 | Not measured yet (free-tier quota; current photos are synthetic) |

## Data and labels

All stores, buyers and orders in the tests and seed are fictional and synthetic. Seeded PayPal identifiers start with `SEED-`. Cross-merchant buyer data appears only as a clearly labelled simulation of a tier only PayPal could run. No buyer email or street address is ever sent to a model.

## More

- [AI tools and how we used them](docs/ai-tools.md)
- [Decisions and contract questions](DECISIONS.md)
- [Change history](CHANGELOG.md)
- [Platform build guide (Hriday)](docs/hriday/README.md)

## Licence

[MIT](LICENSE) © 2026 Hriday and Ishaan.
