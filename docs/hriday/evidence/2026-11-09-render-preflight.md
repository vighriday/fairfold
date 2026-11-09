# H1 Render deployment preflight

Date: 9 November 2026 IST. Branch: `Hriday`. Application commit checked: `746b2d2`. Source: architecture section 16 H1, with the fixed deployment arrangement in section 14 and D18.

The user explicitly selected connecting Render and completing H1's deployment. Hosting has not been deferred, and H2 remains unstarted. This record covers account-independent checks; it is not evidence of a hosted deployment.

## Actual observations

| Check                                     | Result                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Internal source integrity                 | PASS; both original DOCX SHA-256 digests still match the source contract                                         |
| `pnpm build`                              | PASS; runs the workspace type check                                                                              |
| Blueprint validation                      | PASS against Render's current official JSON Schema, draft 2020-12                                                |
| Deployment source                         | Both services use `vighriday/fairfold`, branch `Hriday`, automatic deployment off                                |
| Database declaration                      | PostgreSQL 16; existing blueprint's paid small compute plan; external database IP allowlist empty                |
| Render-mode API startup                   | PASS locally with `RENDER=true` and injected `PORT=3111`                                                         |
| Runtime HTTP checks                       | PASS; database-ready `/healthz` via loopback and a non-loopback interface, Swagger UI HTML and generated OpenAPI |
| Render-mode worker startup                | PASS locally; pg-boss ready, zero intelligence handlers explicitly labelled stub                                 |
| Temporary process cleanup                 | PASS; the preflight API and worker were stopped after checking                                                   |
| Hosted resources, URL and deployed commit | PENDING; no hosted service/database or deployment has been created                                               |

The vendor schema was downloaded from [Render's official schema endpoint](https://render.com/schema/render.yaml.json). Its observed SHA-256 was `8a3fb8da6b4f55fe686fbefa790e011d3dd7895f013f355953c572a21ab6494a`. Validation used the already installed JSON Schema/YAML tools; no application dependency or configuration was changed.

The native runtime exposes Node and pnpm, and the existing package manifest pins pnpm 12.4.2. The current `starter` service plan name remains a supported legacy identifier for the same compute allocation. Sources: [native runtime tools](https://render.com/docs/native-runtimes), [compute plans](https://render.com/docs/compute-plans), [package-manager pinning](https://render.com/articles/pinning-nodejs-python-ruby-versions).

The first local smoke harness's Windows TCP-listener query returned no matching listener despite successful HTTP responses. The harness was corrected to check actual HTTP access through both loopback and a non-loopback interface. The corrected API and worker checks passed. This required no application change. [Render's Fastify guide](https://render.com/docs/deploy-node-fastify-app) requires binding to `0.0.0.0`; the existing server already selects that host in its Render environment.

## Remaining deployment gate

At this preflight, Render was available to add but was not confirmed installed or connected. The user has been prompted to finish installation/sign-in and identify the workspace/project. No credential values were requested, read from a cloud account or included in this record.

After access exists, inspect the actual workspace/resources, connect the published `Hriday` source, supply the deployment environment values through Render, deploy the prescribed API/worker/Postgres arrangement and verify hosted `/healthz`, `/docs/`, OpenAPI and worker readiness. Record actual resource IDs, deployed commit and URLs before marking H1 complete. Local startup and schema validation do not satisfy that gate.

The real PayPal spike remains deferred because its accounts do not exist. No PayPal call, model evaluation or external deployment is claimed. Ignored `.work/h1-deploy-preflight/` contains the downloaded schema and local inspection logs; none is staged.

## Subsequent installation verification

On 9 November 2026 IST, the user reported “Render added and signed in.” A fresh plugin-status check independently confirmed `installed=true`. The available tool inventory still contained no Render deployment/workspace commands, so the user's cloud account, workspace and existing resources could not be inspected. Installation is confirmed; account-resource access is unverified.

Browser fallback initialization failed with `windows sandbox failed: helper_unknown_error: setup refresh had errors`. The native fallback likewise reported that its trusted Node process exited unexpectedly. Neither fallback reached the Render dashboard. The Render CLI was not installed and no Render-named environment variables were present; no credential values were printed or requested. No cloud mutation was attempted.

The user subsequently selected Render explicitly and its deployment skills became available. Account-management commands still were not exposed. The multi-service deployment therefore follows the skill's initial Dashboard Blueprint flow; installation and app selection must not be repeated. This is an access/capability limitation, not evidence of a hosted deployment or permission to begin H2 before H1's required verification.
