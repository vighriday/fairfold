# Fairfold decisions and contract questions

Recorded 9 November 2026 IST. The architecture's choices below are inherited, not newly selected. The user has authorized H1 around the absent sandbox accounts. Current questions remain review inputs; no shared-contract alteration has been approved.

## Fixed architecture decisions

| ID  | Existing choice                                                                                   | Source                |
| --- | ------------------------------------------------------------------------------------------------- | --------------------- |
| D1  | Per-merchant REST app credentials behind `PayPalCredentials`; partner mode is future work         | Architecture 5        |
| D2  | Verified webhooks plus a one-minute dispute reconciliation poll                                   | Architecture 5, 8 F4  |
| D3  | TypeScript, Node.js 22 LTS or newer                                                               | Architecture 5, 14    |
| D4  | Fastify 5, Zod and generated OpenAPI                                                              | Architecture 5        |
| D5  | PostgreSQL 16 with Drizzle                                                                        | Architecture 5, 7     |
| D6  | pg-boss using the same Postgres                                                                   | Architecture 5        |
| D7  | Content-addressed Postgres `bytea`; image max dimension 2,048 px; BlobStore abstraction           | Architecture 5, 12    |
| D8  | Per-order SHA-256 hash chain; external anchoring is stretch only                                  | Architecture 5, 7     |
| D9  | Vercel AI SDK with structured output and embeddings                                               | Architecture 5, 10    |
| D10 | Environment-selected models/provider; optional separate embedding provider                        | Architecture 5, 14    |
| D11 | Embeddings in `real[]`, cosine comparison in memory                                               | Architecture 5, 9     |
| D12 | Fixed-taxonomy extraction, deterministic product/category grouping and cosine threshold 0.80      | Architecture 5, 9     |
| D13 | Exposure-based exact conditional binomial test, Benjamini–Hochberg correction; Fisher cross-check | Architecture 5, 9     |
| D14 | Transparent points and reason codes for Buyer Signal                                              | Architecture 5, 10    |
| D15 | Separate Fairfold MCP server alongside PayPal tools                                               | Architecture 5, 16 H7 |
| D16 | REST/JSON contract; OpenAPI at `/docs`                                                            | Architecture 5, 11    |
| D17 | Seeded role/subject demo bearer tokens                                                            | Architecture 5, 12    |
| D18 | Render web service, worker and Postgres from one blueprint                                        | Architecture 5, 14    |

## Operational instructions for this branch

