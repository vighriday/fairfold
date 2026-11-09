# Hriday sequential execution plan

This is the implementation work order derived from architecture section 16. It is a plan, not an implementation report. The current phase remains research and documents only. Do not run future workspace commands until the corresponding package or service exists.

Hriday owns platform, PayPal, storage, outside-world actions and deployment. Ishaan owns interpretation, scoring, statistics and drafts. The Figma frontend is outside both task lists. Complete H1 → H8 in that order, on `Hriday`, using the fixed contracts and documented stubs. Every task needs its checks, `pnpm typecheck`, an evidence record and a task-prefixed commit before it is done.

## Before H1

1. Finish the [sandbox dispute spike](sandbox-spike.md), the explicit pre-H1 assignment. Record actual dispute status, lifecycle stage, links/options and arrival delay in `DECISIONS.md`.
2. Prepare the discovery result and open questions for Ishaan. Establish which H1 contracts he needs first; his photo collection is his prerequisite, not Hriday's replacement task.
3. Resolve only questions needed for the next task. Q2/Q4/Q5 affect H4 payloads; Q3 affects persistence; Q11 affects event durability. Do not change a shared contract without review.
4. Check the branch is `Hriday` and internal files remain ignored. Establish Render access before H1's deploy gate. Node 22.16.0 and pnpm 12.4.2 were observed locally; Docker was not found on PATH. Installation/startup checks remain future work.

## H1 Foundation and first deploy

Source estimate: 6 hours. Sources: architecture 7, 10–12, 14–16. Status: NOT STARTED.

1. Create only the prescribed pnpm workspace: strict TypeScript/ES modules, shared ES2022 configuration, ESLint, Prettier and Vitest. Define offline `pnpm test`, credential-aware `pnpm test:sandbox`, `pnpm test:e2e`, `pnpm typecheck`, and the specified database/dev scripts. Record compatible dependency versions; do not add a second backend or database.
2. Add Postgres 16 to Docker Compose. Translate the section 7 SQL column-for-column into Drizzle and `0001_init`; preserve constraints, indexes and nullability. Keep reset explicitly local/test-oriented. Check all 25 tables against the original, not this summary.
3. Create shared contracts for PayPal, shared cause, AI outputs, HTTP responses, job names/payloads, clock and AES-256-GCM. Ishaan submits his route schemas in `src/intel.ts` through the shared review process.
4. Create valid fixed stubs for every intelligence function in section 15. Create the explicitly required `packages/ai`, `packages/intelligence`, handler-map and intel-route skeletons once; after Ishaan's first commit, stop editing those owned directories.
5. Implement the pg-boss publish/work/schedule/debounce wrapper and worker registration. Job payloads must validate at the boundary.
6. Implement the blob store and ledger now, even though route integration comes in H5. Re-encode accepted images after EXIF checks, hash the stored bytes, dedupe, and preserve generated PDFs byte-for-byte. Ledger appends lock the order, assign sequence and millisecond time, recursively canonicalize JSON and hash against the prior hash.
7. Bootstrap Fastify 5 with Zod, multipart limits, auth/role hooks, error envelope, CORS, rate limits, redacted JSON logs, `/healthz`, demo login and `/docs`. Register the intel plugin. Enforce ownership checks in addition to role checks.
8. Prepare the prescribed Render web service, worker and Postgres blueprint. Deploy only within the authorized account/project after the user begins implementation and account access is established. Record the actual URLs and configuration state; never use example URLs as completed output.

**Completion evidence:** migrations apply cleanly; canonical JSON, ledger append/verify/tamper, image dedupe and PDF pass-through tests pass; `pnpm test` and typecheck pass; `/docs` loads locally and on Render. H1 is incomplete if the first deploy is absent. Prepare the contracts handoff for Ishaan. Commit on `Hriday` with `H1:`; the user's branch rule overrides the source's “push to main” wording.

## H2 PayPal client and checkout

Source estimate: 5 hours. Sources: architecture 3, 8 F1/F6, 11–12, 16 H2. Status: NOT STARTED. Depends on H1.

