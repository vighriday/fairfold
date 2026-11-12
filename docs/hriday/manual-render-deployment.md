# Fairfold manual Render deployment

12 November 2026. Current source: integrated `main` at `d23ee86adc2adfd4e38f3b001689327cde2791d6`. Target: the already-confirmed **My Workspace** (`tea-d246s0ali9vc73cdjmig`). The user requested manual deployment because Blueprint capacity remains blocked. This changes provisioning only: preserve D18's web service, background worker and PostgreSQL, with settings grounded in the existing root `render.yaml`.

## Exact billable resource plan — declined

**Current instruction:** the user selected **“Do not provision paid resources”** and **“Billing is still blocked.”** The plan below is retained as a review record, not authorization. Do not retry creation, change billing, or silently substitute a partial/free topology. CLI access remains authorized; paid provisioning does not.

| Resource          | Type and compute plan                                             | Storage                                           | Region | Published monthly base     |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ------ | -------------------------- |
| `fairfold-api`    | Node web service, `starter` / `0.5c-512mb`: 0.5 CPU, 512 MB       | Ephemeral runtime; evidence remains in PostgreSQL | Oregon | $7                         |
| `fairfold-worker` | Node background worker, `starter` / `0.5c-512mb`: 0.5 CPU, 512 MB | Ephemeral runtime                                 | Oregon | $7                         |
| `fairfold-db`     | PostgreSQL **16**, `0.1c-256mb`: 0.1 CPU, 256 MB                  | **1 GB**, no automatic growth                     | Oregon | $6 compute + $0.30 storage |

