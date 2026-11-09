# H1 local foundation and handoff

The documented H1 backend now runs locally on the selected TypeScript, Fastify, PostgreSQL, Drizzle and pg-boss architecture. The user authorized proceeding while the real PayPal sandbox accounts are absent. This guide describes implemented behavior; later PayPal/product tasks remain pending.

**H1 is still in progress:** local verification is complete, but the first Render deployment has not occurred. No PayPal transaction, model evaluation or full product acceptance is claimed.

## Implemented surfaces

| Surface                | Implemented behavior                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared contracts       | PayPal client types/capture schemas, AI/shared-cause/API DTOs, job names/payloads, clock and AES-256-GCM helpers                                                    |
| Database               | Exact source SQL migration plus matching 25-table, 253-column Drizzle schema; UTC connections; idempotent migration tracking                                        |
| Ledger                 | Order-row locking, sequential SHA-256 chain, exact millisecond timestamps, canonical JSON, verification and parent-transaction participation                        |
| Blobs                  | JPEG/PNG validation, EXIF inspection, 2,048 px JPEG normalization, content-addressed dedupe, merchant-local reuse lookup, PDF pass-through, expiry/integrity errors |
| Jobs                   | All 16 named queues, validated publish/work, scheduling, delayed per-merchant scan coalescing and optional existing-transaction publication                         |
| API                    | Demo login, role/subject hooks, fixed error envelope, OpenAPI/Swagger, database readiness, CORS, 60-request and 10-upload limits, multipart limits and safe logging |
| Worker                 | pg-boss startup and intelligence handler-map registration; zero intelligence handlers is explicit                                                                   |
| Intelligence boundary  | Source-required skeletons and valid, clearly labelled stubs; no live scoring, model or statistical decision                                                         |
| Deployment preparation | Source-prescribed Render API/worker/Postgres 16 blueprint; not deployed                                                                                             |

The only implemented application routes are POST `/api/auth/demo-login` and GET `/healthz`, plus Swagger `/docs/` and `/docs/json`. Checkout, packing/dispute routes, MCP and the Figma frontend arrive in their assigned tasks. The ledger and storage are tested package APIs; they are not exposed as premature fulfilment endpoints.

## Local setup with Docker

Use Node 22.16 or newer and pnpm 12.4.2. The lockfile pins all dependencies. The package manager allows build scripts only for esbuild and sharp.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
docker compose up -d
pnpm db:migrate
pnpm dev
```

The API defaults to port 3000. `setup:local` generates only local signing/encryption keys in ignored `.env`, retains an existing file, and leaves external credentials blank. The pg-boss worker and API share the configured PostgreSQL database. Docker binds its database to loopback.

For database tests, create a separate test database once, for example `docker compose exec postgres createdb -U fairfold fairfold_h1_test`, then set `TEST_DATABASE_URL=postgres://fairfold:fairfold@localhost:5432/fairfold_h1_test` in ignored `.env`. The test launcher refuses a non-loopback target or a database name outside the `fairfold_*test` pattern.

`pnpm db:reset --confirm` is intentionally destructive and restricted to a local Fairfold-named database. It is not part of normal startup and was not used against an existing user database.

## This workspace's native PostgreSQL setup

Docker is not installed here. H1 validation therefore used the official PostgreSQL 16.15 Windows archive in ignored `.work/postgres16/`, an isolated cluster in `.work/pg16-data/`, and only new Fairfold databases on **127.0.0.1:55432**. The existing installed PostgreSQL 17 installation was not changed. No Windows service was installed.

The local `.env` points to `fairfold_h1_dev` and `fairfold_h1_test`. The API is configured for **http://localhost:3110**. API and worker verification processes were started hidden; their local logs and process metadata are ignored under `.work/`.

To restart this existing development cluster if it is stopped:

```powershell
& ./.work/postgres16/pgsql/bin/pg_ctl.exe -D ./.work/pg16-data -l ./.work/pg16-server.log -o '-h 127.0.0.1 -p 55432' -w start
pnpm db:migrate
pnpm dev
```

