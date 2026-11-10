# Conditional H1 deployment handoff for Ishaan

Prepared on 9 November 2026 IST. This is ready if Hriday decides deployment should move to Ishaan. It has not been sent, accepted or assigned. Keep all source changes and deploys on `Hriday`.

## What is blocking hosting

Hriday reports exhausted Blueprint capacity and deleting one stale Blueprint. Recovery and any synchronization interval have not been independently observed. His supplied Dashboard screenshot separately says **Payment Information Required** for the Blueprint's paid services. Waiting for a quota change does not establish that billing is ready. Render's [free-plan documentation](https://render.com/docs/free) excludes background workers from free instance types; the fixed API/worker/Postgres architecture is retained.

Current account access works: Hriday confirmed My Workspace and [resource discovery](evidence/2026-11-09-render-workspace.md) found no Fairfold services or Postgres instances. This does not establish quota/billing recovery or rule out an unapplied Blueprint. The current Hriday runtime is H3; hosted foundation checks must use that current commit and phase.

If the Dashboard still blocks Hriday after his wait, an intended Ishaan workspace with repository access, available capacity and the required payment setup can apply the same published Blueprint. This handoff does not request card details in chat, authorize a purchase on another person's account or change the plans to bypass D18.

## Apply exactly the existing deployment

1. Open the [prepared Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/vighriday/fairfold) in the intended workspace. Name it `Fairfold`, use branch `Hriday`, path `render.yaml`, and no root-directory override. Record the selected workspace identity and actual Git commit before applying.
2. Review exactly `fairfold-api` (Node web, starter), `fairfold-worker` (Node worker, starter), and `fairfold-db` (Postgres 16, 0.1c-256mb), in one region. Review current billing and existing resource-name conflicts in that workspace. Use the current remote commit, not a copied stale YAML file.
3. Supply only APP_ENCRYPTION_KEY manually for H1. Generate the canonical-base64 32-byte key with the clipboard command in the [deployment guide](render-deployment.md), keep it private, and retain it across redeployments. The worker references this same API key through fromService/envVarKey; do not supply a different key to it. Render generates DEMO_TOKEN_SECRET and references the internal DATABASE_URL. Do not use Hriday's loopback database URL or add PayPal/model credentials for this H1 run.
4. The build is `pnpm install --frozen-lockfile --prod=false && pnpm build`; API pre-deploy is `pnpm db:migrate`. API and worker use their specified filtered start commands. Automatic deployment remains disabled. URL defaults use Render's assigned public API URL; explicit frontend origin is configured when Figma hosting exists.
5. Apply only in the intended workspace with its owner's authorized billing setup. Leave any conflict or payment failure visible; capture the non-sensitive error and stop that deployment attempt instead of changing architecture.

## Return evidence needed to close H1

Provide the actual public API URL, workspace/resource/deploy IDs, deployed commit, and sanitized runtime observations. Never return encryption keys, tokens, database connection strings, passwords or billing details.

| Check     | Required actual observation                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| API       | Build, pre-deploy migration and startup succeed; deploy is `live`                                                              |
| Readiness | `GET /healthz` returns database `ready`, phase `H3`, intelligence `stub` on the current branch                                 |
| Swagger   | `/docs/` loads and `/docs/json` includes demo login and all seven checkout/order routes plus `/webhooks/paypal/{merchantSlug}` |
| Worker    | Deploy succeeds; logs show `Worker ready`, `handlerCount: 2`, intelligence `stub`                                              |
| Identity  | API and worker both run the recorded `Hriday` commit and share the intended internal database                                  |

Hriday can independently verify the public HTTP endpoints from the URL. A green API does not prove worker readiness. Record successful hosted observations in a new dated evidence file and update the H1 status only after every check passes. H2's real checkout and PayPal dispute checks are separate and remain unverified.

The local contract/intelligence handoff is already in [H1 foundation](h1-foundation.md) and [contracts inventory](contracts-handoff.md). Local H2 transport work does not require Ishaan to implement PayPal or alter his intelligence ownership.
