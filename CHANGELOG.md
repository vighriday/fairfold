# Changelog

All authored work in this checkout is on `Hriday`. Entries distinguish documentation preparation from working application delivery. Dates use IST.

## 2026-11-09 — H2.2a Orders create, capture and get

- Implemented the existing create/capture/get contracts using the sandbox merchant transport. Create sends one CAPTURE purchase unit, stable identifiers, string quantities and exact BigInt-derived totals; wire currency precision and numeric(12,2) bounds are checked without changing shared Money.
- Added sandbox approval-link checks, modern/legacy payer parsing, actual capture status and seller protection, nullable absent fields and exact CaptureResult field mapping. Raw responses remain transient; no capture persistence or route was added.
- Added validated transport responses so shape failures retain PayPal's debug ID and an explicit ambiguous-mutation flag without logging vendor bodies or payer fields. Such failures are not replayed.
- Verified current official Orders 2.36 schema and currency documentation against the original H2 source. Retained the existing PostOpts limit and shared interfaces; no dependency version changed.
- Added 34 synthetic Orders cases. The full offline suite passed 83 tests with 17 DB checks skipped; typecheck and lint passed. Recorded scope, source digest and pending real sandbox/hosting/privacy gates in the Orders evidence record.

## 2026-11-09 — H2.1 sandbox authentication and HTTP transport

- Implemented merchant-scoped encrypted credential lookup and sandbox-only OAuth/HTTP transport inside `packages/paypal`, using existing shared crypto, clock, PostOpts and error helpers. No shared contract, schema, API route, worker or Ishaan-owned package changed.
- Added per-merchant/version in-memory token caching with early refresh, concurrent-grant coalescing, rotation/removal handling and rejected-token invalidation. Credentials and tokens are not logged or persisted by the transport.
- Added bounded exponential retries with stable POST bodies/request IDs, explicit operation idempotency for 5xx replay, no ambiguous network replay, redirect rejection and safe debug-ID/symbolic-error diagnostics.
- Added 30 synthetic offline transport cases and two real PostgreSQL credential-provider cases. The full offline suite passed 49 tests with 17 DB checks skipped; the explicit isolated database suite passed all 17 tests. Typecheck, lint and formatting passed.
- Resolved the new workspace importer with the existing dependency versions and policies. Offline install encountered an absent cached tarball; the normal install passed policy checks. The lockfile changes only the new package importer.
- Recorded exact scope and results in the H2 guide/status/evidence. Checkout operation bindings, full ForMerchant, persistence/privacy review, routes, `/dev`, real sandbox A4 and H1 hosting remain pending.

## 2026-11-09 — Continue locally while hosting is pending

- Recorded the user's instruction to wait for Render synchronization and continue the next local pieces, retaining H1's hosted gate and H2's sandbox acceptance gate.
- Distinguished the reported Blueprint-capacity issue from the supplied screenshot's confirmed payment-information requirement. No reset time, payment, resource creation or change of service plan was claimed.
- Prepared a conditional Ishaan deployment handoff and an ordered H2 work plan. No message was sent and deployment ownership was not reassigned.
- Updated branch instructions and O15 to allow sequential local H2 increments while hosting is pending. Q3 still gates capture persistence; H3–H8 remain unstarted. Application files are unchanged in this documentation increment.

## 2026-11-09 — H1 initial hosted URL bootstrap

- Added Render-only URL defaults from its assigned public URL, preserving explicit APP_BASE_URL/FRONTEND_ORIGIN overrides and strict local configuration. The API, worker, Postgres and CORS architecture are unchanged.
- Removed the two initial URL prompts from the Blueprint. The only manual secret remains APP_ENCRYPTION_KEY; its required base64 format is unchanged.
- Added four configuration regression cases. All 19 offline tests, typecheck and lint passed. Actual local HTTP smoke confirmed assigned URL defaults, database readiness, Swagger and restricted CORS.
- Validated the revised Blueprint against the official JSON Schema. Installed official Render CLI 2.36.0 as ignored workspace tooling and verified its release digest; platform validation remains blocked by absent workspace access.
- Added `docs/hriday/render-deployment.md` and a verification record with the exact Dashboard handoff. H1's hosted deployment remains pending; no cloud resource or PayPal/model action was created.

## 2026-11-09 — Render installation confirmed

- Confirmed Render is installed after the user reported adding it and signing in. Cloud account/workspace access is not yet independently verified because Render's deployment tools are absent from this conversation.
- Attempted the signed-in browser fallback; its local helper failed during initialization. The native fallback also could not initialize. No resource, billing, environment or deployment change was made.
- After explicit Render selection, its deployment skills loaded, but account-management tools are still absent. Updated status, the H1 guide and evidence to use the initial Dashboard Blueprint flow instead of repeating installation or selection. This documentation increment does not change application files or the earlier preflight result.