| ID  | Instruction or clarification                                                                                                                           | Basis                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | All authored work stays on `Hriday`; no task branches or direct main updates                                                                           | Explicit user instruction overrides architecture 14/16 workflow wording                                                                                          |
| O2  | The initial pass was research/documents only; the user subsequently authorized building H1 around absent sandbox accounts                              | User's two explicit replies on 9 November; application work now permitted                                                                                        |
| O3  | Internal sources and extracted media never enter Git                                                                                                   | Local internal README; `.gitignore` protects them                                                                                                                |
| O4  | No app success, deployment, evaluation, interview or prize outcome is claimed without evidence                                                         | Architecture completion checks and submission 18                                                                                                                 |
| O5  | Standard v6 checkout uses client ID only; do not add a client-token route from the summary table                                                       | Architecture 3 and 16 H2 are specific; current [migration guide](https://developer.paypal.com/v5-v6) supports this                                               |
| O6  | The sandbox buyer opens the dispute manually; no ordinary API creation script is assumed                                                               | Architecture 3 and pre-H1 brief; current [setup guide](https://developer.paypal.com/platforms/disputes/set-up) requires additional buyer scopes for API creation |
| O7  | Public testing instructions may explain access; they must not publish PayPal passwords, app secrets or bearer tokens                                   | Architecture 1/12 no-secrets rule governs older submission wording about credentials in README                                                                   |
| O8  | CP0 is past its planned date and unverified; preserve the original milestones, record actual completion dates                                          | Current date is 9 November; architecture 18 planned CP0 for 8 November                                                                                           |
| O9  | `AI_EMBEDDING_PROVIDER` selects the embedding provider; the adjacent “Webhook verification” cell is a clerical mismatch                                | Architecture D10, section 14 variable description and I1 agree                                                                                                   |
| O10 | Planning preparation uses `DOCS:` commits and does not satisfy H1                                                                                      | Architecture 16 requires working acceptance evidence for H tasks                                                                                                 |
| O11 | Defer the real pre-H1 sandbox spike and proceed with H1; retain all sandbox acceptance gates as NOT RUN                                                | User confirmed accounts do not exist and instructed “In the meantime build around it”                                                                            |
| O12 | Pin pnpm 12.4.2/TypeScript 5.9.3 and compatible packages; use SQL column names in Drizzle, one-hour demo JWTs and local generated secrets              | H1 implementation details within D3–D5/D17; no architectural replacement                                                                                         |
| O13 | Validate locally against isolated native PostgreSQL 16.15 on loopback because Docker is absent; retain Compose postgres:16 and Render major version 16 | Official Windows binaries linked by PostgreSQL; no Windows service or production database changed                                                                |

### O14 — Initial hosted URL configuration

On Render only (`RENDER=true`), use its documented `RENDER_EXTERNAL_URL` as the default APP_BASE_URL, and default FRONTEND_ORIGIN to that app URL while H1/H2 serve Swagger and the unstyled harness from the API origin. Explicit APP_BASE_URL and FRONTEND_ORIGIN still take precedence; local configuration still requires both. Configure the actual Figma frontend origin when it exists. This avoids guessing a hostname before first resource creation and preserves the section 14 environment names and section 12 CORS boundary. Source: [Render's default environment variables](https://render.com/docs/environment-variables).

## Questions to resolve before the affected implementation

| ID  | Finding and consequence                                                                                                                                                                                   | Required evidence or review                                                                                                                                                                                                                                                                                                                              | Gate                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Q1  | Actual dispute status, lifecycle stage, available links/options and arrival delay are unknown                                                                                                             | Run the pre-H1 spike; record both detail snapshots and timing                                                                                                                                                                                                                                                                                            | Before H1 per brief            |
| Q2  | `REFUND_WITH_RETURN` needs a return address, absent from `PayPalClient.acceptClaim` and action parameters; `makeOffer` also omits address support for that choice                                         | Joint Hriday/Ishaan contract review after observing allowed options; no new field added here. [PayPal offer reference](https://developer.paypal.com/api/customer-disputes/v1/disputes-make-offer) and [schema](https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/customer_disputes_v1.json) establish the requirement | Before return-based H4 actions |
| Q3  | `CaptureResult.raw`, `disputes.raw` and event payloads can retain email/street addresses, conflicting with privacy requirements if persisted unchanged                                                    | Agree a sanitization boundary that preserves verification inputs transiently and required identifiers; review fixture redaction before commits                                                                                                                                                                                                           | Before H2/H3 persistence       |
| Q4  | `EvidencePackDraft.actionParams.amount` differs from stored `action_params.offerAmount`/`refundAmount` and approval body `amount`                                                                         | Agree explicit mapping at the existing boundary; test all three shapes; do not rename shared fields implicitly                                                                                                                                                                                                                                           | H4/I5 integration              |
| Q5  | API detail/schema renders accept-claim as multipart with incomplete structured fields, while the official integration guide demonstrates JSON `note`; full `accept_claim_reason` enum remains unspecified | Sandbox-test the supported JSON path and allowed types. Omit optional reason until verified. Do not generate a guessed enum                                                                                                                                                                                                                              | Pre-H1/H4 spike                |
| Q6  | Webhook resource shape is still an external uncertainty                                                                                                                                                   | Observe a real dispute webhook; preserve `resource.dispute_id` then `resource.id` fallback and authoritative GET; do not invent a fixture                                                                                                                                                                                                                | H3/H4                          |
| Q7  | H4's full A12 uses fulfilment/delivery facilities implemented later; H1's first deploy depends on Render access                                                                                           | Use the documented stub pack and recorded PayPal transaction for the H4 component check; record full A12 as pending until deployed integrated test; acquire Render access before declaring H1 done                                                                                                                                                       | H1, H4 and H8                  |
| Q8  | The seed's B14 “received 75 days ago” and comparison population “delivered in last 60 days” need explicit delivered dates                                                                                 | Choose delivery dates that satisfy both existing rules; keep received dates unchanged; assert the population and denominator before trusting A1/A2                                                                                                                                                                                                       | H8/I6 fixture review           |
| Q9  | A1 needs 18 unshipped orders with B17 stock; live checkout adds an order that must be sealed before recounting. Seeded disputes also affect Store Report bands                                            | Verify exact counts before and after live capture/seal/dispute. Keep seam complaints as complaints unless specified as disputes; do not silently alter band thresholds or seed totals                                                                                                                                                                    | H8/A1/A14                      |
| Q10 | Agent tool `get_order_proof` needs an ownership policy for private order IDs; H7 names role access but not this finer rule                                                                                | Review with Hriday/Ishaan against section 12 ownership rules before exposing private proof to an arbitrary agent                                                                                                                                                                                                                                         | H7                             |
| Q11 | A durable event row followed by a failed enqueue can leave an unprocessed event if every duplicate exits immediately; one-minute dispute polling alone does not repair capture imports                    | Resolve the atomic/retry boundary within the chosen Postgres/pg-boss design; prove recovery without changing the event/API contract                                                                                                                                                                                                                      | H3                             |
| Q12 | PayPal documentation establishes Orders request-id support, not universal idempotency for every dispute operation                                                                                         | Keep deterministic IDs as specified; establish local dedupe/claiming and re-fetch on ambiguous outcomes; verify per-operation behavior before retrying money actions                                                                                                                                                                                     | H2/H4/H5                       |
| Q13 | The H4 check expects an offer to fail after `sandboxRequireEvidence`, but that endpoint documents response-status changes, not necessarily a move out of INQUIRY                                          | Observe status and lifecycle stage separately; agree the exact stage-change rehearsal before declaring STAGE_CHANGED coverage                                                                                                                                                                                                                            | Pre-H1/H4 spike                |

Q2–Q13 are focused review items. None authorizes a new architecture, payment rail, safety verdict, or change to the idea. Where external behavior blocks a specified path, record the failure and use only a jointly accepted documented fallback.

## Sandbox spike result

Status: **DEFERRED BY USER; NOT RUN**. The user confirmed accounts do not currently exist and authorized H1 around that dependency. No sandbox transaction, dispute, webhook, evidence upload or offer has been observed. Fill the result fields in `docs/hriday/sandbox-spike.md` after the real run. No guessed PayPal identifiers or success responses belong here.

## Ishaan (intelligence)

### I-D1 — AI provider is Grok (xAI) — 2026-11-09
- `AI_PROVIDER=xai` through the Vercel AI SDK provider `@ai-sdk/xai`, with key `XAI_API_KEY`. `AI_MODEL_VISION` and `AI_MODEL_TEXT` hold Grok model ids.
- `packages/ai` still supports `openai | anthropic | google` (D10 is unchanged).
- Embeddings: `AI_EMBEDDING_PROVIDER` (default = `AI_PROVIDER`). If the chosen provider has no embedding model in the AI SDK, `embed()` throws `EMBEDDING_PROVIDER_UNSUPPORTED` with a clear message instead of failing silently.
- Contract change: none. `.env.example` (Hriday) should add `XAI_API_KEY` and `xai` to the `AI_PROVIDER` options.

### I-D2 — Buyer Signal points: no double count for lost disputes; refund ratio +10 — 2026-11-09
- The section 10 table made the seeded buyer "Alex R." red (at least 35 points), while sections 17 and 19 require him to be yellow for the video.
- Change:
  - OWN_DISPUTES_FILED (+10 each, max +30) counts only disputes the buyer did **not** lose.
  - OWN_DISPUTES_LOST (+15 each, max +30) counts the lost ones.
  - OWN_REFUND_RATIO is **+10** (was +15).
- Alex: OWN_DISPUTES_LOST 15 + OWN_REFUND_RATIO 10 + NEW_ADDRESS 5 + PAYER_VERIFIED −5 = 25 → yellow.
- Contract change: **yes**, to section 10's points table. Needs Hriday's approval.

### I-D5 — Alex R.'s seeded history must give a refund ratio above one half — 2026-11-09
- OWN_REFUND_RATIO needs at least 2 orders with **more than** half refunded. With "one earlier refund" over 2 orders (exactly half), the rule cannot fire. The eval profile therefore gives Alex 2 earlier orders, both refunded, one of which he later disputed and lost, plus a new ship-to address.
- Action for Hriday's `scripts/seed.ts`: seed Alex's history to match this profile (`packages/intelligence/eval/fixtures/buyers.json`, id `b15`).
- Contract change: none (seed data only).

### I-D3 — Dispute messages are appended, not new complaint rows — 2026-11-09
- Section 9 lists a `dispute_message` source, but the `complaints.source` check constraint allows only `buyer_report | dispute | review`, and section 7 says dispute messages are appended to the dispute's complaint text. We follow section 7.
- Contract change: none.

### I-D4 — Contracts shim replaced by H1's `@fairfold/contracts` — 2026-11-09
- H1 landed on `Hriday`; it is merged into `ishaan` locally. The temporary shim is deleted and every intelligence import uses `@fairfold/contracts`.
- Ishaan's route schemas live in `packages/contracts/src/intel.ts`, imported as `@fairfold/contracts/intel` (the existing `./*` export), so `contracts/src/index.ts` is unchanged. This file reaches Hriday by pull request as section 14 asks.
- The worker imports a ready `handlers` map and the API registers the intel plugin without options, so `packages/intelligence/src/runtime.ts` builds the database and a lazily-started pg-boss publisher from `DATABASE_URL` on first use. Tests inject their own runtime.
- For Hriday: `/healthz` and the worker log reported `intelligence: 'stub'` until I-D13 retired the stubs.
- Contract change: adds `intel.ts` only.

### I-D6 — Buyer Signal sentence is stored inside `buyer_signals.features` — 2026-11-09
- `BuyerSignal` (section 10) has a `sentence`, but `buyer_signals` (section 7) has no column for it. The stored `features` JSON carries `{ ...features, sentence }`, so endpoint 9 returns the same sentence without a second model call.
- Endpoint 34 also returns `signalId`, because a buyer needs it to call endpoint 35 (contest). The field is additive.
- A missing model configuration now degrades to each component's template fallback (logged as `model_not_configured`) instead of failing the job.
- Contract change: none (additive response field).

### I-D7 — Local embedding when no embedding provider is configured — 2026-11-09
- xAI (our chosen provider, I-D1) has no embedding model, so with Grok alone shared-cause grouping would never run.
- When `AI_EMBEDDING_PROVIDER` / `AI_MODEL_EMBEDDING` and its key are not set, `readComplaint` embeds the extracted `category | component | failure_mode` string with a deterministic local feature-hashed bag of stemmed words (`localEmbedding`, 256 dimensions), and logs `embedding: local`. A configured OpenAI or Google embedding model always takes precedence.
- The clustering eval reports which embedding it used; the 0.80 threshold still applies (raise `CLUSTER_SIMILARITY` if precision falls below 0.85).
- Contract change: none.

### I-D8 — Hypothesis explanation, headline and cluster label are written by code — 2026-11-10
- Section 11 calls `HypothesisDetail.explanation` "model-written, from the stats only", but none of section 10's five model components produces it. Code writes it from `HypothesisStats` alone (`sharedCause/wording.ts`): counts, rate ratio, p, q, tests run, median days since delivery, spread and the listing-change flag. No model call, so no number can be invented.
- The cluster label is `component: failure_mode` from the first member's extraction (else the category). Model-extracted phrases are reduced to at most 60 plain characters before they reach the Message Drafter prompt or a buyer message.
- Contract change: none.

### I-D9 — A dispute that joins a live hypothesis gets its pack rebuilt — 2026-11-10
- `dispute.synced` builds the first pack before the Complaint Reader and the debounced scan have placed the dispute's complaint in a cluster, so that first pack cannot see the hypothesis. After a scan, every open dispute whose complaint was newly clustered with an open or confirmed hypothesis (or whose cluster's hypothesis is new) is sent to `evidence.rebuild`, which supersedes the earlier draft with `inspect_first`. Maya's live dispute therefore shows `inspect_first` about a minute after it syncs.
- Contract change: none.

### I-D10 — Buyer message drafts: one per buyer, level kept in the action payload — 2026-11-10
- `send_buyer_messages` carries `{ messageIds, level }`; `level` (`suspected` | `confirmed`) is additive and lets re-scans skip buyers already drafted at that level, so scans stay idempotent. Orders without a buyer get no draft (an in-app message needs a recipient). Drafts go to the hypothesis's in-transit and delivered-without-complaint orders (section 9 stage 5).
- Contract change: additive field in an action payload.

### I-D11 — Confirm, dismiss and trend details — 2026-11-10
- Confirm counts one inspected unit per inspection attestation; a unit is defective when its `inspection.defectVisible` and `inspection.matchesCluster` are both true. With no defective unit, 409 `NO_DEFECTIVE_UNIT` carries `{ inspected, defective, clean, suggestDismiss }`; `suggestDismiss` is true at ten or more clean units. `HypothesisDetail` has no field for the suggestion, so it lives in that error.
- Dismiss accepts open or confirmed hypotheses. The `{ reason }` has no column, so it is stored in the proposed `release_orders` payload (`{ orderIds, reason }`) and in the result of every still-proposed action, which dismiss withdraws (`status: failed`, `result: { withdrawn: 'hypothesis_dismissed', reason }`) so nothing is approved for a dismissed cause. A re-scan never reopens a dismissed hypothesis.
- A superseded hypothesis is history: endpoint 22 leaves it out and endpoint 23 answers 409 `HYPOTHESIS_SUPERSEDED` (its status is not in `HypothesisDetail`'s enum).
- Trend `rate` is complaints per order-day of exposure, exactly as stage 4 counts them; weeks are ISO weeks of delivery (of shipping for transit categories), keyed by their Monday.
- Contract change: none.

### I-D12 — Shared Cause and report-problem routes — 2026-11-10
- Endpoint 22 takes the merchant from the token. A1 calls it with `?merchantId=`; the parameter is accepted and must equal the token's merchant (403 otherwise).
- Endpoint 32 accepts files in `photos` or `photos[]` (at most 4, else 400 `TOO_MANY_PHOTOS`) and a required `text`; only the buyer's own paid order (captured or later) can be reported. Photos go through `blobs.put`, so its JPEG/PNG and size checks apply. No ledger entry is written for a report (section 8 names none).
- Clustering precision on `complaints.json` (task I6 gate) needs the real model's extractions and is measured in I7's eval run; it is NOT RUN as of this entry because no provider key is configured locally.
- Contract change: none.

### I-D13 — H1 intelligence stubs retired — 2026-11-10
- The worker registers the real intelligence handler map (9 handlers) and the API registers all 18 intelligence endpoints, so the H1 stand-ins were false. At Ishaan's instruction ("no scaffolding throughout the project") they are removed: `packages/contracts/src/stubs.ts` and its test are deleted (nothing else imported them), `/healthz` returns `intelligence: 'ready'`, the worker logs `intelligence: 'ready'`, and the OpenAPI description no longer says the intelligence endpoints are missing. Hriday's H1 deployment checklist, status and handoff lines that expected the stubs are corrected to match.
- Not changed: Hriday's unbuilt H2–H8 work (checkout, PayPal actions, seed, `test:e2e`) keeps its accurate NOT RUN / not-implemented labels; building it is outside I1–I7.
- Contract change: **yes** — `/healthz`'s `intelligence` literal changes from `stub` to `ready`, and `@fairfold/contracts/stubs` no longer exists. Needs Hriday's review.

### I-D14 — Model provider switched from Grok (xAI) to Google Gemini's free tier — 2026-11-10
- Ishaan cannot add billing, and xAI's API needs paid credits. The Gemini API's free tier needs only a Google AI Studio key, so `.env` now uses `AI_PROVIDER=google` with `GOOGLE_GENERATIVE_AI_API_KEY`. This replaces I-D1's provider choice; the code is unchanged because `packages/ai` already supported Google (D10).
- Gemini also offers embedding models, so `AI_EMBEDDING_PROVIDER=google` with an `AI_MODEL_EMBEDDING` id gives real complaint embeddings; left blank, the local embedding (I-D7) still applies.
- Free-tier rate limits apply. A rate-limited call counts as a failed attempt and then uses the component's fallback, which would lower an eval score without the model being wrong, so eval runs are checked with the call-log summary (`cost`) for failed calls before their numbers are published. Free-tier inputs may be used by Google to improve its products; Fairfold sends only synthetic data, Fairfold ids and no buyer email or street address.
- Contract change: none (environment only). Hriday's `.env.example` still defaults to `openai` and lacks `XAI_API_KEY`; it should list `google` as the team's free option.

### I-D15 — Free-tier quota: retry only schema failures, cache answers, never score a fallback — 2026-11-10
- The first Gemini eval run hit the free tier's daily cap: 60 calls returned `429 RESOURCE_EXHAUSTED` ("Generate content requests per day … limit: 20"). The gateway also retried every failure, so each refusal cost two requests.
- `packages/ai` now retries **only schema failures**, as section 10 states ("a schema failure retries once, then the fallback runs"). A timeout or a provider refusal goes straight to the fallback, and the log line carries the HTTP `status`.
- Model answers can be cached by provider, model, input hash and output schema when `AI_CACHE_DIR` is set (architecture section 21's own fallback: "cache attestation and extraction results by input hash; record the video from cached runs"). Only schema-valid answers are stored, and they are re-validated on read; fallbacks are never cached. The eval runner sets the cache to the ignored `.work/ai-cache`, so a run cut short by the quota resumes without paying twice. The API and worker cache nothing unless the variable is set.
- The photo and complaint evals report `not measured: k of n model calls fell back …` whenever any call fell back, instead of a score. The 2026-11-10 quota-starved run (photos "5 of 20", grouping "1.00") is therefore not a result and is not published.
- Contract change: none.

### I-D16 — CLUSTER_SIMILARITY 0.85 with Gemini embeddings; Gemini models chosen — 2026-11-10
- The task I6 gate (clustering precision ≥ 0.85 on `complaints.json`) measured **0.60** at the default 0.80 with `gemini-embedding-2`, because these embeddings rate short `category | component | failure_mode` strings as very similar. As the plan prescribes, the threshold is raised to **0.85** (`CLUSTER_SIMILARITY=0.85` in the environment; the code default stays section 9's 0.80). Measured on the same 24 texts: 0.85 → precision 1.00 with 45 of 53 same-cluster pairs grouped; 0.88 → 24 of 53; 0.90 → 19 of 53. The threshold was chosen on the evaluation set itself, so it is calibrated rather than independently validated.
- Demo check at 0.85: the five B17 and one B15 seam complaints of the seed plus Maya's live-dispute text form one cluster; size, late and colour complaints stay apart.
- The local embedding (I-D7) grouped 0–1 pairs at any threshold with real model-written phrasing, so it is only a last-resort fallback; the demo needs `AI_MODEL_EMBEDDING=gemini-embedding-2`.
- Models (all free tier, probed 2026-11-10): `gemini-3.5-flash` for vision; `gemini-3.5-flash-lite` for text, which has its own daily quota; `gemini-embedding-2`. `gemini-3.8-flash` and `gemini-3.7-flash` gave no valid answer within the 30-second limit, and `gemini-2.5-flash` was refused.
- For Hriday (Render): set `AI_PROVIDER=google`, the three model ids, `AI_EMBEDDING_PROVIDER=google`, `GOOGLE_GENERATIVE_AI_API_KEY` and `CLUSTER_SIMILARITY=0.85` on both the API and the worker.
- Contract change: none (environment only).

### I-D17 — One Buyer Signal per order, returned from storage after capture — 2026-11-10
- Section 10 says the signal is "computed per order at capture". `computeBuyerSignal(orderId)` (section 15) now returns the order's stored signal when one exists and computes and stores it only on first use. Hriday's merchant order detail calls this function on every read (his DECISIONS.md: "Ishaan … can supply its caching through that seam"); before this change each read inserted a new `buyer_signals` row, spent one model call and could show a band that drifted from the capture-time value.
- The `order.captured` handler and endpoint 9 use the same path, so a redelivered job stores nothing new. Concurrent first calls take a transaction-scoped advisory lock on the order (`pg_advisory_xact_lock`) and re-check before inserting, so exactly one row is written without a schema change.
- An order with no buyer cannot be stored (`buyer_signals.buyer_id` is required) and is scored on each call.
- Contract change: none (the function keeps its section 15 signature; behaviour now matches section 10).
