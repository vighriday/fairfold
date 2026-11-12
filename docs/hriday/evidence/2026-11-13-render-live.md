# Fairfold first live Render deployment

**PASS — hosting and synthetic read-only smoke.** Recorded 13 November 2026 IST (12 November UTC). This supersedes the earlier billing blockage in [the manual attempt record](2026-11-12-render-manual.md), without erasing that history. Real PayPal, model/photo and complete A1–A14 acceptance remain pending.

## Authority and source

The user approved the exact billable [manual plan](../manual-render-deployment.md), including possible charges beyond credits, and subsequently reported **“added card.”** No payment information was entered by the agent. My Workspace (`tea-d246s0ali9vc73cdjmig`) was confirmed before each creation. Architecture sections 5 D18, 14 and 16 H1/H8 remain the source: web service, separate worker and PostgreSQL 16. Manual provisioning supersedes only the capacity-blocked Blueprint creation route.

Deployed repository: `https://github.com/vighriday/fairfold`, branch **main**, commit **`d23ee86adc2adfd4e38f3b001689327cde2791d6`**. At deployment, the local commits ahead of this source changed documentation only. Render CLI **2.36.0** and the connected Render tools were used. The earlier current-schema/local checks remain dated to their own runs; they are not reclassified as cloud acceptance.

## Actual resources