## 2026-11-09 — H1 Render deployment preflight

- Recorded the user's choice to connect Render and finish H1 before H2. Render account connection is still pending; no hosted resources were created.
- Validated `render.yaml` against Render's official current JSON Schema and recorded the schema digest. The existing blueprint passed without changes.
- Ran `pnpm build` and local Render-mode API/worker smoke checks. Injected port handling, loopback/non-loopback HTTP readiness, Swagger/OpenAPI and explicit stub worker readiness passed. Temporary test processes were stopped.
- Recorded actual checks and remaining hosted acceptance gates in `docs/hriday/evidence/2026-11-09-render-preflight.md`. Application files, architecture and existing test results are unchanged.

## 2026-11-09 — Hriday branch publication

- Published the ten reviewed incremental commits to `origin/Hriday` at the user's request and set the local branch to track it. The first published tip was `52f7c84d4a83423c3fcda8b3998a2bb01e7f0834`, verified with `git ls-remote`.
- Audited every published commit for private paths and credential patterns before the normal push. Internal documents, local credentials and working artifacts remain excluded. No force push or main-branch update was used.
- Added this focused documentation follow-up to record publication. Application files and the existing test results are unchanged; Render deployment and PayPal sandbox checks remain pending.

## 2026-11-09 — Incremental H1 history reconstruction

At the user's request, the unpublished H1 commit `d1f3055` was replaced by focused dependency-ordered commits. The original research commit `b48f674` remains intact. This is a reorganization of previously implemented work, not its original development timeline. Application files are preserved; the first Render deployment and real PayPal checks remain pending.

| Step | Scope                                                                                              | Snapshot validation                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | Pinned tooling, local secret setup and explicit unfinished test commands                           | Frozen dependency install, typecheck, lint and source formatting PASS; 0 offline tests (no tests exist at this tooling-only step)                          |
| C2   | Typed contracts, encryption, clock, safe stubs and permitted intelligence boundaries               | Frozen dependency install, typecheck, lint and source formatting PASS; 6 offline tests PASS                                                                |
| C3   | Source SQL, Drizzle schema, migration/reset tooling and isolated integration-test launcher         | Frozen dependency install, typecheck, lint and source formatting PASS; 6 offline tests; 3 PostgreSQL tests PASS                                            |
| C4   | Canonical hashing, transactional ledger, normalized images, byte-preserving PDFs and storage tests | Locked installed dependencies verified/reused, typecheck, lint and source formatting PASS; 8 offline tests; 10 PostgreSQL tests PASS                       |
| C5   | Named queues, payload validation, scheduling, debounce and transaction tests                       | Locked installed dependencies verified/reused, typecheck, lint and source formatting PASS; 8 offline tests; 15 PostgreSQL tests PASS                       |
| C6   | Fastify, demo authentication, ownership hooks, limits, safe errors/logging and API tests           | Locked installed dependencies verified/reused, typecheck, lint and source formatting PASS; 15 offline tests; 15 PostgreSQL tests PASS                      |
| C7   | Explicit stub worker startup and API/worker development command                                    | Locked installed dependencies verified/reused, typecheck, lint and source formatting PASS; 15 offline tests; 15 PostgreSQL tests PASS                      |
| C8   | API/worker/Postgres deployment configuration; deployment remains pending                           | Application sources unchanged from validated C7; YAML/format checks PASS; no redundant application test rerun                                              |
| C9   | Actual H1 evidence, architecture-grounded handoff/status and history reconstruction record         | Application sources unchanged from validated C7; YAML/format checks PASS; final file/privacy/ancestry/link audit PASS; no redundant application test rerun |

## 2026-11-09 — H1 local foundation

### Implemented

- Began H1 after the user confirmed sandbox accounts are absent and authorized building around that dependency. The real pre-H1 spike is deferred, not recorded as passed.
- Added a pinned TypeScript/pnpm workspace with strict type checking, ESLint, Prettier, Vitest, lockfile, local-secret setup and explicit sandbox/end-to-end test status commands.
- Added shared PayPal/AI/API/shared-cause/job contracts, injectable clock, AES-256-GCM encryption helpers and clearly labelled safe intelligence stubs.
- Added the exact source SQL migration and matching Drizzle declarations for 25 tables and 253 columns, PostgreSQL 16 Compose configuration, idempotent migrations and a guarded local reset command.
- Implemented transactional ledger append/verification, canonical JSON, image validation/EXIF inspection/normalization/deduplication, merchant-local photo reuse lookup and byte-preserving PDF storage.
- Implemented validated pg-boss publication/handlers, all 16 named queues, scheduling, per-merchant delayed scan coalescing and optional transaction-aware publication.
- Implemented the Fastify foundation with health/OpenAPI/demo login, role/subject authentication, safe errors/logging, CORS, global and upload rate limits, multipart limits and worker bootstrap.
- Prepared the Render API/worker/Postgres 16 blueprint, pinned both services to `Hriday` and disabled automatic deployment. No Render deployment or purchase was performed.

