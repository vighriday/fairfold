# Changelog

## 2026-11-12 — H8 routed website and live reads

- Added a browser build using the supplied landing/console, fonts and animations; kept standalone originals unchanged. Same-origin Fastify routes support direct links, record selection, refresh and browser history. Private files and unknown API paths retain their existing boundaries.
- Bound orders, packing state, server ledger verification, disputes, shared causes, alerts, reports and reviews to canonical REST reads. Removed the simulated console entrypoint from the website build; gated demo sign-in keeps tokens in memory. Mutation controls are explicitly pending the next focused unit.
- Validation: typecheck and lint PASS; nine website routing/design/transport/server checks PASS. Both source CSS blocks remain unchanged.

## 2026-11-12 — Main branch website authority

- Verified main includes both reviewed branch histories and checked it out locally. Recorded the user’s authorization to connect the existing frontend without redesign and retain the Render API/worker/PostgreSQL architecture.
- Read-only Render discovery found no Fairfold service in My Workspace; hosting and account/provider acceptance remain pending.

## 2026-11-12 — Standalone browser build of the landing page and console

- Added `standalone/`: a static browser build of the Claude Design landing page and merchant console. It opens straight from disk or any static server, without the export's in-page unpacking runtime. The original exports are kept unchanged in `standalone/design-export/`. It shows the design's fixed demo data and is not connected to the API.
- Background: the thread field is drawn with WebGL (2D-canvas fallback). The frame loop no longer forces layout, per-frame animations are compositor-only, and a frame-pacing governor reduces background quality when frames are missed. The 3D parcel was refined (shading, tape, labels, seal, tissue interior); no components were removed.
- Console: fixed text collisions. The Status column fits "Delivered · dispute", the orders table scrolls instead of collapsing on phones, inspection tiles wrap, the sandbox-calls dock reserves space and folds back after calls, and on phones the tab strip fades at its edges.
- `standalone/` is excluded from ESLint and Prettier, because it is plain browser scripts plus generated exports outside the TypeScript workspace.
- Validation (Chromium only, Intel Iris Xe, 3-run medians):
  - Landing layout identical to the export: 202/202 elements at 1440 and 390 px.
  - Console: 0 overlapping or spilling text in all views at six widths, 390–1440 px.
  - Scrolling at 150 % scaling: 57 % → 0.4 % dropped frames. Idle on the hero: 78 % → 0 %.
  - Firefox and Safari NOT RUN.

## 2026-11-11 — H8 integrated audit closeout

- Integrated Ishaan's existing Hriday merge, intelligence, full B17 world and fixtures while preserving the focused platform repairs and all 52 incoming commits. Restored approved source scoring/history/default threshold and disabled the unapproved automatic embedding substitute.
- Applied the approved bounded buyer-note retention extension, preserved genuine action metadata/rule release, prevented an approval-winning draft race, corrected database-precision pagination and wired the missing admin-only demo seed route.
- Added the complete run/acceptance/Figma/account handoff and reconciled outdated README/status/audit claims. Established a separate ignored local demo database and exercised the actual seed CLI.
- Validation: **958 tests PASS, 0 FAIL, 1 real-sandbox case SKIPPED**; 42/42 source API contracts present; typecheck/lint and actual API/official MCP client smoke PASS. Model-free evals: 30/30 buyer bands, 8/8 disputes, B17/null unit fixtures PASS. Real PayPal, provider/photo, Render and Figma acceptance remain pending.

## 2026-11-11 — Integration authority and ancestry

- Verified Ishaan already merged Hriday baseline 762c497 in 3f8c436. Preserve that existing integration and the newer focused audit repair commits.
- Recorded Hriday approval for source-preserving surgical integration fixes and the bounded H4 buyer-note retention extension; no actual PayPal action authorized.

## 2026-11-11 — H7 audit: official SDK transport and shopper executable

- Replaced handwritten MCP handling with the official stateless Streamable HTTP SDK, and connected the AI SDK MCP client. Merchant evidence submission still requires an existing approved pack.
- Added the sandbox-only PayPal Agent Toolkit adapter, enabling only create/capture, plus an executable shopper with separate store and PayPal approval pauses and a sanitized transcript boundary.
- Validation: typecheck and 9 MCP/shopper checks PASS; actual SDK runtime smoke PASS on loopback with zero PayPal requests. Two terminal approval checks also PASS. Provider/account-backed A13 remains NOT RUN.

## 2026-11-11 — H6 audit: deadline and retention maintenance

- Check all unresolved dispute statuses, serialize open-alert creation and measure no-scan tracking gaps from shipment time. Preserve delivered/refunded state in repeated synthetic courier updates.
- Retain bytes referenced by current attestations or evidence packs, including unlinked evidence, and register the nightly retention schedule with ownership collision checks.
- Validation: typecheck PASS; 6 maintenance/lifecycle checks and the expanded 3-case watchdog suite PASS on PostgreSQL.

## 2026-11-11 — H5 audit: approved actions and tracking

- Validate and freeze approved action payloads, claim external operations durably, reserve refund amounts and reject ambiguous replay. Buyer messages require a fresh seller-response guard; tracking does not invent a carrier scan.
- Added real PostgreSQL regressions for concurrent holds, approval edits, inspections, refunds, messages, tracking and private proof.
- Validation: typecheck PASS and 56 focused action/tracking/workflow checks PASS; actual PayPal actions remain NOT RUN.

## 2026-11-11 — H5 audit: packing transactions and read surfaces

- Bound packing/inspection jobs to the same checked-out PostgreSQL transaction as their writes. Sealing checks current pack evidence, actual product stock and all fixed blockers; clean inspection can clear a held batch under the source rules.
- Added owned order proof and merchant/buyer sent-message reads with stable PostgreSQL cursor comparisons. A unique inspection batch can be inferred from its active rule.
- Validation: typecheck and 18 PostgreSQL/HTTP checks PASS. Provider photo evaluation and real tracking remain pending.

## 2026-11-11 — H4 audit: canonical dispute API contracts