1. Implement `forMerchant(merchantId)` with credential lookup/decryption and per-merchant in-memory token caching until 60 seconds before returned expiry. Reject non-sandbox configuration. Use the source's typed interface.
2. Implement HTTP error normalization, bounded three retries on 429/5xx with backoff, deterministic operation request IDs, representation preference and PayPal debug-ID error logging. Protect against ambiguous retry outcomes; do not assume every endpoint honors the header identically.
3. Create CAPTURE orders with one purchase unit, stable identifiers, decimal-string money, string quantities and an exact item-total breakdown. Fetch prices and merchant association from the database; never trust a browser-supplied total.
4. Parse capture IDs, status, seller protection, payer account status/identity and shipping into `CaptureResult`. Apply the reviewed persistence redaction boundary. Upsert the buyer and address hash, append captured ledger entry and publish `order.captured` exactly once.
5. Add `orders.get`, flat-body tracking, seed-carrier conversion, refunds and Transaction Search. Refund amounts must be validated against captured/refunded amounts; reporting uses bounded windows and stays outside the live path.
6. Implement endpoints 2–4, 7–8, 30–31. Retain merchant/buyer ownership restrictions and merchant-only fields. Use intelligence stubs until the real functions arrive.
7. Build only the unstyled `/dev` checkout harness. Load sandbox JS SDK v6, initialize with client ID and `paypal-payments`, start the one-time payment session after a click, then capture server-side after approval.

**Completion evidence:** A4 passes in the sandbox, Maya purchases a hoodie through `/dev`, and recorded sanitized create/capture fixtures parse in offline unit tests. Record the real IDs and ledger result. Commit `H2:` after tests/typecheck.

## H3 Webhooks and reconciliation

Source estimate: 3 hours. Sources: architecture 3, 8 F4/F6, 12, 16 H3. Status: NOT STARTED. Depends on H2.

1. Implement `register-webhook.ts <merchantSlug>` against the actual HTTPS app URL and store its returned ID on that merchant. Register the seven source-defined events listed in the handoff inventory.
2. At endpoint 37, retain the raw body, identify the merchant by slug, verify using that merchant's webhook ID, store the event and acknowledge promptly. Unverified records are never dispatched.
3. Enforce one event row per PayPal ID. Resolve Q11's durable enqueue/recovery boundary so a crash after insert cannot permanently suppress processing. Test duplicates during failure recovery as well as the happy path.
4. For capture-completed, reconcile known orders or import the toolkit-created order with SKU-first/name-fallback item matching. Handle capture-refunded status. Register dispute dispatch against the H4 contract without inventing a second sync implementation.
5. Schedule disputes polling every minute per real merchant. Use update cursor/pagination and the same idempotent sync path as webhooks. A failed poll must not advance past lost updates.

**Completion evidence:** A5 passes; a real sandbox checkout yields a verified capture event; duplicate/retry tests prove one logical import. Preserve simulator rejection and invalid-signature tests without disabling verification. Commit `H3:` after tests/typecheck.

## H4 Disputes and approved submission

Source estimate: 5 hours. Sources: architecture 3–4, 8 F4, 10–11, 16 H4. Status: NOT STARTED. Depends on H3 and the spike findings.

1. Sync authoritative dispute details from webhook/poll IDs. Store reason, status, lifecycle stage, due date, outcome and resolution time; map capture first, invoice fallback. Append `dispute_opened` once, publish `dispute.synced` with new buyer messages, and refresh reports on resolution.
2. Implement multipart `provideEvidence` using `input` JSON plus `file1..n`, verifying the stored files/hash/size and wire carrier mapping. Retain the spike fixture with sensitive data removed.
3. Implement make-offer, accept-claim, send-message and sandbox-only test controls. Check current action links/options as well as the contract's status/stage guards. Resolve Q2/Q5 before return-based actions; do not guess required fields.
4. Implement dispute list/detail/approval endpoints 17, 18 and 21, plus demo adjudication. `inspect_first` returns `409 PACK_NOT_ACTIONABLE`; `merchant_decides` requires the chosen recommendation in the body.
5. The submission worker re-fetches the dispute immediately before the call. A stale guard sets failed/STAGE_CHANGED and queues rebuild; a 422 records failure and raises `evidence_submit_failed`. Preserve approval identity, actual PayPal response and corresponding ledger entry. Make repeat approvals/jobs safe against duplicate effects.
6. Implement the toolkit-style `provide_dispute_evidence` tool with validated dispute/evidence/file parameters. It uses this same guarded approval pathway; it is not an automatic bypass for agents.