| Resource          | Actual ID / endpoint                                                          | Observed configuration                                                                                   |
| ----------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| API and website   | `srv-dbr099on74is73b3i420`; [live website](https://fairfold-api.onrender.com) | Node 22, Starter, Oregon, one instance, main, automatic deploy off; `/healthz`; migrations before deploy |
| Background worker | `srv-dbr0c2m7bikc73c2vgkg`                                                    | Node 22, Starter, Oregon, main, automatic deploy off; no public endpoint                                 |
| PostgreSQL        | `dpg-dbr08m59fdbs73du07p0-a`                                                  | Version 16, `0.1c-256mb`, 1 GB, Oregon, available; external allow-list `[]`, growth off, no HA/replicas  |

Both services built with `pnpm install --frozen-lockfile --prod=false && pnpm build`. The API starts with `pnpm --filter @fairfold/api start`, runs `pnpm db:migrate` before deployment and serves the website, REST/OpenAPI and MCP on the same HTTPS origin. The worker starts with `pnpm --filter @fairfold/worker start` after migrations and seed readiness.

The empty database was created with a restrictive loopback-only external rule; that list was immediately cleared and verified before client configuration or data insertion. Both processes received the same internal database URL and freshly generated 32-byte encryption key. The API received a separate fresh demo-signing secret and `DEMO_MODE=true`. Secrets were held in deployment-process memory and private Render variables; no value is retained in this record or a committed file. Preserve the encryption key on future releases.

Sandbox PayPal base URL, candidate model IDs and the exact source thresholds (including cosine **0.80**) are configured. No PayPal or model-provider credentials were supplied. `/healthz` reporting `intelligence: ready` describes runtime composition; it does **not** establish provider/model access.

## Deployment and seed receipts

| Step                  | Actual receipt (UTC)                                                         | Result                                                      |
| --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| API initial deploy    | `dep-dbr09a8n74is73b3i4q0`; started 18:25:45, finished 18:27:25              | **live** at the stated commit                               |
| Database migrations   | API pre-deploy log, 18:26:39                                                 | `Fairfold database migrations applied.`                     |
| Synthetic seed job    | `job-dbr0b5ek1f9s73atv5mg`; `pnpm seed`; started 18:29:41, finished 18:31:08 | CLI terminal status **succeeded**                           |
| Worker initial deploy | `dep-dbr0c2u7bikc73c2vhng`; started 18:31:39, finished 18:32:34              | **live** at the same commit                                 |
| Worker startup        | 18:32:50                                                                     | `Worker ready`, `handlerCount: 16`, `scheduledMerchants: 0` |

Seed summary: **344 Neel orders, 24 Indigo orders, 25 QuickTees orders**, **16 complaints**, **85 reviews**, store bands **verified / verified / caution**, `hypothesis: null`, `paypalRequests: 0`, `realSandboxIds: false`. Missing embeddings/text models were reported as `NOT_CONFIGURED` / `model_not_configured`; no substitute hypothesis was fabricated. No Maya purchase was seeded. The zero merchant-poll count is expected without configured sandbox merchant credentials.

The one-off seed job replaces only the Blueprint first-deploy hook unavailable in direct service creation. It is not attached to every restart. Do not reset the hosted database to refresh the demo.

## Hosted acceptance observed

Read-only HTTP/MCP smoke started at **18:34:20 UTC / 00:04:20 IST**. Isolated headless Chrome checks started at **18:34:38 UTC / 00:04:38 IST**, at **1440 × 1000** and **390 × 1000**. Only demo sign-in and read-only API/MCP calls were sent; the seal review was opened and cancelled without submission.

| Check                                  | Observed result                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS `/healthz`                       | **PASS**, HTTP 200, `status: ok`, `database: ready`, phase H8                                                                            |
| `/docs` and `/docs/json`               | **PASS**; 49 documented paths, including health/demo/MCP                                                                                 |
| Demo merchant records                  | **PASS**; 344 unique orders across real pagination, one seeded resolved dispute, no hypothesis initially                                 |
| Unauthenticated MCP                    | **PASS**, HTTP 401                                                                                                                       |
| Official authenticated MCP client      | **PASS** initialization, tool listing, agent-scope exclusion of merchant evidence, `search_catalog` call; two seeded navy-hoodie results |
| Landing and five console pages         | **PASS** at both widths; API-bound views, no horizontal overflow                                                                         |
| Selected order and packing deep links  | **PASS**, direct HTTPS HTML and browser selection/refresh                                                                                |
| Browser history and keyboard selection | **PASS**, back/forward and Enter selection                                                                                               |
| Mobile controls                        | **PASS**, active tab visibility and activity-dock folding                                                                                |
| Human approval boundary                | **PASS** for review-dialog cancellation only; no seal or external action executed                                                        |
| Browser/API failures in this run       | **0** JavaScript exceptions; **0** failed API responses                                                                                  |
| Verification PayPal requests           | **0**; no real sandbox effect claimed                                                                                                    |

Sanitized machine summaries and screenshots are in ignored `.work/render-live-api.json` and `.work/render-browser/`. Published hosted captures have separate provenance in `docs/media/render/`. Local Windows tools briefly could not start a second process while the credential-holding PTY was active; normal execution resumed after resources were configured and that controller exited. This was a verification-tool limitation, not a service failure.

A read-only hosted MCP database query was refused because external connections are blocked. The allow-list was **not** opened to accommodate it. Database readiness, migration success, seed receipts and scoped API records supply the observations above; direct SQL table/queue inspection is not claimed.

## Remaining acceptance and operations

- H1's **first hosted deployment, health and Swagger gates are satisfied**. The original local foundation checks retain their earlier evidence. No message was sent to Ishaan; CP0/pre-H1 real sandbox evidence remains unverified.
- H2–H5/H7 require actual sandbox accounts, provider/photo work where applicable, real checkout/capture, signature/delivery/redelivery, dispute fixtures, current allowed actions and exact human-approved PayPal outcomes. Q2 remains open.
- Worker startup is verified. Periodic watchdog/retention/shared-cause execution and credential-backed poll behavior need operational observation; startup alone is not H6 acceptance. Full hosted **A1–A14 remains pending**.
- Set provider and merchant secrets privately through the documented gateways/setup. Preserve the existing key and synthetic labels. Never paste secrets in README/chat or treat demo authentication as production access control.
- Plans remain the approved approximately **$20.30/month base**, plus usage/taxes/one-off job; credits are not a spend cap. Automatic deploys and database growth are off. No other workspace resources were modified.
- No outbound message, real PayPal action, Devpost/YouTube submission or judging outcome occurred. Reviewer: user review pending.