- Restored source GET `/api/disputes/:id` and POST `/api/disputes/:id/packs/:packId/approve`, with the documented detail envelope and direct approval body.
- Mapped draft `amount` to only its chosen operation, rejected conflicting fields, prevented inspect-first overrides, checked edited notes against the approved privacy boundary and froze the approved parameters.
- Added HTTP regressions for edited draft amounts, merchant-decides, conflicting amounts, inspection bypass and unclear contact text. Typecheck/lint and the focused PostgreSQL/HTTP suite pass; real actions remain pending.

## 2026-11-11 — H4 audit: retention and dispute execution

- Corrected approved message normalization, complete URL removal, whitespace-aware known-street redaction, within-snapshot dedupe and the combined historical fingerprint budget.
- Reused the webhook transaction for dispute synchronization, loaded transient authoritative contacts, preserved established order linkage and queued report refresh on resolution.
- Required recorded human approval before claiming an evidence action; fresh guards now fail durably, 422/uncertain results raise alerts, and claimed/uncertain operations cannot repeat vendor POSTs. Added the source Zod/base64 Agent Toolkit style descriptor.
- Validation: 58 focused offline/PostgreSQL/HTTP regression checks passed across H4 and packing; typecheck is recorded with the audit evidence. Real PayPal acceptance remains NOT RUN.

- Audit: completed the source-to-implementation audit against the protected architecture, endpoint/job inventories, schema and A1-A14 acceptance plan; corrected startup registration of H5 inspection and shared-cause approval routes and recorded remaining ownership/external gaps in `docs/hriday/source-implementation-audit.md`.

All authored work in this checkout is on `Hriday`. Entries distinguish documentation preparation from working application delivery. Dates use IST.

## 2026-11-11 — Ishaan: Hriday's platform merged into `ishaan` (local, M1)