Start only one API instance on the configured port. The running verification instance already serves [Swagger UI](http://localhost:3110/docs/) and [health](http://localhost:3110/healthz). The archive/cluster are local test tooling, not repository deliverables. For a fresh checkout, use Compose or a separately installed PostgreSQL 16. Official download entry point: [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/).

## Demo authentication

POST `/api/auth/demo-login` accepts `role` and its predefined `subjectId` only while DEMO_MODE is true. Tokens expire after one hour and carry issuer/audience/role/subject constraints. Unknown role/subject combinations are refused. The endpoint is disabled outside demo mode; it is not production authentication.

| Role     | Subject ID                             |
| -------- | -------------------------------------- |
| merchant | `00000000-0000-4000-8000-000000000001` |
| buyer    | `00000000-0000-4000-8000-000000000002` |
| admin    | `00000000-0000-4000-8000-000000000003` |
| agent    | `00000000-0000-4000-8000-000000000004` |

These are public fictional demo identifiers, not PayPal credentials. Business data is not yet seeded; the H8 seed must associate its demo actors consistently. A role hook does not replace resource ownership checks; `requireSubject` is provided and tested for those boundaries.

## Verification and limits

Use the [actual local verification record](evidence/2026-11-09-h1-local.md). `pnpm test` runs offline unit/API-injection checks and explicitly skips the database suites by default, even when TEST_DATABASE_URL exists. `pnpm test:db` validates that isolated URL, explicitly opts in and runs the PostgreSQL integration suites. Do not count the offline skips as passing integration checks.

`pnpm test:sandbox` reports SKIPPED without credentials. If credentials are supplied before H2's real suite exists, it reports NOT RUN and fails rather than presenting a false success. `pnpm test:e2e` similarly reports that the full A1–A14 suite is not implemented yet.

The API rejects a live PAYPAL_API_BASE before boot. The current foundation performs no PayPal API calls. Intelligence stubs cannot assert a match or automatically recommend filing evidence. EXIF flags describe metadata observations, not proof of capture time; H5 must include those flags in the photo ledger payload.

## Handoff to Ishaan

- Import shared types/schemas from `@fairfold/contracts`, named job contracts from its jobs export, and the fixed stubs from `@fairfold/contracts/stubs`.
- Import `createDatabase`/typed SQL-named tables from `@fairfold/db`; use `createLedger(db, clock)` and `createBlobStore(db, clock)` for evidence. To join a caller's transaction, construct these helpers with that transaction.
- Register jobs through `createJobs`. The wrapper validates at publish and worker entry. `publishDebounced('sharedcause.scan', merchantId, 60)` maintains a single delayed pending scan for that merchant, without editing an active scan.
- `publish` accepts an optional existing pg-boss-compatible transaction adapter. Its rollback behavior is tested; H3 still needs to implement and prove the full verified-event/store/enqueue recovery flow.
- `packages/ai`, `packages/intelligence` and `apps/api/src/routes/intel/` contain only the initial boundaries expressly permitted in H1. Ishaan owns their implementations after this handoff. His intel route schemas are still supplied by review; they have not been invented here.
- Review Q2–Q13 before affected integration work. The initial H1 payload schemas make previously unspecified job shapes concrete; shared changes still need review. No message or PR has been sent on the team's behalf.

## First Render deployment gate

`render.yaml` declares the selected web service, background worker and PostgreSQL 16. Both services explicitly use the repository's `Hriday` branch with automatic deployment disabled. It uses the current small database plan identifier, blocks external database access and applies migrations as the API pre-deploy command. The declared service plans require billing; no service or purchase has been made. These fields follow the [Render Blueprint specification](https://render.com/docs/blueprint-spec).

Before deployment, establish the intended Render workspace/project and repository branch access. Supply APP_BASE_URL and FRONTEND_ORIGIN for the actual hosted surfaces, a canonical-base64 32-byte APP_ENCRYPTION_KEY, and the generated signing secret. Keep secret values out of commits and logs. Later PayPal/model credentials must be configured for the processes that use them when their tasks arrive.

The Render integration was found and suggested, but installation/connection is not confirmed. Until authorized access exists, retain this gate as PENDING. After deployment, verify actual `/healthz`, Swagger and worker startup, record the deployed commit/URLs and only then mark H1 complete. The existing user instruction keeps all source work on `Hriday`.

The user has now explicitly selected connecting Render and completing this deployment. The [9 November preflight](evidence/2026-11-09-render-preflight.md) validates the unchanged blueprint against Render's official schema and verifies local startup with Render host/port settings. These checks passed; the actual account connection and hosted verification remain pending.