**Completion evidence:** source H4 gate requires successful sandbox A12 and an allowed offer using a stub pack, then refusal after the relevant case state changes. The full deployed A12 is still repeated when H5/H6 and the integrated seed exist. Observe whether `sandboxRequireEvidence` actually changes lifecycle stage; Q13 must be resolved before asserting its specific offer guard result. Never mark H4 done from a mocked HTTP response alone. Commit `H4:` after actual component checks, tests/typecheck and recorded pending integration details.

## H5 Pack Station and approved shared-cause actions

Source estimate: 5 hours. Sources: architecture 7–9, 11–12, 16 H5. Status: NOT STARTED. Depends on H4; consumes Ishaan's I2/I6 interfaces or explicit stubs.

1. Implement upload/pack/override/seal/ledger endpoints 10–14. Validate JPEG/PNG, maximum 12 MB each and six pack files, label/batch associations, EXIF freshness and cross-order reuse checks. Store normalized bytes and append photo entries; publish `pack.photos_uploaded`, return 202, and wait for the attestation job.
2. Return active stocked batches, photos, latest attestation, inspection rule, `canSeal` and exact blockers. Preserve all five blocker codes. An override with a reason clears only ATTESTATION_MISMATCH, never a hold, required inspection, batch mismatch or tracking-label mismatch.
3. Seal transaction locks the order, sets batch/packer/packed time, decrements inventory once, creates shipment, timestamps status and appends `sealed`. Commit before queueing tracking. Prevent repeat seals from double-decrementing stock; test concurrent attempts and no-stock cases.
4. `tracking.push` sends flat tracking data with payer notification, stores tracker ID and shipment status, appends `tracking_pushed`, refreshes report; after three failed attempts raises `tracking_push_failed`. Keep local seal success distinct from PayPal tracking success.
5. Implement endpoint 39: store batch inspection photos, publish `inspection.uploaded`, let Ishaan attest. A passing required inspection requires the correct photo label and `inspection.defectVisible = false` under the fixed rule.
6. Execute only approved action rows: hold orders/batch, add inspection rule, send messages, rebuild offer packs, proactive refund, release orders/batch. Ishaan proposes and confirms; Hriday executes and writes status/result. Check merchant ownership and parent hypothesis/action association.
7. For approved messages, mark in-app delivery and use dispute send-message only for eligible INQUIRY cases. Never expose another buyer. No email provider is added; `email_outbox` is a documented channel, not permission to send real email.
8. Add nightly retention after 180 days from delivery: purge blob bytes, retain rows/hashes. Shared blobs must remain available while another retained reference still needs them. No purge of local private source files.

**Completion evidence:** A6/A7/A11 pass. Prove each blocker and the limited override, transaction concurrency, tracking final-failure alert, duplicate action/refund safety and retention boundaries. Use real I2 for the final A6 claim; label any interim stub run. Commit `H5:` after tests/typecheck.

## H6 Watchdog and courier simulation

Source estimate: 2 hours. Sources: architecture 8 F3, 11, 16 H6. Status: NOT STARTED. Depends on H5.

1. Schedule the 15-minute sweep. Flag tracking silence beyond 72 hours, captured-but-unsealed beyond 72 hours, and disputes due within 48 hours.
2. Deduplicate open alerts by the source's order/type rules; append `gap_alert` only for the first corresponding tracking gap. Alerts do not send messages.
3. Implement endpoints 15/16 and demo-only scan/deliver routes, behind DEMO_MODE and appropriate role/ownership checks. Clearly label courier events as simulated; delivery updates time/status and ledger.