- M1: merged `origin/Hriday` at `762c497` (H2–H8 and the source audit) into `ishaan`. Hriday's files were taken as they are (API and worker entry points, `apps/api/package.json`, his docs under `docs/hriday/`); the API keeps registering both his routes and the intelligence routes. CHANGELOG, DECISIONS (normalised to LF, all 37 Ishaan decisions and all of Hriday's O sections kept) and README were combined; the lockfile is Hriday's plus the `packages/ai` and `packages/intelligence` dependencies at their existing pinned versions.
- Resolved what the merge broke because Hriday's branch still assumed the H1 intelligence stubs: two API tests imported `@fairfold/contracts/stubs` (deleted on `ishaan`, I-D13) and now use a test-only double with the same fixed signal (`apps/api/test/buyer-signal-double.ts`); `/healthz` and the worker's ready log report `intelligence: 'ready'`; the worker registers 16 handlers (Hriday's 7 and the 9 intelligence handlers). Typecheck and lint pass; 628 offline tests, Hriday's 207 PostgreSQL tests and the 332 intelligence tests pass. Prettier still flags four of Hriday's PayPal files exactly as on his branch; they were not reformatted.
- M2: `packages/contracts/src/intel.ts` fits Hriday's contracts package as is: it is reachable as `@fairfold/contracts/intel` through his `./*` export and no schema name clashes with his `api.ts`, `ai.ts`, `paypal.ts` or `jobs.ts`. No change; it goes to Hriday for review in the pull request.
- M3: done inside M1 (his tests imported the stubs module the `ishaan` branch had deleted, so the merge could not compile without it).
- M4: the merged API registers all 18 intelligence endpoints beside Hriday's routes, and the worker registers the 9 intelligence job handlers beside his 7. Two regression tests guard this: the API's OpenAPI must contain every `INTEL_ROUTES` endpoint with its method (verified to fail when the registration is removed), and the intelligence handler map must hold exactly the nine intelligence jobs, which together with the platform's seven make up all 16 of section 8. Started Hriday's own API and worker runtimes against the test database: `/healthz` reports `intelligence: 'ready'`, both route sets answer, 45 OpenAPI paths, and the worker logs `Worker ready` with 16 handlers.
- M5: the intelligence package now uses the API's and the worker's own database and job queue again. The merge took Hriday's entry points, which delegate to his `createRuntime` and `createWorkerRuntime`, so the binding from I-D37 moved there: each calls `bindIntelRuntime` right after creating its database and queue (the worker also passes its clock). Two PostgreSQL tests: the API's intelligence runtime resolves with `DATABASE_URL` unset (an unbound one cannot), and a job published by the intelligence runtime lands in the worker's own queue schema. DECISIONS.md I-D37 updated.
- M6: the Render Blueprint now carries the intelligence settings on both the API and the worker (Gemini provider and model ids, `CLUSTER_SIMILARITY=0.85` instead of the code default 0.8, and the shared-cause thresholds), with the Gemini key as a `sync: false` secret on the API that the worker reads by `fromService`. Validated against Render's official JSON Schema (same digest Hriday recorded); his original Blueprint validates too. DECISIONS.md I-D38, including a review item for his deployment guide.
- M7: a proposed `add_inspection_rule` now carries `productId` (the cluster's product), which Hriday's executor stores in `inspection_rules.product_id`; it was always null before. Neither side matches rules by product (batch codes are unique per merchant), so this completes the row rather than changing which orders need inspection. One PostgreSQL assertion updated; 333 intelligence tests pass.
- M8 (Hriday's executor, for his review): an approved `release_orders` now also switches off the inspection rules listed in `inspectionRuleIds` and accepts an empty `orderIds` when it only switches off a rule; before, it rejected such a release as invalid and ignored the rules, so a dismissed hypothesis's inspection rule stayed on. Rules of another merchant are refused with nothing changed. Four PostgreSQL tests, the executor's first, registered in `scripts/test-database.ts`. DECISIONS.md I-D34 updated.
- M9 (Hriday's Pack Station, for his review): the seal now accepts the Evidence Agent's packing attestation (step `pack`) as passing an inspection rule when the rule's close-up shows no defect; before, only step `inspection` counted, which never has an order, so no order under an inspection rule could be sealed. A held order is `ORDER_HELD` only until such a photo exists (section 8), and the pack state, override and seal read the packing attestation, so a later buyer-photo check cannot take its place. Three PostgreSQL tests; DECISIONS.md I-D39.
- M10 (write-up for Hriday, no code change): his dispute sanitiser keeps buyer messages but drops the buyer's other written notes (supporting info and evidence notes, offer notes, issue details, item notes), so a dispute complaint gets only the reason and the messages. DECISIONS.md I-D40 lists the fields and suggests keeping them redacted in the same shape; this is his decision under Q3.
- M11 (Hriday's MCP service, for his review): the `search_catalog` and `get_store_report` tools now call the intelligence package's `searchCatalog` and store report, as section 16 specifies. The shopper's "navy hoodie" now finds a navy-coloured hoodie whose name lacks the colour, a store with no stored report gets one built instead of a 404, and a non-numeric price or non-uuid store id is a 400. Two PostgreSQL tests; DECISIONS.md I-D41.
- M12 (Hriday's worker, for his review): the worker now schedules `sharedcause.sweep` at 02:00 IST (`0 2 * * *`, Asia/Kolkata), as section 8 F5 says; it scheduled only the watchdog, so the nightly re-read of unread complaints and the nightly scans never ran. One PostgreSQL test reads the schedule back from pg-boss. Observed, not changed: the worker registers a `retention.sweep` handler but does not schedule it either; that is Hriday's to decide.
- M13 (decision): the optional `proactive_refund` of section 9 stage 5 is not proposed. Seeded orders have no PayPal capture, so such refunds would fail in the demo, and the confirmed-level buyer message already offers a replacement or refund. DECISIONS.md I-D42.
- M14: `pnpm seed` now builds architecture section 19's demo world instead of three placeholder merchants: Neel (exactly the sandbox merchant `setup:sandbox` provisions), Indigo Loom and QuickTees Outlet; 344 Neel, 24 Indigo and 25 QuickTees orders with shipments, generated packing photos, seed attestations and verifying ledgers; the fixture complaints and reviews pre-read; Alex R.; simulated network data for 10 buyers. It ends with the shared-cause scan and store reports: batch B17 strong (5 of 39, p 0.00060, q 0.0072) with 18 orders to hold, and bands verified, verified, caution. Deterministic and idempotent (a second run adds nothing). Eight PostgreSQL tests in `apps/api/test/seed.integration.test.ts`, one fixture test; the four never-arrived QuickTees reviews carry pre-read extractions. README describes the world. DECISIONS.md I-D43. For Hriday's review.
- M18: covered by M14's seed test, which checks A14's bands on the seeded world, Indigo Loom verified included; no separate test added.
- M19: ran the intelligence acceptance checks locally on the merged build with the seed (models off): A1 (B17 strong, 18 unshipped, 5 of 39, p 0.00060, q 0.0072), A2 (RR 30, p 0.000129, q 0.00154, 12 values), A3 (no hypothesis), A8 (30 of 30) and A14's bands (verified, verified, caution) all as specified; A14's review themes need a model and were not run. Local evidence only, not the Render acceptance section 20 requires: `docs/evidence/2026-11-11-intelligence-local-acceptance.md`.
- M21: docs/ai-tools.md (the "AI tools and how we used them" section and eval table Hriday's README links to) brought up to date for the hand-over in the pull request: `pnpm seed` now builds the demo world and its measured scan result is quoted, the local acceptance evidence is linked, and the intelligence test count is 334.

## 2026-11-10 — Ishaan: intelligence Phase 2 robustness for the free model tier (`ishaan` branch)

- I6: buyer messages are drafted template-first. The Message Drafter now makes at most one model call per hypothesis and level, writing a template with `{order}` and `{product}` placeholders that code fills with each buyer's own order; before, it made one call per buyer (38 for the seeded B17 hypothesis, about two days of Gemini's free text quota). The template is stored in the `send_buyer_messages` payload, so a re-scan that adds buyers costs no call; an unusable draft (no `{order}`, another placeholder, too long, or a buyer's name) falls back to the fixed template. Six new unit tests and one PostgreSQL test; DECISIONS.md I-D10 (amended).
- I4: review themes are reused while the store's reviews are unchanged. A Store Report refresh compares the hash of exactly what the Review Themer would read (ids, ratings and texts of the counted reviews) with the hash stored beside the last report, and reuses its themes without a model call when they match; a new review, a changed rating or text, or a review weighted out asks again. A fallback is never reused. The hash is kept inside `store_reports.report` and stripped by `StoreReportSchema`, so no response changes. Three new unit tests and one PostgreSQL test; DECISIONS.md I-D25.
- I6: the seed complaints are pre-read. Each of the 12 seed complaints in `eval/fixtures/complaints.json` now carries a hand-written ComplaintExtraction marked `model: "seed"`, so `scripts/seed.ts` can store it without a Complaint Reader call (12 free-tier text requests saved). The shared-cause scan now embeds all read complaints that have no vector in one batched embedding request before grouping, so seeded rows group with live complaints in the same embedding space. One fixture test and one PostgreSQL test; DECISIONS.md I-D26.
- I1/I6: `embed()` now has the 30-second timeout and the no-retry-on-refusal policy of every other model call (it used the AI SDK defaults: no timeout and two automatic retries, so one 429 cost three requests), and logs `ok`, latency and the HTTP status of a failure. A failed embedding no longer fails `complaint.created`: the extraction is saved without a vector, the scan goes on without that complaint, and the next scan embeds it. Three new unit tests and one PostgreSQL test; DECISIONS.md I-D27.
- I2–I6: over-long model text is cut by code instead of failing the schema. A 141-character complaint summary used to fail validation, spend a retry and turn the complaint into category `other`; the schemas the models fill no longer carry length limits, and code cuts the summary (140), theme labels (60, at most 8 themes), the Buyer Signal sentence (240) and the dispute narrative (2,000, whole sentences, grounding checked after the cut). Eight new unit tests; DECISIONS.md I-D28.
- I3/I4: wording post-checks. A Buyer Signal sentence that tells the merchant to cancel, not to ship or to refuse the order is replaced by the template sentence; a review theme whose label is not neutral (praise, disparagement or an accusation such as "great", "poor" or "scam") is not shown. Twenty-two new unit tests; DECISIONS.md I-D29.
- I1: emails and phone numbers are removed from buyer-written text before it reaches a model. Every untrusted text passed to `generateStructured` (complaints, reviews, dispute messages) has email addresses replaced with `[email removed]` and phone numbers with `[phone removed]`; dates, prices, SKUs, order ids and tracking numbers are kept. README.md and docs/ai-tools.md now state exactly that, and that a street address typed into free text is not detected. Thirteen new unit tests; DECISIONS.md I-D30.
- I4: catalogue search matches every word of the query against the product's name, SKU, colour and description, so A13's "navy hoodie" finds a hoodie whose colour is navy; it used to match the whole phrase against the name or SKU only and found nothing. One PostgreSQL test updated with the new cases; DECISIONS.md I-D31.
- I2–I6: job publishing is reliable. `complaint.created`, `storereport.refresh` and `evidence.rebuild` are now sent inside the database transaction that writes the complaint, review or hypothesis they refer to (through pg-boss's drizzle adapter), so a crash between commit and publish can no longer leave a complaint that is never read; the nightly sweep also re-sends `complaint.created` for complaints still unread an hour after they were stored. Four new PostgreSQL tests, one of them against a real pg-boss queue; DECISIONS.md I-D32.
- I3/I6: concurrency fixes. Each merchant's scan runs under a per-merchant advisory lock (two simultaneous scans used to create two B17 hypotheses), and the scan no longer overwrites a status changed meanwhile; the nightly sweep queues one scan job per merchant instead of scanning inline; the complaint upsert is a single `insert … on conflict do update`; Confirm, Dismiss and contest resolution are conditional updates, so a double click applies once and the second request gets 409. Six new PostgreSQL tests and one updated; DECISIONS.md I-D33.
- I6: the hypothesis lifecycle is complete. A hypothesis superseded by a new primary value has its proposed actions withdrawn; an open hypothesis that a scan no longer finds significant is retired (status `superseded`, reopening on the same row if it becomes significant again) with its proposals withdrawn; and a superseded, retired or dismissed hypothesis proposes one `release_orders` for the orders it holds and for switching off the inspection rule it created (`inspectionRuleIds`, a review item for Hriday's executor). A reopened hypothesis proposes its holds, rule and buyer messages again. Four new PostgreSQL tests; DECISIONS.md I-D34.
- I5: evidence packs are no longer rebuilt once they cannot change anything: `buildEvidencePack` refuses with 409 `DISPUTE_RESOLVED` for a resolved dispute and 409 `PACK_SUBMITTED` once a pack is approved or submitted, and the `dispute.synced` and `evidence.rebuild` handlers skip such disputes instead of adding a new draft beside the pack PayPal has. Later buyer messages still reach the complaint. Three new PostgreSQL tests; DECISIONS.md I-D35.
- I5/I6: a dispute's complaint now carries every place the buyer wrote in PayPal's dispute object (customer-provided issue details, item notes, buyer-submitted supporting info and evidence notes, every buyer message, buyer offer notes), not just the first message, and each later sync appends buyer text not yet stored even when the job did not list it. Three new unit tests and one PostgreSQL test; DECISIONS.md I-D36.
- I1–I7: the API and the worker pass their own database and job queue into the intelligence package (`bindIntelRuntime`), so its routes and job handlers no longer open a second `pg` pool and a second pg-boss instance in each process. Two new PostgreSQL tests; DECISIONS.md I-D37 (with the one-line handoff for Hriday's runtime modules).
- Docs: docs/ai-tools.md states the current 332 intelligence tests and the robustness cases they cover. Final Phase 2 state: typecheck, lint and Prettier pass; 332 intelligence tests (unit and PostgreSQL) and 59 offline tests pass; the API and the worker start against PostgreSQL with the bound runtime. A sweep of `packages/ai`, `packages/intelligence` and `apps/api/src/routes/intel` found no TODO, stub or skipped test.

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

## 2026-11-10 — H5 Pack Station core

- Added merchant-owned Pack Station routes for state, photo upload, attestation-mismatch override and seal. Uploads enforce JPEG/PNG, six-file/12 MB limits, supported labels, EXIF freshness, normalized content-addressed bytes and merchant-local cross-order reuse protection.
- Added blocker-aware pack projections and atomic sealing: order locking, batch ownership/stock checks, one-time inventory decrement, shipment creation, `sealed` ledger entry and post-commit `tracking.push` publication.
- Added a tracking worker with deterministic request IDs, payer notification, bounded three-attempt handling, safe shipment/order projection, `tracking_pushed` ledger entry and failure alert.
- Added endpoint 39 inspection-photo persistence with merchant-owned hypothesis/rule checks and `inspection.uploaded` publication for Ishaan's attestation handler.
- Added merchant approval and worker execution for shared-cause actions: hold/release orders, inspection rules, buyer messages, offer evidence rebuilds and sandbox-bound refunds. Execution is ownership-checked, ledgered and idempotent for completed actions.
- Added the nightly retention handler: after 180 days from delivery it purges blob bytes while retaining hashes/rows, and preserves shared blobs referenced by any undelivered or still-retained order.
- Added PostgreSQL retention coverage for expired-byte purging and shared-blob preservation. **329 offline and 194 PostgreSQL tests passed**; typecheck, lint and formatting passed.
- Added the H6 watchdog sweep on the documented 15-minute schedule. It raises deduplicated tracking-gap, seal-overdue and dispute-due alerts at the fixed 72-hour/48-hour thresholds, appends only the tracking `gap_alert` ledger entry, and never sends buyer messages.
- Added PostgreSQL coverage for repeated-sweep deduplication and all three alert classes. **329 offline and 196 PostgreSQL tests passed**; typecheck, lint and formatting passed.
- Added merchant alert listing/acknowledgement endpoints and DEMO_MODE-gated synthetic shipment scan/delivery routes. Synthetic courier updates are labelled, merchant-owned, ledgered and unavailable when demo mode is disabled.
- Added authenticated `/mcp` JSON-RPC tool surface for catalog search, cached store reports, ownership-checked order proof and merchant-only dispute-evidence lookup. Agent access cannot read private order proof, and no PayPal action is performed by these read tools.
- Added a deterministic shopper policy loop with sandbox-only context propagation, caution-store skipping, non-verified-store confirmation pause, PayPal approval pause and capture-after-approval enforcement. The loop is provider-injected and does not fabricate AI, approval or sandbox outcomes.
- Added the deterministic `pnpm seed` command for fictional catalogue merchants/products. It is explicitly PayPal-free and reports the missing B17/Ishaan fixture and real sandbox-ID gates instead of fabricating them.
- Added authenticated MCP HTTP contract coverage and explicit `MCP_METHOD_NOT_FOUND`/`MCP_TOOL_NOT_FOUND` responses instead of generic server errors for unsupported requests.
- Added an injected authenticated MCP transport for the shopper policy loop. It validates JSON-RPC tool results, preserves explicit MCP error codes, requires a bearer token, and keeps the transport independent of model/provider execution.
- Added PostgreSQL-backed end-to-end coverage that drives the shopper policy through the authenticated MCP route and verifies the sandbox context passed to checkout.
- Replaced the dead `pnpm test:e2e` placeholder with an isolated local runtime smoke harness. It starts the assembled runtime, checks health/OpenAPI/authentication boundaries and reports A1–A14 as NOT RUN rather than mislabeling local smoke as acceptance.
- Extended the runtime smoke harness through authenticated MCP initialization and tool discovery, asserting the protocol version and all four exposed tool names.
- Extended the runtime smoke harness through an authenticated `search_catalog` tool call, validating the MCP text-content envelope and JSON payload without any PayPal request.
- Corrected the public verification instructions to describe the now-implemented `pnpm test:e2e` smoke behavior and its explicit A1–A14 limitation.
- Guarded `pnpm test:e2e` against non-loopback or non-`fairfold_*test` PostgreSQL URLs before any database connection is opened.
- Added PostgreSQL coverage for photo persistence, inspection queue publication and concurrent sealing. **192 database tests passed**; typecheck, targeted lint and formatting passed. I2 attestation/actions, real PayPal tracking and A6/A7/A11 remain **NOT RUN**.

## 2026-11-10 — H4 approved action execution

- Added the worker-owned `evidence.submit` executor for approved evidence, offer and claim packs. It re-fetches authoritative dispute state/options, validates the approved pack and content-addressed blobs, uses deterministic PayPal request IDs, and sends no vendor request for stale or invalid state.
- Added claim-before-POST idempotency. Successful responses retain only a bounded operation/status summary; definitive provider failures mark the pack failed and queue `evidence.rebuild`; network/unknown outcomes remain explicitly uncertain and are not replayed automatically.
- Added four PostgreSQL execution cases covering exact multipart bytes, stale-stage rebuild, unknown-outcome no-repeat behavior and definitive 422 recovery. The full database suite passed 186 tests, with typecheck and targeted lint also passing. Real PayPal action execution remains **NOT RUN**.

## 2026-11-10 — H4 approved tool and demo adjudication boundary

- Added the merchant-bound `provide_dispute_evidence` tool binding with exactly `dispute_id`, `evidences` and `files` inputs. It requires an exact approved pack and only queues the existing worker path; it cannot approve or execute a request directly.
- Added the DEMO_MODE-only merchant-owned adjudication route for simulated merchants, with explicit outcome validation and safe response projection. It is not invoked automatically and does not change the live/sandbox architecture.
- The full PostgreSQL/API suite passed 189 tests, with typecheck, targeted lint and formatting passing. Real sandbox adjudication and A12 remain **NOT RUN**.

## 2026-11-10 — H4 local completion audit

- Added hash-chain ledger entries for successful evidence submission, offers and claim acceptance, while preserving the safe response summary and uncertain-outcome boundary.
- Added execution coverage for both offer and claim operations, plus ledger persistence. The final local validation passed 329 offline tests and 189 PostgreSQL/API tests, typecheck, targeted lint and formatting.
- H4 local implementation is **COMPLETE**. Real PayPal action acceptance, Q2 return-address review, A12 and hosted deployment remain explicitly pending; no account-backed success is claimed.

## 2026-11-10 — H4 merchant evidence-pack approval

- Added endpoint 21 for merchant-owned evidence-pack approval. It validates draft state, dispute/pack ownership, actionable recommendations, offer/claim types, currency and bounded amounts, while rejecting `inspect_first`, `merchant_decides` and Q2 return-based actions.
- Approval identity/time and edited action parameters are persisted in the same PostgreSQL transaction as the `evidence.submit` pg-boss enqueue. Concurrent approval attempts serialize on the pack row; a queue failure rolls the approval back.
- The PostgreSQL/API suite passed 182 cases, including the approval route and queue assertion. Typecheck and targeted lint passed. Real PayPal action execution and A12 remain **NOT RUN**.

## 2026-11-10 — H4 current-state guards and concrete retention review

- Began H4 against the original source after H3 local closeout. Prepared the complete delivery sequence and exact dispute/message/action-summary allowlist, redaction limits and Q4 amount/approval-edit mapping for review.
- Implemented pure fresh-state/options checks: all actions require the source seller-response state; offers/messages also require INQUIRY; current offer/claim option lists and existing Q2 return gate are enforced.
- Added the pure approved dispute retention boundary: nested vendor fields are allowlisted, timestamps/money/symbols are validated, buyer/seller/arbiter text is normalized and conservatively redacted, and durable message fingerprints support idempotent buyer-message emission.
- All 27 H4 guard/policy cases and typecheck passed. No dispute persistence, execution workflow or vendor call was introduced; Hriday approved the concrete Q3/Q4 policy/mapping for the next local increments.

## 2026-11-10 — H4 authoritative dispute synchronization

- Added the merchant-scoped synchronizer shared by verified webhook and poll callbacks. It re-fetches authoritative dispute details, applies the approved retention boundary, maps seller transactions or exact merchant invoices, upserts the dispute, appends first-open/resolution ledger effects and publishes `dispute.synced` in the same PostgreSQL transaction.
- Wired the worker to use this synchronizer by default while retaining injected synchronizers for tests. Existing event-handler/poller regression cases, typecheck and targeted lint passed.
- Added five PostgreSQL synchronizer cases for capture/invoice mapping, message dedupe, resolution timestamps/ledger effects, queue rollback and detail-ID isolation. All five passed with the pure H4 suite, typecheck and targeted lint.
- Real PayPal dispute delivery/action evidence remains NOT RUN; no vendor mutation or real fixture was created.

## 2026-11-10 — H4 merchant dispute read surface

- Added merchant-scoped dispute list/detail projections for endpoints 17/18 with bounded cursor pagination, latest evidence-pack summaries and explicit allowlisted messages, evidence and response options.
- Wired both routes into the normal API/OpenAPI composition while retaining ownership and role guards; stored vendor fields are never returned.
- The PostgreSQL API contract suite passed all 9 cases, including projection, hidden-field and wrong-role checks. Approval and PayPal execution remain separate H4 units.

## 2026-11-10 — H3 worker runtime and acceptance closeout

- Wired both H3 handlers into the normal worker while preserving intelligence ownership, adding safe minimal configuration, schedule refresh and guarded startup/shutdown. The Blueprint worker references the API's existing encryption key; plans/resources are unchanged.
- Added read-only verified-event/order/ledger inspection and completed the H3 handoff, recovery limits and current deployment instructions. Local H3 is ready; H4 sync and all real acceptance remain explicit dependencies.
- All 302 offline and 180 PostgreSQL/HTTP cases passed, along with actual API/rehearsal/worker startup. Typecheck/lint/formatting and the 162-link publication audit passed; all 51 outgoing files passed exact local-secret and protected-path checks. Current Render schema passes; CLI validation lacks login. Automatic review blocked actual registration execution, so no vendor mutation ran.

## 2026-11-10 — H3 bounded polling and merchant schedules

- Added complete-page dispute polling with ID-only H4 dispatch, per-merchant coalescing, unchanged page filters and bounded cursor/page checks. Watermarks advance only after success with overlap; a restart safely replays supported history.
- Added actual keyed one-minute UTC pg-boss schedules for configured real merchants, excluding simulated/unconfigured rows and removing stale schedules.
- Nine new polling cases and all 175 PostgreSQL/HTTP cases passed; typecheck/lint passed. Real scope/list behavior remains NOT RUN; worker lifecycle wiring and final acceptance tooling follow.

## 2026-11-10 — H3 atomic capture imports and event processing

- Shared the approved capture mapper/store between checkout and the worker. Known/unknown capture reconciliation, catalogue snapshots, buyer/ledger/job effects and the event success marker now share one PostgreSQL transaction; cross-event imports serialize by PayPal order ID.
- Added SKU-first/name-fallback matching, exact catalogue/money/merchant guards, safe refund observation and explicit H4/reversal boundaries without financial POSTs or raw retention. Browser checkout retains its strict source checks.
- All 288 offline and 172 PostgreSQL/HTTP cases passed, including 24 new reconciliation cases and real pg-boss delivery; typecheck/lint passed. Corrected three initial ledger-array test assertions before the final run. Real provider acceptance remains NOT RUN; polling and runtime closeout follow.

## 2026-11-10 — H3 registration and durable verified ingress

- Recorded Hriday's explicit H3 phase exception and event-policy approval. Added merchant-locked seven-event registration and endpoint 37 with isolated original-byte parsing and the approved nested allowlist.
- Event and pg-boss job commit atomically; verified duplicates do not enqueue again, unverified rows cannot suppress authentic delivery, and provider failures never become trusted events.
- All 148 PostgreSQL/HTTP checks and nine new policy checks passed; typecheck/lint passed after correcting initial missing logger/dependency/test typing. Real registration/signature/A5 and hosted acceptance remain NOT RUN. Reconciliation/polling are the next local H3 work.

## 2026-11-10 — H3 source plan and event policy proposal

- Prepared the complete H3 sequence and verification matrix against the original documents: exact registration/path, verified durable ingress, capture import/refund reconciliation and per-merchant dispute polling.
- Added the registration recovery, real A5 redelivery and acceptance handoff, separating future-run instructions from implemented commands and observed results.
- Proposed an explicit webhook payload allowlist, transient original-body verification, unverified-event isolation/promotion and atomic PostgreSQL/pg-boss delivery. Capture approval remains separate from event/dispute retention.
- H3 implementation awaits the current no-H3 gate exception and this concrete Q3 review. No vendor, hosting or persistence action occurred; real acceptance remains pending.

## 2026-11-09 — H2 complete ForMerchant and local closeout

- Composed all 17 shared PayPalClient operations under a type-checked ForMerchant factory and wired it into the API/rehearsal runtime. The checkout adapter now projects from that complete composition; shared contracts remain unchanged.
- Added cross-group method execution, token coalescing/isolation and credential-rotation/removal checks. All 279 offline and 126 PostgreSQL/HTTP cases passed; typecheck/lint and actual normal/rehearsal startup checks passed without vendor calls.
- Finished the local H2 implementation pass and consolidated the exact account/approval/fixture checklist. Formal acceptance remains pending; Q2 return-address branches remain explicit review gates. No H3 processing was added.

## 2026-11-09 — H2 exact-body webhook client

- Implemented verify/register methods, preserving raw event formatting in signature postback and requiring the exact provider verification result. Added scoped raw-JSON transport, header/certificate/input checks, explicit registration snapshots and returned-resource validation.
- All 80 targeted webhook/action/transport checks, typecheck and lint passed. No real webhook was registered/verified, no simulator bypass exists and no H3 handler/poll/persistence was added.
- Recorded signature, registration-retry and raw-retention boundaries; complete ForMerchant composition is the next local client step.

## 2026-11-09 — H2 dispute action and evidence bindings

- Implemented the six source dispute action methods and stable, binary-preserving multipart evidence transport. Added exact amount/type rules, JSON/file guards and precise Q2 errors for unrepresentable return-address branches without changing contracts.
- All 86 targeted action/order/transport checks, typecheck and lint passed. Raw payloads remain transient, no H4 action workflow is exposed and no actual vendor action ran.
- Preserved bounded 429 retries and refused unsafe 5xx/network replays; documented current JSON-example/schema differences, file ceilings and real-test/review gates.

## 2026-11-09 — H2 full-client dispute reads

- Implemented dispute list/get bindings, UTC/date/state/page validation and both legacy-token and current page-number pagination through the unchanged opaque cursor field. Vendor links are validated for cursor extraction and never followed.
- All 23 new synthetic transport/parser checks and typecheck passed; real dispute/scopes/pagination remain NOT RUN.
- Corrected the H2 scope inventory: complete low-level PayPalClient/ForMerchant belongs to H2; H3/H4 event/poll/approved-action workflows remain unstarted. Added the client inventory and read evidence.

## 2026-11-09 — Render workspace recheck and current deployment handoff

- Confirmed the user's selected My Workspace through connected Render tools. Read-only discovery found no Fairfold services and no PostgreSQL instances; quota recovery, billing readiness and unapplied Blueprints remain unverified.
- Updated deployment/handoff checks for the current H2 runtime and seven routes. Preserved the paid API/worker/Postgres architecture, private secret entry and pending first-deploy gate; no resource, plan or billing mutation occurred.
- Updated current status and retained the prepared, unsent Ishaan handoff. This documentation increment completes no H task.

## 2026-11-09 — H2 executable local rehearsal and A4 audit

- Replaced the sandbox-command placeholder with read-only check, opt-in recorded rehearsal server and read-only capture verification. Normal and rehearsal servers share the existing H2 application composition; no payment starts automatically.
- Added source merchant/item/amount checks, filled protection/account fields, first captured ledger identity/details/hash verification and matching sanitized create/capture observations. Maya/SDK claims remain separate human evidence steps.
- All 126 PostgreSQL/HTTP cases and 201 offline cases passed; typecheck/lint/formatting passed. Actual normal-server demo-on/off checks and rehearsal CLI startup passed using isolated synthetic setup, without vendor calls.
- Added the complete setup-to-evidence operator guide and recovery/handoff gates. Actual absent-account commands skip/block honestly; real A4, Maya, fixtures and H1 hosting remain pending. H3–H8 remain unstarted.

## 2026-11-09 — H2 sanitized sandbox response recording

- Added opt-in recording after the real create/capture/recovery parsers, with in-memory allowlisting and synthetic replacements for buyer/shipping fields. OAuth/raw bodies never reach a recording sink; recording failures preserve payment semantics.
- Added atomic ignored-file writing, strict replay validation and recorded-response parser acceptance without a synthetic fallback. Captured GET records remain distinguishable from capture POST records.
- Seventeen new offline checks passed (201 total); typecheck/lint passed. Actual recorded acceptance explicitly skipped because no real response records exist. See response-recording evidence; no PayPal success is claimed.

## 2026-11-09 — H2 minimal sandbox merchant setup

- Added setup:sandbox for the source Neel merchant and USD38 hoodie only, with encrypted credentials, local/demo/sandbox guards and transactional repeat/concurrency safety. Conflicting setup fails without overwriting existing data.
- Nine new PostgreSQL cases passed (111 total) and eleven offline environment/error cases passed. Typecheck passed. The actual command skipped absent sandbox credentials without making database/vendor calls.
- Full B17 seeding, Maya identity mapping and real PayPal acceptance remain pending; see the setup evidence.

## 2026-11-09 — H2.4 unstyled sandbox checkout harness

- Added /dev and its plain JavaScript asset behind DEMO_MODE. The source hoodie defaults, client-ID-only sandbox SDK, eligibility check and one-time payment session use the implemented API; no Figma/product UI or frontend scaffold was added.
- Mapped the SDK’s order promise to { orderId: paypalOrderId }, started the session before awaiting creation, guarded double clicks/approval context, and printed the safe capture JSON as text. Cancellation/errors never claim payment completion or print raw SDK data.
- Added explicit retry of the same approved capture after an uncertain failure, blocking a fresh purchase until that check completes. No automatic new payment, client token, browser credential or raw response persistence was introduced.
- All 12 harness flow checks passed, bringing offline tests to 173; all 102 PostgreSQL/HTTP cases passed again. Actual API runs verified both demo-on 200 and demo-off 404 asset behavior. Typecheck/lint/formatting passed; real browser SDK/A4 remain NOT RUN.
- Updated the integration handoff, source SDK reference decision and sandbox command wording to retain the real-account/fixture/Render gates honestly.

## 2026-11-09 — H2.4 checkout/order HTTP and runtime wiring

- Implemented source endpoints 2/3/4/7/8/30/31 with unchanged request/response fields, generated OpenAPI, shared safe errors, role guards and SQL ownership. Creation returns 201; capture accepts no body or an empty object.
- Wired database credentials, the real checkout client, approved stores, order reads, intelligence seam and pg-boss into API startup/shutdown. Runtime health identifies H2 with the existing labelled intelligence stub.
- All 102 PostgreSQL/HTTP checks passed, including eight new route cases; 161 offline tests passed. Corrected the initial optional-body schema failure before committing. Typecheck/lint/format checks passed.
- The actual server bootstrap passed a temporary loopback HTTP smoke check for queue/database readiness, all seven documented routes and protected private access. No external PayPal request or Render deployment occurred.
- Added the concrete checkout integration/handoff guide; /dev and real sandbox acceptance remain next.

## 2026-11-09 — H2.3 checkout capture recovery

- Added a real checkout client factory and authoritative captured-order GET parser inside packages/paypal, preserving the complete shared PayPalClient/ForMerchant contracts as unfinished rather than adding placeholders.
- Added application orchestration using the stored order’s merchant, stable ff-capture ID, local callback coalescing and the existing minimized atomic capture store. Existing/uncertain/racing captures are re-fetched without an application-level second POST.
- Added honest public configuration from stored merchant/catalogue fields and kept actual PayPal payer identity separate from browser demo subjects. Public capture returns only OrderSummary; private reads retain ownership requirements.
- All 94 PostgreSQL checks and 161 offline tests passed, including 17 new workflow and 11 recovery-parser cases. Typecheck/lint/format results and source limits are recorded in the recovery evidence; no external PayPal request or hosted success is claimed.

## 2026-11-09 — H2.3 owner-scoped order reads

- Added merchant/buyer SQL ownership filters for lists and details, repeatable-read snapshots, status filtering and stable time/UUID pagination. Missing and foreign private orders share the same 404; admin/agent roles receive no implicit bypass.
- Projected exact existing summary/row/detail DTOs. Buyer details neutralize merchant signals, hold/investigation links, stock batch and payer account status; hashes, credentials, raw dispute/scan data and ledger payloads never leave the read layer.
- Read merchant-scoped latest stored signal summaries, unacknowledged alert counts, unresolved disputes and linked investigations. Merchant detail invokes the existing computeBuyerSignal seam only after ownership succeeds; its current labelled stub remains explicit.
- Added 16 real PostgreSQL read cases; all 77 database checks passed. Typecheck/lint passed after correcting the initially rejected Drizzle read-only option. Full validation and remaining runtime gates are recorded in the read evidence.

## 2026-11-09 — H2 repeatable creation test fixture

- Fixed the listing-change integration test’s reused synthetic PayPal order ID. Its fixed value collided with a prior successful test row on the second suite run; application behavior was unchanged.
- Derived the fixture ID from the test’s fresh server-owned UUID. All 19 creation cases passed twice consecutively against the same database; typecheck passed.
- Recorded the observed failure and recovery in the repeatability evidence. This does not advance PayPal sandbox or deployment acceptance.

## 2026-11-09 — H2.3 database-priced checkout creation

- Added checkout creation using the unchanged request DTO and merchant-owned product records. Browser item prices/names/listing versions are ignored; duplicate SKU quantities combine with SQL-integer and exact decimal total bounds.
- Sent the specified reference/custom/invoice and ff-create request IDs, then atomically stored the created order/items using the exact price/listing snapshot sent to PayPal. Shipping remains transient until the approved capture mapping.
- Added guards for missing/simulated merchants, foreign/unavailable products, mixed currencies, invalid quantities and zero/overflow totals before vendor calls. Vendor or credential failures leave no local order.
- Documented the existing vendor-create/local-write recovery gap: failed local persistence returns safe identifiers and never automatically replays creation. No new schema, shared contract or background recovery system was introduced.
- All 61 PostgreSQL checks passed, including 19 new creation cases. Offline suite/typecheck/lint/format evidence is recorded with the increment. Routes, ownership reads, /dev and real PayPal/Render gates remain pending.

## 2026-11-09 — H2.3 atomic capture persistence

- Added the application capture store using a merchant-scoped order row lock and one checked-out PostgreSQL connection for buyer/order writes, ledger savepoint and pg-boss enqueue. No schema or shared DTO changed.
- Matched actual order/capture money and source identifiers against the stored order; incomplete captures, foreign merchants, invalid transitions and conflicting capture IDs fail without partial effects.
- Made repeated/concurrent callbacks no-ops after the first committed capture, preserving later fulfillment/refund states. The ledger/job contain only the approved minimal fields.
- Verified 25 new real PostgreSQL cases, including eight concurrent callbacks and rollback after an actual queue insert. All 42 database checks and 150 offline tests passed; typecheck, lint and formatting passed. Recorded scope and remaining H2/H1 gates in the capture persistence evidence.

## 2026-11-09 — H2.3 approved capture retention mapper

- Recorded Hriday’s explicit approval of the concrete capture policy; Ishaan’s review and Q3’s other payload boundaries remain open.
- Added an application-layer capture mapper using NFC/lowercase email hashing and canonical six-component address hashing, including transient address_line_2. Only the approved fields leave the mapper.
- Added synthetic tests for normalization, excluded plaintext, unknown fields, response consistency and invalid amounts. Database writes, routes and real sandbox acceptance are separate increments.
- Validation results are recorded in the H2.3 mapper evidence.

## 2026-11-09 — Q3 capture persistence review package

- Prepared a concrete existing-schema allowlist and proposed email/address hash normalization before H2.3. It includes address_line_2 only as transient hash input and keeps the shared CaptureResult unchanged.
- Specified missing-data, capture-state/amount validation, exactly-once transaction and safe fixture boundaries. These are review/implementation requirements, not completed capture persistence tests.
- Kept Q3 open and distinguished capture review from later webhook/dispute/reporting/action-response field reviews. No reviewer approval, outgoing message or database write was implied; application files are unchanged in this increment.

## 2026-11-09 — H2.2c refund and bounded reporting helpers

- Implemented the unchanged payment/refund and Transaction Search method groups. Full refunds send an empty object; partial amounts use exact decimal/currency checks. Refund IDs and actual statuses are returned without assuming PENDING means completed.
- Added explicit RFC3339 millisecond/offset date validation, maximum 31-day windows, fields=all, fixed local pagination with 500 rows/page, stable metadata/count checks and a documented local 100-page budget. Incomplete or changing results fail instead of returning partial history; duplicate transaction IDs are preserved.
- Verified official Payments 2.12 and Transaction Search 1.10 specifications. Refund retries use the documented request-ID support; no vendor pagination links are followed. No dependency or shared interface changed.
- Added 25 synthetic refund/reporting cases. The complete offline suite passed 136 tests with 17 database checks skipped; typecheck and lint passed. Actual refunds/history calls, ownership/approval/balance guards in future callers, Q3 capture persistence, public routes and real sandbox checks remain pending.

## 2026-11-09 — H2.2b tracking and carrier mapping

- Completed the existing Orders method group with flat-body addTracking, explicit notification choice, validated returned tracker selection and unchanged request IDs. No seal, tracking job or notification was executed.
- Added the source carrier crosswalk, including INDIA_POST to IN_INDIAPOST and named Indian carriers. Bare OTHER is rejected by the dispute mapper; callers must supply the stored actual carrier name, never a guessed default.
- Preserved the required POST request-ID header while disabling automatic tracking 5xx replay because the operation does not document that idempotency header. HTTP 429 remains bounded by the existing transport.
- Added 28 synthetic tracking/carrier cases. After correcting validation failures before commit, the full offline suite passed 111 tests with 17 DB checks skipped; typecheck and lint passed. Evidence distinguishes official response examples from unobserved real sandbox behavior.

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

## 2026-11-12 — H8 reviewed website actions

- Connected fresh camera capture, labelled multipart uploads, actual batch/tracking seal inputs, explicit attestation overrides, exact evidence-pack review/PDF download, shared-cause action review, stock inspection and confirm/dismiss controls. Reused the supplied console card/button styling for functional review dialogs.
- Added cancellation, duplicate-click and stale-view guards; an unknown POST outcome is never retried automatically. Approval and sealing are labelled separately from PayPal execution. Corrected the merchant order-list binding to the canonical endpoint.
- Validation: typecheck/lint PASS; 15 focused route/transport/action/server tests PASS. Real camera/provider/PayPal and browser/hosted acceptance are still pending.
