# H1 first-deployment URL bootstrap verification

Date: 9 November 2026 IST. Branch: `Hriday`. Change: H1 API configuration and Blueprint startup defaults. Architecture decisions D1–D18, shared contracts, resource types and task order are unchanged.

## Behavior checked

Render assigns the initial web-service URL during creation. The API now uses the documented `RENDER_EXTERNAL_URL` only when `RENDER=true` and APP_BASE_URL is omitted. The initial FRONTEND_ORIGIN defaults to that app URL. Explicit URL variables still take precedence, including rejecting an explicitly empty APP_BASE_URL. Outside Render, both configured URLs remain required. The Figma frontend will supply its own explicit origin later.

The Blueprint no longer asks the user to guess the two URL fields before creating the API. Its only manual `sync: false` value is the source-required 32-byte base64 APP_ENCRYPTION_KEY. DATABASE_URL remains a database reference and DEMO_TOKEN_SECRET remains platform-generated.

## Actual checks

| Check                           | Result                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                     | PASS; 19 offline tests, 15 database tests explicitly skipped                                                                                           |
| New configuration cases         | PASS; assigned URL fallback, explicit overrides, local requirements and missing/malformed/empty URL handling                                           |
| `pnpm typecheck`                | PASS                                                                                                                                                   |
| `pnpm lint`                     | PASS                                                                                                                                                   |
| `pnpm format:check`             | PASS; all matched files use Prettier style                                                                                                             |
| Local documentation links       | PASS; 36 local links across 20 Markdown files                                                                                                          |
| Render JSON Schema validation   | PASS for the revised Blueprint; same official schema digest recorded in the preflight                                                                  |
| Actual local HTTP smoke         | PASS; URL variables omitted, assigned Render URL used, database ready, Swagger returns 200, configured origin allowed and unrelated origin not allowed |
| Smoke process cleanup           | PASS; API and pool closed after the run                                                                                                                |
| Workspace-aware CLI validation  | BLOCKED before validation; no selected/default workspace                                                                                               |
| Hosted deploy and H1 completion | PENDING; no service, worker or database has been created by this work                                                                                  |

The 15 PostgreSQL library integration tests previously passed on PostgreSQL 16.15. They were not rerun for this URL-configuration change; schema, ledger, storage and queue code were not changed. The HTTP smoke used the existing isolated development connection only for a readiness query. No PayPal/model call occurred.

## CLI and capability observations

Official Render CLI **2.36.0** was installed only under ignored `.work/render-cli-2.36.0/`; no global installation or system configuration changed. The Windows archive's SHA-256, verified against the official GitHub release-asset digest, was `233177194854ed1aa5baa0bfbda208e9a8b05d892eda8b6540ecc406f8a5a956`.

`render --version` succeeded. `render blueprints validate render.yaml --output json` exited before validating with: `no workspace specified and no default workspace set`. Its temporary CLI configuration directory was isolated under `.work/`. No account identity, workspace ID or resource conflict result was invented. The Render plugin's skills are available; account-management tools remain absent from this conversation. The initial Dashboard preview still needs to validate against the intended workspace before Apply.

The remote's default branch was independently observed as `refs/heads/Hriday`; both service definitions explicitly select that branch. The [deployment guide](../render-deployment.md) contains the prepared Blueprint link, single-secret setup and hosted acceptance checks. The user-facing final handoff must identify that Apply remains a Dashboard step; local validation does not complete H1.