**Completion evidence:** the four-day-gap seed yields exactly one alert and another sweep adds none. Check threshold boundaries with the injected clock and that demo routes are unavailable when disabled. Commit `H6:` after tests/typecheck.

## H7 Fairfold MCP and shopping agent

Source estimate: 5 hours. Sources: architecture 8 F6, 11, 16 H7. Status: NOT STARTED. Depends on H6; consumes I4 report/catalogue functions.

1. Expose stateless Streamable HTTP at POST `/mcp` with role tokens and the documented MCP SDK. Implement `search_catalog`, `get_store_report`, `get_order_proof` and merchant-only `provide_dispute_evidence`.
2. Use cached store reports or Ishaan's builder; use the ledger verifier for order proof. Resolve the agent proof-ownership question before revealing private order data.
3. Build the Vercel AI SDK CLI loop using Fairfold tools through its MCP client and the PayPal toolkit's AI SDK adapter. Set `context.sandbox = true` explicitly; restrict the PayPal allowlist to create/capture operations needed by the story.
4. Load the human's policy: skip caution stores; ask before paying a store not verified. Still require human PayPal approval for every order. Print the approval link, wait for human completion, then capture. The agent must not fabricate approval from text or tool output.
5. Confirm H3 imports that real toolkit capture with SKU/name matching. Save a sanitized transcript to `docs/agent-run.txt` as specified.

**Completion evidence:** A13 passes and the transcript shows catalogue search, report inspection, caution-store skip, chosen Neel order, approval stop and real sandbox capture. No tokens in the transcript. Commit `H7:` after tests/typecheck.

## H8 Seed, final deploy and judge instructions

Source estimate: 2 hours. Sources: architecture 18–20, 16 H8. Status: NOT STARTED. Depends on H7 and Ishaan's fixtures/eval handoff.

1. Implement deterministic `scripts/seed.ts` with seed `fairfold`. Use Ishaan's fixture JSON, clearly recorded placeholder texts only while it is unavailable. Seeded PayPal IDs always start `SEED-`; checkout/toolkit IDs must be real sandbox identifiers.
2. Reproduce the exact B17 world in `validation.md`: 39 earlier B17 deliveries, 5 B17 seam complaints before the live sixth, 18 open hoodie orders, 21 units in stock before the live seal, and the fictional comparison stores. Run one shared-cause scan at the end.
3. Verify fixture populations and Store Report denominators. Keep the all-equal-exposure numerical fixture separate from the live seed. Do not change detection thresholds or reported counts to make a screenshot look right.
4. Replace the temporary root README with proven local/Render setup, architecture, demo role access, API/tool usage, Ishaan's measured eval table, limitations and MIT licence. Public instructions must allow setup without access to ignored internal documents or private keys. A fresh user supplies their own sandbox credentials.
5. Deploy the final services, run A1–A14 on the actual Render build and record failures honestly. Exercise the full flow from a fresh browser and a fresh clone. Resolve and repeat affected checks only after fixes.
6. Prepare the source-defined video and submission evidence with Ishaan. Do not submit accounts/forms or publish a video from this task without explicit instruction.

**Completion evidence:** a fresh clone runs end to end in under ten minutes after prerequisites and credentials are ready; A1–A14 pass on Render; public docs accurately describe what works. The source's intended command sequence is `cp .env.example .env`, `docker compose up -d`, `pnpm i`, `pnpm db:migrate`, `pnpm seed`, `pnpm dev`. In Windows PowerShell use `Copy-Item .env.example .env` and run commands individually. These commands are future targets, currently unavailable. Commit `H8:` after tests/typecheck and actual deployed verification.

## End each task consistently

Update the status row, append evidence with exact environment/commit, record any decision, update `CHANGELOG.md`, inspect the staged diff for private sources/secrets, and commit with the task ID. Stop a task's completion claim at an unpassed required gate. Do not skip ahead or silently reduce the scope to recover the schedule.
