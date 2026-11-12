<a id="top"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/fairfold-hero-dark.svg">
  <img src="docs/media/fairfold-hero-light.svg" alt="Fairfold. Proof before dispatch. Trust before payment. A neutral witness for both sides of a PayPal payment." width="1280" height="480">
</picture>

# Fairfold

**One side’s proof becomes the other side’s trust.**

Fairfold records packing proof, connects repeated complaints and prepares grounded dispute responses around a PayPal payment. Buyers and merchants see the context; **humans approve actions, and PayPal decides disputes.**

Built by **Hriday and Ishaan** for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). **[MIT](LICENSE)** · PayPal sandbox only.

**[Visual tour ↓](#see-the-website)** · **[PayPal + AI](#paypal-is-the-payment-layer)** · **[Run locally](#run-locally)** · **[Evidence](#evidence-you-can-inspect)**

> **Local build ready · external acceptance pending.** All screens use labelled synthetic data. Real PayPal, provider/photo and first-deployment acceptance remain pending. [Exact evidence →](docs/hriday/evidence/2026-11-12-website.md)

## See the website

[![Actual Fairfold Orders console beside its mobile Pack Station, framed as desktop and phone views. Local synthetic data; no PayPal transaction.](docs/media/product-overview.svg)](docs/media/captures/orders.png)

The existing components, fonts, colours and animations are preserved. Orders, packing state, ledger checks, disputes, shared causes and reports now come from the API. Click the image for the full-resolution console.

<details>
<summary><strong>Play the 19-second website tour</strong> · six actual local routes, no payment performed</summary>

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/console-tour-still.png">
  <img src="docs/media/console-tour.gif" alt="Captioned walkthrough of the actual local landing page, orders, packing, dispute records, empty Shared Cause state and Store Report. Synthetic records throughout." width="1024" height="780" loading="lazy">
</picture>

This is a captioned sequence of real screen captures, not a recorded sandbox transaction. Shared Cause stays empty without provider-backed embeddings. [Still frame](docs/media/console-tour-still.png) · [Captures and provenance](docs/media/README.md).

</details>

<details>
<summary><strong>Inspect a screen</strong> · full-resolution, without animation</summary>

| Screen                                                                                       | What to look for                                                        |
| :------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| [Landing](docs/media/captures/landing.png)                                                   | The two-sided proof and trust loop                                      |
| [Orders](docs/media/captures/orders.png)                                                     | Buyer Signal reasons, seller-protection fields, filters and alerts      |
| [Pack Station](docs/media/captures/pack.png) · [mobile](docs/media/captures/pack-mobile.png) | Required photos, actual server blockers, batch selection and the ledger |
| [Dispute Room](docs/media/captures/disputes.png)                                             | Retained dispute facts; this capture shows a seeded resolved dispute    |
| [Shared Cause](docs/media/captures/shared-cause.png)                                         | A truthful empty state when embeddings are missing                      |
| [Store Report](docs/media/captures/report.png)                                               | Computed fulfilment facts and retained reviews with merchant replies    |

</details>

## Follow one order

A small exporter ships a carefully packed order. A buyer receives a torn seam. PayPal sees a dispute. Fairfold connects what was packed, what was promised and whether other orders share the fault.

We build for small merchants, including Indian exporters selling to overseas PayPal buyers. The same record helps an honest merchant show what happened and helps an honest buyer receive a remedy when the evidence points to a real fault.

| Moment                     | Fairfold’s job                                                                                                               | Who stays in control                                                |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Before payment**         | A Store Report exposes fulfilment facts and verified-payment reviews. An AI shopper reads the same report through MCP.       | The buyer or supervising human chooses whether to pay.              |
| **Before dispatch**        | The Pack Station captures photos, checks them against ordered items, records batch codes and seals a SHA-256 evidence chain. | The merchant resolves blockers and explicitly seals.                |
| **When complaints repeat** | Shared Cause Detection tests for a common batch, courier, listing or packing context and proposes affected-order actions.    | The merchant reviews each hold, message, offer or refund.           |
| **When a dispute opens**   | Fairfold joins the PayPal capture to order proof and builds an evidence pack with a recommended response or remedy.          | The merchant approves the exact action; PayPal decides the dispute. |

<details>
<summary><strong>Unfold the B17 story</strong> · the intended climax, with evidence boundaries</summary>

Maya’s damaged hoodie could be an isolated incident. Similar seam complaints may instead implicate one production batch. Fairfold reads the complaints, then code checks exposure, alternatives and statistical strength before selecting affected orders.

If a stock inspection supports the hypothesis, the merchant can approve a remedy. The product is useful even when the correct response is to help the buyer rather than contest the claim.

The repository includes the labelled synthetic B17 world. Missing embeddings leave new complaints pending; they do not activate a substitute clustering algorithm or invent a hypothesis. A provider-backed scan, real inspection photos and Maya’s actual sandbox purchase/dispute still need separate acceptance. [Seed](apps/api/src/seed/world.ts) · [Shared Cause code](packages/intelligence/src/sharedCause) · [Acceptance plan](docs/hriday/validation.md).

</details>

## PayPal is the payment layer

The payment, capture, seller-protection context, tracking and dispute lifecycle belong to PayPal. Fairfold adds evidence and review around that lifecycle. There is no alternate payment provider and no change to Buyer Protection.

| PayPal surface                    | Where it matters in Fairfold                                                              | Inspect the implementation                                                                                          |
| :-------------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **JavaScript SDK v6 + Orders v2** | Human-approved checkout, create/capture and seller-protection context                     | [Harness](apps/api/src/dev) · [Orders](packages/paypal/src/orders.ts)                                               |
| **OAuth per merchant**            | Encrypted app secrets and scoped token caching                                            | [Credentials](packages/paypal/src/credentials.ts) · [Transport](packages/paypal/src/transport.ts)                   |
| **Webhooks**                      | Original bytes for verification, durable receipt, deduplication and reconciliation        | [Ingress](packages/paypal/src/event-ingress.ts) · [Verification](packages/paypal/src/webhooks.ts)                   |
| **Orders tracking**               | Sealing queues tracking; queued work is distinct from PayPal success                      | [Tracking](packages/paypal/src/tracking.ts) · [Execution](packages/paypal/src/tracking-execution.ts)                |
| **Customer Disputes v1**          | Re-fetch current state, review an exact pack, then provide evidence or an allowed remedy  | [Guards](packages/paypal/src/dispute-guards.ts) · [Execution](packages/paypal/src/dispute-execution.ts)             |
| **Payments v2 refunds**           | Approved remedies use capture-bound refunds and decimal-string money                      | [Payments](packages/paypal/src/payments.ts) · [Approved actions](packages/paypal/src/action-execution.ts)           |
| **Agent Toolkit + Fairfold MCP**  | A shopper reads trust information, asks its human, then uses sandbox create/capture tools | [Sandbox adapter](packages/paypal/src/shopper-toolkit.ts) · [MCP](apps/api/src/mcp) · [Shopper](apps/shopper-agent) |

The Toolkit adapter explicitly sets `context.sandbox = true`. All PayPal calls stay inside `packages/paypal`. The buyer opens a sandbox claim through PayPal’s own interface; Fairfold does not pretend a public dispute-creation endpoint exists. [Actual sandbox rehearsal →](docs/hriday/sandbox-rehearsal.md)

## AI describes. Code decides. Humans approve.

![Architecture illustration: payment context leads to shared evidence and a grounded draft. Motion stops at merchant approval; only an approved action proceeds to PayPal.](docs/media/approval-boundary.svg)

| Models see, read and draft                                                           | Deterministic code computes                                                                                                                       | People authorize                                                                 |
| :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------- |
| Visible photo features; complaint taxonomy; narratives; message drafts; explanations | Buyer points and reason codes; match decisions; grouping; exposure-adjusted tests and multiple-testing correction; recommendations and statistics | Evidence submissions, holds, messages, offers, refunds and the shopper’s payment |

Every model call goes through [`packages/ai`](packages/ai), built on the **Vercel AI SDK** for structured generation and embeddings. Third-party text is untrusted data, and outputs must match structured schemas. Extraction and drafting paths do not receive payment tools. Real buyer histories stay merchant-scoped; simulated network data is labelled. A new buyer with insufficient history gets **grey**, not a fraud verdict. [AI usage and measurement history](docs/ai-tools.md) · [Current decisions](DECISIONS.md).

<details>
<summary><strong>Inspect the last guard before a dispute action</strong></summary>

```mermaid
sequenceDiagram
    autonumber
    actor Merchant
    participant API
    participant DB as Postgres
    participant Worker
    participant PayPal
    Merchant->>API: Approve exact pack
    API->>DB: Approval + job in one transaction
    Worker->>DB: Claim approved work
    Worker->>PayPal: Fetch current dispute
    alt Still permitted
        Worker->>PayPal: Submit approved action
        PayPal-->>Worker: Observed response
        Worker->>DB: Record result
    else Stage changed
        Worker->>DB: Fail safely and rebuild
    end
    Note over Worker,PayPal: PayPal decides disputes.
```

Approval is a durable record, not a label attached to a research runbook. The worker rechecks stage and ownership before an external effect. Return-address remedies stay blocked pending Q2 review. [Approval API](apps/api/src/disputes/approve.ts) · [Execution guards](packages/paypal/src/dispute-execution.ts).

</details>

<details>
<summary><strong>Verify a proof specimen yourself</strong> · no database, model or PayPal needed</summary>

```sh
pnpm docs:check
```

This checks documentation assets and recomputes a [two-entry synthetic specimen](docs/media/proof-specimen.json) using Fairfold’s actual canonical JSON and SHA-256 functions. It changes one payload in memory and confirms that the chain no longer verifies.

```text
entry_hash = SHA256(previous_hash + canonical_JSON(entry_content))
```

This is a format demonstration, not stored order evidence. A chain exposes inconsistent stored bytes; it does not prove that a photographed item was honest, that payment occurred, or that a database operator never rewrote the entire chain. External anchoring is not implemented. [Hashing](packages/ledger/src/canonical.ts) · [Ledger](packages/ledger/src/ledger.ts).

</details>

## Architecture you can trace

```mermaid
flowchart TB
    subgraph Render[Render]
        direction TB
        Web[Website + Fastify API / REST / MCP]
        DB[(PostgreSQL 16 / records / evidence / pg-boss)]
        Worker[Background worker]
        Web <-->|Records and queue| DB
        DB <-->|Jobs and results| Worker
    end
    PayPal[PayPal sandbox]
    AI[packages/ai / structured model gateway]
    Models[Configured model providers]
    Web -->|packages/paypal| PayPal
    Worker -->|Approved work via packages/paypal| PayPal
    PayPal -->|Verified webhook ingress| Web
    Web --> AI
    Worker --> AI
    AI --> Models
```

One origin serves the website, REST/OpenAPI and MCP. One long-running worker handles queue jobs. PostgreSQL stores records, the pg-boss queue and content-addressed evidence. This is the intended topology, not a claim that Render resources are live.

<details>
<summary><strong>Find a package or contract</strong></summary>

| Path                                                                            | Responsibility                                             |
| :------------------------------------------------------------------------------ | :--------------------------------------------------------- |
| [`apps/web`](apps/web)                                                          | Supplied frontend, routing and API-backed interactions     |
| [`apps/api`](apps/api)                                                          | REST, auth, uploads, OpenAPI, webhooks and MCP             |
| [`apps/worker`](apps/worker)                                                    | Jobs, retention and watchdog schedules                     |
| [`apps/shopper-agent`](apps/shopper-agent)                                      | Shopping policy with human approval pauses                 |
| [`packages/contracts`](packages/contracts)                                      | Shared schemas, clocks and job contracts                   |
| [`packages/paypal`](packages/paypal)                                            | Sandbox payment boundary                                   |
| [`packages/ledger`](packages/ledger)                                            | Canonical hashes, evidence blobs and verification          |
| [`packages/ai`](packages/ai) · [`packages/intelligence`](packages/intelligence) | Model gateway; evidence, signals, reports and Shared Cause |
| [`render.yaml`](render.yaml)                                                    | API/site, worker and PostgreSQL Blueprint                  |

Run `/docs` for generated OpenAPI, `/healthz` for database readiness, and `/mcp` for authenticated agent tools.

</details>

## Run locally

**Prerequisites:** Node.js 22.16+, pnpm 12.4.2 and Docker Compose, or an existing PostgreSQL 16 instance.

```sh
git clone https://github.com/vighriday/fairfold.git
cd fairfold
pnpm install --frozen-lockfile
pnpm setup:local
docker compose up -d --wait
pnpm db:migrate
pnpm seed
pnpm dev
```

Open **[localhost:3000](http://localhost:3000)** → **[merchant console](http://localhost:3000/console/orders)**. Use your configured `PORT` if it differs. `setup:local` generates ignored `.env` keys and preserves an existing file. Inspect that file first: a pre-existing `DATABASE_URL` may point somewhere else.

With `DEMO_MODE=true`, the console obtains the seeded Neel token in memory. This is demo authentication. The catalogue, stored records, deterministic logic and fixture checks work without PayPal credentials. Model-dependent work stays pending without its provider. The seed performs no PayPal transaction.

<details>
<summary><strong>Connect models, sandbox checkout or the shopper</strong></summary>

1. **Models:** configure the existing gateway’s provider, model IDs and embedding provider privately in `.env`. Verify access and quota in your account. Keep `CLUSTER_SIMILARITY=0.80`. [Configuration](docs/hriday/website-deployment.md#local-run) · [Gateway](packages/ai).
2. **PayPal:** create Neel’s sandbox business app and Maya’s personal account, then follow [the rehearsal](docs/hriday/sandbox-rehearsal.md). `/dev` is the JavaScript SDK checkout harness. Never use live endpoints or commit credentials.
3. **Shopper:** configure model access, sandbox credentials and a private, short-lived `SHOPPER_AGENT_TOKEN`, then run:

   ```sh
   pnpm --filter shopper-agent start -- "navy hoodie under $45"
   ```

The shopper skips caution stores, asks before a non-verified store, and pauses separately for PayPal approval. Its transcript must come from an actual run; none is manufactured here.

</details>

## Evidence you can inspect

Recorded on **12 November 2026** for the website integration at `6e0268c`.[^checks]

| Verification                                   | Observed result                                                                             | Receipt                                                                                                                                   |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------- |
| Offline suite                                  | **657 passed**, 319 gated skips, 0 failed                                                   | [Website evidence](docs/hriday/evidence/2026-11-12-website.md)                                                                            |
| Separate PostgreSQL suite                      | **575 passed**, 0 failed                                                                    | [Scope and limits](docs/hriday/evidence/2026-11-12-website.md#observed-checks)                                                            |
| Focused website checks                         | **17 passed**                                                                               | [Routes/transport](apps/web/test/website.test.ts) · [Approvals](apps/web/test/actions.test.ts) · [Serving](apps/api/test/website.test.ts) |
| Actual API + official MCP client               | **Passed**, zero PayPal requests                                                            | [Executable smoke](scripts/test-e2e.ts)                                                                                                   |
| Chromium desktop + mobile                      | **12 page states passed**, plus history, reload, keyboard selection and review cancellation | [Browser observations](docs/hriday/evidence/2026-11-12-website.md)                                                                        |
| Typecheck, build, lint, format, frozen install | **Passed**                                                                                  | [Recorded commands](docs/hriday/evidence/2026-11-12-website.md)                                                                           |
| Actual PayPal / provider-photo / hosted A1–A14 | **Pending**                                                                                 | [Status](docs/hriday/status.md) · [Acceptance plan](docs/hriday/validation.md)                                                            |

<details>
<summary><strong>Run the checks</strong> · local logic and external acceptance are separate</summary>

```sh
pnpm docs:check
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:db
pnpm test:e2e
pnpm --filter @fairfold/intelligence eval
pnpm --filter shopper-agent start --check
```

`test:db` requires a separate loopback PostgreSQL database named `fairfold_*test` in `TEST_DATABASE_URL`; it may truncate that synthetic database. `test:e2e` uses that guarded database and the actual API/MCP client. Fixture tests establish local behavior, not successful sandbox payments, real signatures, vision quality or hosted operation. Earlier model measurements retain their original settings and limitations in [Ishaan’s write-up](docs/ai-tools.md).

</details>

## Deploy on Render

[`render.yaml`](render.yaml) retains **web service + worker + PostgreSQL 16**, all from `main`. The web service builds the site, applies migrations before startup and seeds the labelled world after its first deployment. Secrets stay private; site and API share the assigned origin.

**[Open the complete deployment guide →](docs/hriday/website-deployment.md#render-deployment)**

The current schema check passes. No Fairfold service or live URL is claimed. Render account/billing/secrets and actual deployment still need completion; CLI platform validation also needs its own login. No alternate hosting architecture is introduced.

<details>
<summary><strong>Submission readiness</strong> · remaining human steps</summary>

- [x] Combined `main`, the routed website and local verification.
- [x] Source, setup instructions, MIT licence and a PayPal/AI implementation map.
- [ ] Configure model access; evaluate provider-backed B17 and real photos.
- [ ] Complete Neel/Maya accounts, the spike, actual checkout/capture and verified sandbox webhook delivery.
- [ ] Observe exact human-approved PayPal outcomes; resolve Q2 return-address review.
- [ ] Deploy and observe Render; run hosted A1–A14 acceptance.
- [ ] Record the functioning project and add actual submission/video links.

The [submission requirements](https://paypalaihackathon.devpost.com/#requirements) call for an interactable build or complete setup instructions and a functioning demo video under three minutes. Screenshots and mockups support that explanation; they do not replace the working demo. Nothing has been submitted or uploaded on the team’s behalf.

</details>

## Built by two people, for both sides

**Hriday** — platform, PayPal integration, evidence ledger, workers, MCP/shopper, website integration and deployment preparation.

**Ishaan** — AI gateway, intelligence, Shared Cause Detection, reports/signals, fixtures and evaluation work.

The supplied frontend is preserved in [`standalone/`](standalone). [Media provenance](docs/media/README.md) explains every screenshot, animation and diagram.

**[MIT](LICENSE)** · [Changelog](CHANGELOG.md) · [Decisions](DECISIONS.md) · [Status](docs/hriday/status.md) · [Back to top ↑](#top)

[^checks]: Offline and database suites overlap; their counts are not additive. Screens show synthetic records. Local checks do not establish actual PayPal, model-photo or hosted acceptance.
