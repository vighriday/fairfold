# First H1 Render deployment

The source-prescribed deployment is one Blueprint containing the API, worker and PostgreSQL 16. Use the published `Hriday` branch. H1 remains IN PROGRESS until the actual hosted checks below pass.

The user's latest Dashboard screenshot shows **Payment Information Required** for these paid services. They also report deleting a stale Blueprint; any quota reset or synchronization delay is unverified. Recheck capacity once in the Dashboard after the user's wait, but do not assume it removes the separate billing gate. If deployment moves to Ishaan's workspace, use the [conditional handoff](ishaan-deployment-handoff.md). No service plans or architecture have been changed.

Render account access is now confirmed in Hriday's explicitly selected **My Workspace**. [Read-only discovery](evidence/2026-11-09-render-workspace.md) found no Fairfold services and no Postgres instances. Blueprint capacity and billing readiness were not verified by those reads; an unapplied Blueprint may still exist. Check the Dashboard for that existing Blueprint before creating another.

## Open the prepared Blueprint

[Open Fairfold's Blueprint in Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/vighriday/fairfold).

The repository's default branch was independently verified as `Hriday`; both service definitions also explicitly select `Hriday`. In the creation form, use the intended personal/default workspace, name the Blueprint `Fairfold`, choose branch **Hriday** and retain the root Blueprint path **render.yaml**. The monorepo's root directory stays empty.

Review the preview before applying. It must contain these three intended resources, in the same region:

| Resource        | Type and current configuration                                   |
| --------------- | ---------------------------------------------------------------- |
| fairfold-api    | Node web service; starter; `/healthz`; migrations before start   |
| fairfold-worker | Node background worker; starter; pg-boss using the same database |
| fairfold-db     | PostgreSQL 16; 0.1c-256mb; external IP allowlist empty           |

These are the blueprint's existing paid plans; use the Dashboard's current billing preview. Resource names can match existing resources, so confirm the preview targets the intended Fairfold resources. No resources have been created by this work yet.

## Supply the one manual secret

For **APP_ENCRYPTION_KEY**, generate 32 random bytes as base64. On this Windows machine, this PowerShell command copies a new key directly to the clipboard without displaying it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | Set-Clipboard
```

Paste into Render's APP_ENCRYPTION_KEY field. Keep it private and retain that value across redeployments: it encrypts merchant credentials when H2 is connected. Render generates DEMO_TOKEN_SECRET and supplies the internal DATABASE_URL from the Blueprint. Do not paste a local DATABASE_URL or any PayPal/model credentials for H1.

The first hosted API URL is assigned by Render. With the URL variables omitted, the API now derives APP_BASE_URL from `RENDER_EXTERNAL_URL` and uses that same origin for FRONTEND_ORIGIN. Explicit values remain supported and take precedence. Once a separate Figma frontend exists, set FRONTEND_ORIGIN to its real URL. Local `.env` setup is unchanged. The source environment-variable names and CORS boundary are preserved.

## Apply and verify

Apply only the reviewed existing Blueprint when the account gate is resolved; see [Render Blueprints](https://render.com/docs/infrastructure-as-code). Connected account tools can now inspect resources and plan/apply a Blueprint; the Dashboard remains available for private manual values and billing. No application was attempted during this read-only recheck. Do not enter card details or change plans. If a future tool requires approval of a newly reviewed infrastructure plan, show that concrete plan before its application.

After applying, retain the actual service URLs, resource/deploy IDs and deployed Git commit. Check:

1. API build, `pnpm db:migrate` pre-deploy and start all succeed. The service reaches `live`.
2. Actual API URL plus `/healthz` returns database `ready`, phase `H2` and intelligence `stub` for the current branch. Earlier H1-only commits reported phase H1; do not deploy a stale commit just to match that historical label.
3. `/docs/` loads Swagger; `/docs/json` contains demo login and the seven current H2 checkout/order endpoints. The Figma product frontend remains unimplemented; absent PayPal credentials do not authorize a dummy successful checkout.
4. Worker deploy succeeds and runtime logs say `Worker ready`, `handlerCount: 0`, intelligence `stub`. No real intelligence job result is claimed.
5. Record the deployed commit and actual observations in a new dated evidence record, then update H1's status. A queued deploy or green API alone does not prove the worker is ready.

The public API URL can be supplied back in chat for HTTP verification; no credentials or secret values are needed. Full sandbox checks remain deferred until the accounts exist.

## Validation state

The revised Blueprint previously passed Render's official JSON Schema. Render CLI 2.36.0 was downloaded to ignored workspace tooling and its archive digest was verified against GitHub's release-asset digest. That earlier CLI validation had no selected workspace; CLI authentication has not been claimed. The connected account tools now have the user's confirmed request-scoped workspace. A current Dashboard/tool plan must still validate the actual intended infrastructure before application. No hosted build, health or worker readiness has been verified.

References: [Blueprint specification](https://render.com/docs/blueprint-spec), [default environment variables](https://render.com/docs/environment-variables), [deployment lifecycle](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks).
