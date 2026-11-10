# Changelog

All authored work in this checkout is on `Hriday`. Entries distinguish documentation preparation from working application delivery. Dates use IST.

## 2026-11-10 — Ishaan: intelligence Phase 2 robustness for the free model tier (`ishaan` branch)

- I6: buyer messages are drafted template-first. The Message Drafter now makes at most one model call per hypothesis and level, writing a template with `{order}` and `{product}` placeholders that code fills with each buyer's own order; before, it made one call per buyer (38 for the seeded B17 hypothesis, about two days of Gemini's free text quota). The template is stored in the `send_buyer_messages` payload, so a re-scan that adds buyers costs no call; an unusable draft (no `{order}`, another placeholder, too long, or a buyer's name) falls back to the fixed template. Six new unit tests and one PostgreSQL test; DECISIONS.md I-D10 (amended).
- I4: review themes are reused while the store's reviews are unchanged. A Store Report refresh compares the hash of exactly what the Review Themer would read (ids, ratings and texts of the counted reviews) with the hash stored beside the last report, and reuses its themes without a model call when they match; a new review, a changed rating or text, or a review weighted out asks again. A fallback is never reused. The hash is kept inside `store_reports.report` and stripped by `StoreReportSchema`, so no response changes. Three new unit tests and one PostgreSQL test; DECISIONS.md I-D25.
- I6: the seed complaints are pre-read. Each of the 12 seed complaints in `eval/fixtures/complaints.json` now carries a hand-written ComplaintExtraction marked `model: "seed"`, so `scripts/seed.ts` can store it without a Complaint Reader call (12 free-tier text requests saved). The shared-cause scan now embeds all read complaints that have no vector in one batched embedding request before grouping, so seeded rows group with live complaints in the same embedding space. One fixture test and one PostgreSQL test; DECISIONS.md I-D26.
- I1/I6: `embed()` now has the 30-second timeout and the no-retry-on-refusal policy of every other model call (it used the AI SDK defaults: no timeout and two automatic retries, so one 429 cost three requests), and logs `ok`, latency and the HTTP status of a failure. A failed embedding no longer fails `complaint.created`: the extraction is saved without a vector, the scan goes on without that complaint, and the next scan embeds it. Three new unit tests and one PostgreSQL test; DECISIONS.md I-D27.
- I2–I6: over-long model text is cut by code instead of failing the schema. A 141-character complaint summary used to fail validation, spend a retry and turn the complaint into category `other`; the schemas the models fill no longer carry length limits, and code cuts the summary (140), theme labels (60, at most 8 themes), the Buyer Signal sentence (240) and the dispute narrative (2,000, whole sentences, grounding checked after the cut). Eight new unit tests; DECISIONS.md I-D28.
- I3/I4: wording post-checks. A Buyer Signal sentence that tells the merchant to cancel, not to ship or to refuse the order is replaced by the template sentence; a review theme whose label is not neutral (praise, disparagement or an accusation such as "great", "poor" or "scam") is not shown. Twenty-two new unit tests; DECISIONS.md I-D29.
- I1: emails and phone numbers are removed from buyer-written text before it reaches a model. Every untrusted text passed to `generateStructured` (complaints, reviews, dispute messages) has email addresses replaced with `[email removed]` and phone numbers with `[phone removed]`; dates, prices, SKUs, order ids and tracking numbers are kept. README.md and docs/ai-tools.md now state exactly that, and that a street address typed into free text is not detected. Thirteen new unit tests; DECISIONS.md I-D30.
- I4: catalogue search matches every word of the query against the product's name, SKU, colour and description, so A13's "navy hoodie" finds a hoodie whose colour is navy; it used to match the whole phrase against the name or SKU only and found nothing. One PostgreSQL test updated with the new cases; DECISIONS.md I-D31.

## 2026-11-10 — Ishaan: intelligence Phase 1 fixes (`ishaan` branch)

- I3: one Buyer Signal per order, computed at capture (section 10). `computeBuyerSignal(orderId)` now returns the stored signal when one exists, so Hriday's order-detail read no longer writes a row and spends a model call on every page view, and a redelivered `order.captured` job stores nothing new. Concurrent first calls are serialised per order with a transaction-scoped advisory lock (no schema change). Three new PostgreSQL tests; 233 intelligence tests, 238 offline tests, typecheck and lint pass. DECISIONS.md I-D17.
- I6: a safety-severity complaint now raises a `safety_complaint` alert as soon as the Complaint Reader reads it (section 12), not only when it joins a significant shared cause. The extraction and the alert are saved in one transaction; alerts are deduplicated per merchant, type and ref under an advisory lock, shared by the reader and the scan. One new PostgreSQL test; 234 intelligence tests pass. DECISIONS.md I-D18.
- I2: photos a buyer attaches to a problem report are now described by the Evidence Agent with step `buyer_photo` when the complaint is read, and stored as an attestation without a ledger entry (once per set of photos; purged photos are skipped). For buyer photos the status answers "do they show the item that was ordered?": a visible defect is the complaint itself, and an unreadable size label or the unit count is not compared; a different colour or a readable size that differs is a mismatch. Nine new unit tests and one PostgreSQL test; 247 offline and 244 intelligence tests pass. DECISIONS.md I-D19.
- I5: the evidence pack now shows the buyer's own photos beside the packing photos, taken from every complaint on the order (problem reports, low reviews; at most 6) instead of only the dispute complaint, which never carries images. The latest `buyer_photo` check is stated in the PDF and as one code-written line in the merchant's rationale ("may show a different item … PayPal's reviewer decides"); it never changes the recommendation and never enters the filed evidence JSON. Two new PostgreSQL tests (the stored PDF embeds the buyer's photo; the flag reaches the rationale); 246 intelligence tests pass.
- I5: section 12's evidence-integrity flags are now shown in the pack. A packing photo whose SHA-256 is also recorded for another order of the same store (H1's `photoUsedByMerchant` lookup) and a photo whose EXIF time is outside the upload window each produce one code-written line in the merchant's rationale and a flag in the PDF caption; until now the EXIF flag reached only the PDF and reuse was never shown. Flags never change the recommendation. Two new PostgreSQL tests; 248 intelligence tests pass. DECISIONS.md I-D20.
- I2: a pack attestation now covers every photo taken for the order so far, not only the latest upload. Photos uploaded one at a time from a phone were each judged alone, so the latest attestation (the one the seal checks) could see only the sealed parcel and read the item as missing. An upload re-shooting a label replaces the earlier photo (a retake), at most 6 photos are kept (oldest carried-over dropped first), and an upload without batch codes keeps the batch entered earlier so its inspection rule still applies. Four new unit tests and one PostgreSQL test; 251 offline and 253 intelligence tests pass. DECISIONS.md I-D21.
- Section 15 contract: `readComplaint(complaintId)`, `runSharedCauseScan(merchantId)`, `draftBuyerMessages(hypothesisId, level = 'suspected')` and `attestPackingPhotos(input)` again have the documented signatures and run on the process runtime; the runtime-injected implementations are `readComplaintWith`, `runSharedCauseScanWith`, `draftBuyerMessagesWith` and `attestPackingPhotosWith`, matching the existing `computeBuyerSignalWith` / `buildStoreReportWith` convention. A new test assigns the package to the section 15 interface, so `pnpm typecheck` fails if any signature drifts (the guarantee the retired H1 stubs gave), and runs the four against PostgreSQL. 256 intelligence tests pass. DECISIONS.md I-D22.
- I3/I4/I6: the intelligence list endpoints now page as section 11 requires ("?limit= (default 50) and ?cursor="): endpoint 6 (catalogue), 22 (shared causes), 40 (signal contests) and 42 (store reviews). Same convention as Hriday's order lists — newest first (the catalogue by name), the cursor is the id of the last item received (the catalogue's `merchantId:sku`), and an unknown or another store's cursor is 400 `INVALID_CURSOR`. `limit` is at most 100, since the catalogue and reviews are public. Keyset queries in SQL; reviews are weighted in full before the page is cut. Four new PostgreSQL route tests and one schema test; 252 offline and 261 intelligence tests pass. DECISIONS.md I-D23.
- I6: a complaint cluster's centroid is now exactly the normalised mean of its members (section 9 stage 3). The previous update, `normalise(centroid × n + v)`, weighted the stored unit centroid as if it were the sum of its members, which drifts from the mean (0.867 instead of 0.864 after three members in the new test). Each existing cluster is rebuilt from its members' embeddings on every scan, so stored centroids self-correct. The 2026-11-10 clustering precision (1.00, threshold 0.85) was measured with the old update and needs a re-run before it is quoted again. Two new unit tests; 254 offline and 263 intelligence tests pass. DECISIONS.md I-D24.
- I6: the inspection rule a batch hypothesis proposes now asks for a close-up of the faulty part — the head of the reader's component, before any preposition (`left sleeve seam` → `seam_closeup`, `drawstring eyelet` → `eyelet_closeup`, `defect_closeup` when none is usable) — instead of `seam_closeup` for every fault. The B17 demo still asks for `seam_closeup`. Three new unit tests and one PostgreSQL test; 257 offline and 267 intelligence tests pass.
- Docs: README.md and docs/ai-tools.md mark the published clustering precision as measured before I-D24 (re-run pending), describe the Evidence Agent's buyer-photo check, list the intelligence test command and state the current 267 intelligence tests. A sweep of `packages/ai`, `packages/intelligence` and `apps/api/src/routes/intel` found no TODO, placeholder, stub, debug logging or skipped test.

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