### Verified

- Installed official PostgreSQL 16.15 as ignored workspace tooling and used only new isolated loopback Fairfold databases. The installed PostgreSQL 17 instance and Windows services were unchanged.
- `pnpm db:migrate`, 15 offline tests, 15 PostgreSQL integration tests, typecheck, lint and formatting checks passed. Default offline tests do not open a database solely because TEST_DATABASE_URL exists; the database launcher explicitly opts in and validates the target.
- Verified all 253 columns, ledger concurrency/tampering/rollback, normalized image dedupe, exact PDF bytes, queue delivery/debounce/scheduling/rollback, auth/ownership/expiry, upload limits and error/log redaction.
- Verified the running API's database health, Swagger HTML/OpenAPI and demo-token issuance over HTTP, and the worker's explicit stub/zero-handler startup. Local API is configured on port 3110.
- Recorded the actual verification and limitations in `docs/hriday/evidence/2026-11-09-h1-local.md`; local setup and Ishaan's handoff are in `docs/hriday/h1-foundation.md`.
- Rechecked unchanged source-document digests, exact source SQL migration fidelity, all 28 local links across 16 Markdown documents and private-file exclusions.

### Still pending

- First Render deployment, full deployed acceptance suite and browser visual check. H1 remains IN PROGRESS until its first deployment gate passes.
- Real PayPal sandbox spike/actions and all model evaluations. `pnpm test:sandbox` correctly reported SKIPPED without credentials; `test:e2e` explicitly reports that the later suite is not implemented.
- H2–H8, Figma frontend integration, remote publication and actual team handoff. No outbound team message or submission was sent.

## 2026-11-09 — Research and documentation baseline

### Added

- Initialized the local Git checkout on the exact `Hriday` branch and configured the supplied repository as origin; the read-only remote check exposed no refs.
- Protected private internal documents, credentials and local inspection/evidence artifacts through `.gitignore`.
- Added `AGENTS.md` to preserve source authority, ownership, branch, privacy, PayPal sandbox and current documentation-only scope.
- Added a truthful project README, the source-prescribed MIT licence and the Hriday documentation index.
- Audited both internal DOCX documents in full, inspected six embedded diagrams, and recorded original SHA-256 digests without editing or committing the originals.
- Created a fixed-decision register for D1–D18, operational clarifications and Q1–Q13 for unresolved contract/runtime questions.
- Verified primary PayPal/hackathon sources and recorded R01–R23, vendor versions, source discrepancies and untested behavior.
- Prepared the pre-H1 sandbox dispute runbook, concrete PowerShell/request examples and an empty result record.
- Expanded H1–H8 into a sequential plan with task outputs, dependency/ownership boundaries and acceptance evidence.
- Inventoried all 42 source endpoint contracts, 16 jobs, 25 tables and the prescribed environment variables.
- Added A1–A14 validation procedures, seed-versus-live distinctions, measured-eval handoff, demo/submission preparation, evidence-record template and current work/risk board.

### Clarified

- The user explicitly selected research and documents first; no application scaffolding or implementation was authorized for this pass.
- The user's single `Hriday` branch overrides the source's branches-per-task/direct-main workflow. No main branch was modified.
- Specific checkout requirements use a client ID; standard dispute creation uses the sandbox buyer's Resolution Center; shared-contract changes require review.
- CP0's original 8 November target has passed and remains unverified. Other source milestones and the product scope were preserved.

### Validation

- Verified 14 Markdown documents and 20 local links; all targets exist.
- Verified inventories against the source: 42 endpoints, 16 expected jobs, 18 fixed decisions, 13 open questions and 14 acceptance checks.
- Rechecked both original DOCX SHA-256 digests; both unchanged. Confirmed `Hriday`, private-directory/credential exclusions and absence of application scaffolding.
- Prepared the local baseline commit `DOCS: establish Hriday research and execution baseline`; Git history is the authoritative commit identifier. No H task is marked complete.
- Application tests, sandbox actions, AI evaluations and deployments: NOT RUN. No application or dependency installation was created. No outbound team message, remote push, video upload or hackathon submission was performed.