Estimated recurring base: **$20.30 USD/month**, prorated by Render, plus any separately billed usage, taxes and the one-off seed job. No workspace upgrade, replicas, high availability, persistent disk or additional service is proposed. These are the existing paid compute choices; the storage choice is made explicit for this manual creation. Current published [pricing](https://render.com/pricing) and [plan specifications](https://render.com/docs/compute-plans) were checked on this date. Actual billing remains Render's responsibility; this estimate is not a spending cap.

The API/site is publicly accessible over Render HTTPS. The worker has no incoming public endpoint. PostgreSQL uses only its same-workspace, same-region **internal** connection URL. Preserve the Blueprint's final empty external IP allow-list: no public database access. The CLI creation step uses a loopback-only external rule while the empty database is created, then immediately clears the list with `postgres update --clear-ip-allow-list`, before configuring any client or seeding data. Verify the resulting empty list rather than assuming it. Do not use an external connection string to work around private networking.

**Approval boundary:** automatic approval review rejected the first paid database creation request because the exact plan, cost, storage, region and networking need explicit approval. That request did not create a resource. Do not repeat a paid creation request until the user approves this plan. No card details or billing information will be entered by the agent.

**Account boundary:** after CLI authorization, `render blueprints validate render.yaml --output json` reached Render and returned `valid: false`, with **`need_payment_info` for `databases[0]`, `services[0]` and `services[1]`**. This is a live billing-prerequisite observation, separate from Blueprint capacity and local YAML/schema validity. The account owner needs to resolve payment setup privately in [Render billing](https://dashboard.render.com/billing), with My Workspace selected. Plan approval alone does not clear Render's billing requirement.

## Runtime configuration

Both code services use `https://github.com/vighriday/fairfold`, branch `main`, repository root, Node 22 and automatic deploys **off**. Build each with:

```sh
pnpm install --frozen-lockfile --prod=false && pnpm build
```

| Setting           | API/site                                                     | Worker                                                |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Start             | `pnpm --filter @fairfold/api start`                          | `pnpm --filter @fairfold/worker start`                |
| Pre-deploy        | `pnpm db:migrate`                                            | None; start only after API migrations                 |
| Health check      | `/healthz`                                                   | Observe handler/schedule startup and queue processing |
| Public origin     | `RENDER_EXTERNAL_URL`, through the existing runtime defaults | No public origin                                      |
| Database          | Internal URL for `fairfold`, user `fairfold`                 | Same internal URL                                     |
| Encryption        | Fresh 32-byte key in canonical base64                        | Exactly the same key                                  |
| Demo token secret | Fresh private random value, at least 32 characters           | Not required                                          |
| Demo auth         | `DEMO_MODE=true`, labelled synthetic data only               | Not required                                          |

Use private Render environment variables for credentials. Generate the app encryption key and demo token secret during deployment without printing, committing or logging them. Preserve the encryption key across later releases. Do not copy the developer's database URL or demo keys into the hosted app.

Preserve the current non-secret settings from `render.yaml`: `NODE_VERSION=22`, sandbox `PAYPAL_API_BASE`, Google provider/model candidate IDs, `CLUSTER_SIMILARITY=0.80`, horizon 14 days, minimum 3 complaints, minimum rate ratio 3 and maximum q 0.05. No PayPal credentials or model-provider keys were found in the local deployment environment. Do not create placeholders that masquerade as keys. Provider/vision/clustering work remains pending until the team privately configures and verifies access; runtime behavior without a provider remains honest.

The supported CLI creation command exposes pre-deploy and health-check settings but no `initialDeployHook` flag. Run **one observed `pnpm seed` job** against the healthy API's deployed build instead of attaching a seed command to every restart. The seed is idempotent, labels synthetic records and performs no PayPal operation. Observe the job's terminal success and database contents before declaring the hosted demo populated.

## Execution and verification order

1. Verify CLI identity and active workspace. Re-list services/databases and reconcile any existing Fairfold resource before creating one; never retry an uncertain creation blindly.
2. Create the exact database above, close its external allow-list and wait for availability. Keep credentials in memory/private provider configuration.
3. Create the API/site with its environment, migration release command and `/healthz`. Confirm the remote commit actually deployed; do not treat accepted creation as a live service.
4. Observe migration success, API readiness and the one-off synthetic seed job. Verify seed counts and labels through read-only checks.
5. Create the background worker on the same database, key and candidate provider configuration. Observe the real 16-handler/schedule startup record and queue behavior. Do not manufacture a PayPal job to test it.
6. Verify HTTPS `/`, every console route, selected-record refresh, `/docs`, `/docs/json` and database readiness. Test demo sign-in/read-only records and the actual authenticated MCP client without executing PayPal writes. Check browser errors and mobile layout.
7. Record real resource/deploy/job IDs, deployed hashes, observed URLs and outcomes. Keep real PayPal signature, checkout/dispute/action, provider/photo, Q2 and hosted A1–A14 gates separately pending where unobserved.

If Render rejects paid provisioning for missing billing information, stop paid creation and let the account owner resolve it privately. Do not switch to free services, combine the worker into the API, change hosting or remove functionality without authorization.

## Access observed in this attempt

- PASS: connector lists My Workspace; no Fairfold services and no PostgreSQL instances were present at discovery. Unrelated services were untouched.
- FAIL: the browser-control runtime exited before dashboard access; the Windows fallback also failed to initialize. No UI action was performed.
- PASS: Render CLI v2.36.0 supports direct web/worker/database creation, pre-deploy configuration, health paths and PostgreSQL allow-list clearing. The user completed its separate browser authorization; CLI identity and My Workspace were verified.
- BLOCKED: paid database creation was rejected by automatic approval review before execution. API/worker creation, database migration, seed job, deployment URLs and hosted verification are **NOT RUN**.
- BLOCKED: authenticated platform validation returned `need_payment_info` for all three planned resources. User billing setup is required.
- PASS: `pnpm docs:check`, local `pnpm build` (including typecheck and website build), and formatting. The deployment artifact remains ready; these checks do not establish hosted success.

This is a concrete deployment plan, not evidence of a deployment. No PayPal operation, outbound message, billing entry or hackathon submission was performed.

## Sponsor-credit option — not claimed or applied

The official [hackathon Render page](https://paypalaihackathon.devpost.com/details/render) links an offer for **$50 in Render credits** and its [claim portal](https://credits-portal-mmdm.onrender.com/claim/paypal-ai-hackathon). Availability, eligibility and any payment-method requirement have not been verified for this account. The portal returned no readable text to the browsing tool; no claim form or account action was submitted.

[Render's redemption instructions](https://render.com/docs/credits) say to select the intended workspace, open Billing and apply the promo code under Credit Balance. Credits are workspace-specific and apply at billing-period end; remaining charges can reach the workspace's payment method. They are not a spending cap, do not automatically change plans, and do not override the user's refusal of paid resources. The owner may investigate/redeem the offer privately; any later billable deployment requires fresh explicit authorization.

The current [free-tier reference](https://render.com/docs/free) includes web services and PostgreSQL, but no background-worker instance. It also excludes one-off jobs and shell access on free web services, and its free database expires after 30 days. A full architecture-preserving Render deployment is therefore blocked under the present no-paid instruction. No free preview, worker relocation, workflow replacement or host migration has been authorized or performed.
