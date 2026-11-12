# Integrated website and Render handoff

12 November 2026. Work on `main`, which includes both reviewed histories. The user's latest instruction supersedes earlier Hriday-only and frontend ownership restrictions. Preserve D1–D18, the canonical REST contracts and all approval/privacy gates.

## What runs

The supplied `standalone/` designs are unchanged reference files. `apps/web` builds their HTML, CSS, embedded fonts, canvas animations and template runtime into ignored `apps/web/dist`. Navigation, displayed facts and event handlers are connected to the real API. The simulated console script is not included in the website build. Functional camera/review dialogs reuse the existing card/button styling; no new design system or framework is introduced.

One Fastify service serves the website and API on the same origin. No separate frontend host or CORS proxy is needed. The existing Render worker and PostgreSQL remain separate services. `pnpm build` typechecks and builds browser assets; `pnpm dev` builds them before starting API/worker. Re-run `pnpm build:web` and restart the API after editing the frontend, because public files are cached in process. Tests build assets before exercising the runtime.

| URL                                                            | Purpose                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/`                                                            | Landing page; existing console calls to action open the site                  |
| `/console/orders`                                              | Merchant orders, filters, selected buyer signal and alerts                    |
| `/console/orders/<UUID>`                                       | Deep link to an actual order's details                                        |
| `/console/pack/<UUID>`                                         | Packing photos, batch selection, server attestation/blockers, ledger and seal |
| `/console/disputes` or `/console/disputes/<PayPal-dispute-ID>` | Dispute records, evidence drafts and exact approval review                    |
| `/console/shared-causes` or `/console/shared-causes/<UUID>`    | Observed hypothesis, statistics, proposed actions and stock inspection        |
| `/console/store-report`                                        | Actual report, retained reviews/replies and comparison bands                  |
| `/dev`                                                         | Existing unstyled real PayPal sandbox checkout harness                        |
| `/docs`, `/docs/json`                                          | Generated API contracts                                                       |
| `/mcp`                                                         | Existing authenticated MCP integration                                        |
| `/healthz`                                                     | Database readiness                                                            |

Bare Pack/Dispute/Shared Cause routes choose an available record. Row selections and record-specific calls to action use real IDs in their URLs, not shortened display IDs. Browser back/forward and server refresh are supported. Invalid API paths remain JSON errors; static serving never exposes repository files. Public site files have a separate rate-limit exemption; API and upload limits remain active.

## Local run

Follow the root README: Node 22.16+, pnpm 12.4.2, PostgreSQL 16, `pnpm install --frozen-lockfile`, `pnpm setup:local`, `docker compose up -d`, `pnpm db:migrate`, `pnpm seed`, `pnpm dev`. Existing PostgreSQL is supported by the same `DATABASE_URL`. Open the root URL using your configured `PORT` (default 3000). This workspace's private `.env` currently selects 3110 and a separate `fairfold_demo` database; do not copy its secrets or connection string into docs.

`DEMO_MODE=true` enables the source's one-click, seeded Neel role login. The console requests a short-lived bearer token and keeps it in memory only. Turning demo mode off disables this login and displays the access failure honestly; this is not production authentication. Do not use real buyer data in the public demo.

Missing provider configuration does not create fake shared causes, images or signature results. The seed remains synthetic; real orders come only from actual sandbox checkout. A provider-backed scan is needed to produce the normal B17 hypothesis. Configure models through the existing `packages/ai` gateway, preserving the 0.80 threshold, then rerun the normal seed/scan workflow and real-photo evaluations.

## Render deployment

Use the confirmed **My Workspace** and the root `render.yaml` on **main**. [Open Render Blueprint setup](https://dashboard.render.com/select-repo?type=blueprint&repo=https%3A%2F%2Fgithub.com%2Fvighriday%2Ffairfold). Do not deploy the standalone directory as a static site: it is the original visual reference with fixed example data.

The Blueprint retains the existing paid API/worker plans and PostgreSQL 16 plan; there is no hosting change. Inspect the displayed costs and resolve the earlier billing/capacity gate in your own Render account. No card details have been entered and no Fairfold resources were found in the workspace during this audit.

1. Select repo `vighriday/fairfold`, branch `main`, root `render.yaml`. Keep automatic deploys off until the real acceptance run is complete.
2. Supply `APP_ENCRYPTION_KEY` privately as 32 random bytes encoded as base64. Keep it stable across deployments; worker receives the same value. Supply `GOOGLE_GENERATIVE_AI_API_KEY` privately and verify access to the candidate models in the Blueprint. Do not invent credentials or paste them into Git/chat. `DEMO_TOKEN_SECRET` is generated by Render.
3. Build command is `pnpm install --frozen-lockfile --prod=false && pnpm build`; the API pre-deploy command applies database migrations. The API's first-deploy hook runs `pnpm seed` to populate the labelled synthetic world. Inspect the hook's outcome; a healthy empty API alone does not prove a successful seed. The idempotent seed can also be rerun in the API service shell.
4. Wait for the API, worker and database to be ready. The worker must start after migrations are available; if its first startup races the API migration, retry its deployment after the API is ready. Confirm its 16-handler/schedule startup record. Do not mark H1 complete from a local schema check.
5. `APP_BASE_URL` and `FRONTEND_ORIGIN` default to the API's `RENDER_EXTERNAL_URL`; keep the website on that origin. Visit `/`, all five console routes and a selected-record deep link, refresh it, then check `/docs` and `/healthz`.
6. If the Blueprint already existed, `initialDeployHook` does not reseed every deployment. Run the normal `pnpm seed` once in its API shell if needed. Never reset a populated database to refresh demo data.

Current validation: current official Render JSON Schema passes. CLI validation was attempted with the confirmed workspace ID but the CLI requires its own `render login`; connector login does not establish CLI authentication. Platform validation and an actual deployment are still unverified. See [Render's Blueprint specification](https://render.com/docs/blueprint-spec) for field behavior.

## Interaction boundaries and remaining human work

- **Packing:** capture through the in-app camera on HTTPS or localhost; confirm every item's actual batch. The server stores hashes/timestamps and queues the Evidence Agent. A capture click never creates a local attestation. Review blockers and any permitted explicit override. Sealing collects actual carrier/tracking/packer values and queues tracking; it is not proof that PayPal accepted tracking.
- **Disputes:** build a draft, review the exact persisted pack and available PDF, select a currently allowed remedy and decimal amount when required, then explicitly approve. Approved/submitted packs are not automatically resubmitted. Q2 return-address operations remain blocked before OAuth.
- **Shared causes:** review each proposed action and its actual payload; buyer-message approval includes the actual drafts. Approve an inspection rule before capturing stock units. The server counts completed attestations; session upload counters are not defect evidence. Confirm/dismiss separately, with a reason for dismissal. Each resulting action still requires approval.
- **Failures:** an unknown POST outcome is not retried automatically. Refresh and reconcile before retrying. Visible API errors, absent hypotheses and pending provider results remain honest. Alert acknowledgement sends no buyer message.
- **External acceptance:** the team still owns Render billing/access/secrets and hosted observation; model access plus real camera/photo evaluation; Neel/Maya sandbox accounts, the pre-H1 spike, purchase/capture, real verified webhooks, actual dispute fixtures/current allowed actions, exact human-approved outcomes and shopper transcript; Q2/joint review and hosted A1–A14; final demo/submission recording. These are not completed by synthetic tests. The frontend wiring itself no longer waits on Figma or Vercel.

Use the [sandbox rehearsal](sandbox-rehearsal.md), [existing backend closeout](local-closeout.md), [status](status.md) and the new [website evidence](evidence/2026-11-12-website.md). No outbound message or submission is authorized by this guide.
