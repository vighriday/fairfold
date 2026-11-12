# Connect the existing PayPal sandbox app to hosted Fairfold

13 November 2026 IST. The user showed one Business and one Personal sandbox account and supplied the three expected fields privately in ignored `.env`. The app credentials have **not** been authenticated yet. The Business app receives test payments; the Personal account approves them in PayPal's own window. Neel/Maya remain the existing demo roles; the user cancelled the proposed name removal. No renaming or data migration is required.

## Existing target and boundaries

Use My Workspace, API `srv-dbr099on74is73b3i420`, private PostgreSQL `dpg-dbr08m59fdbs73du07p0-a`, branch `main` and origin `https://fairfold-api.onrender.com`. Preserve the current database, stored records, encryption key and separate worker. No public credential-entry endpoint is added.

The separate `setup:sandbox:render` command accepts only this explicit Render service/repository/main branch, sandbox API, demo mode and exact internal database host/user/name. External database URLs, previews, unrelated services, malformed keys and incomplete app credentials are refused before opening a database connection. The original local `setup:sandbox` and recording/rehearsal guards remain unchanged.

The command reuses the already-tested `provisionSandboxCheckout` transaction: it locks and validates the existing source merchant/product, encrypts the app secret with the existing key, preserves compatible listings and refuses credential/identity conflicts. It never resets/seeds orders, rotates keys, maps a buyer, registers a webhook or calls PayPal.

## Operator commands

These commands run **inside the reviewed API service context**, with its internal `DATABASE_URL` and existing `APP_ENCRYPTION_KEY`:

```sh
# Read-only stored-credential/catalogue comparison; requires private setup inputs.
pnpm setup:sandbox:render check

# Explicit bounded database write; no PayPal call.
pnpm setup:sandbox:render apply --confirm-service srv-dbr099on74is73b3i420
```

Successful apply prints `RENDER_SETUP_READY`, boolean checks and non-secret IDs only. `check` prints `RENDER_SETUP_PENDING` and exits 2 when the stored configuration is not ready. Invalid context/inputs/conflicts print only a symbolic error and exit 1. Neither result establishes actual OAuth, checkout or sandbox acceptance.

## Credential activation sequence — explicit PayPal authorization pending

Automatic approval review rejected an OAuth/read-only webhook-list verification because current `AGENTS.md` prohibits actual PayPal actions. No request ran. Finish/review/deploy the code first, then obtain authorization for this precise next sequence:

1. Read the local app ID/secret into process memory without printing them. Through `packages/paypal`, perform sandbox OAuth and read-only app/dispute capability checks. Keep tokens, vendor responses and the buyer email out of logs and commits. Stop on authentication/permission failure rather than claiming setup is complete.
2. Confirm the intended service/workspace, deployed source and private database. Save only `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` temporarily on the API using individual-key Render updates; preserve every other variable. Do **not** upload the entire local `.env`, copy its local database/key or transfer the buyer email.
3. Without deploying those temporary variables to the running API, create one one-off API job running the explicit `apply` command above. Render jobs snapshot the base service's current configuration and most recent successful build. Observe terminal success and boolean readiness; a queued job is not a connected merchant.
4. Remove only the temporary input keys after the job, restoring any pre-existing configuration instead of deleting someone else's values. The runtime uses encrypted per-merchant database credentials, so the worker needs no copied PayPal environment secret. Preserve the shared encryption key. Connection activates the existing read-only merchant reconciliation polling; it does not approve a financial/dispute action.
5. If authorized, run the existing registration script in the API context: `pnpm exec tsx scripts/register-webhook.ts neel-block-prints`. It registers the seven source events at `https://fairfold-api.onrender.com/webhooks/paypal/neel-block-prints` and saves the actual ID for signature verification. Reconcile an uncertain result in PayPal before retrying; never invent an ID or skip verification.

Render references checked for this plan: [private environment variables](https://render.com/docs/configure-environment-variables), [one-off job snapshots](https://render.com/docs/one-off-jobs), [individual-key update](https://api-docs.render.com/reference/update-env-var) and [individual-key deletion](https://api-docs.render.com/reference/delete-env-var). Whole-list replacement is intentionally avoided.

## After connection: the human test

Open [the hosted checkout harness](https://fairfold-api.onrender.com/dev). The configured Business app supplies the PayPal button. The buyer signs into the separate Personal sandbox account **in PayPal's window**, reviews the order and approves the intended test payment. The local email field is only an operator reference; it never authenticates a buyer or maps their identity.

Then verify the actual capture, IDs, ledger and signed webhook delivery; open the test dispute manually from the buyer's sandbox account and inspect the actual allowed responses. Tracking, evidence, messages, offers and refunds retain their exact human approvals. Q2 return-address operations remain blocked. Provider/photo and full hosted A1–A14 acceptance are separate.

Until authorization and actual observations exist, credential transfer/apply, OAuth, webhook registration and real purchase/capture remain **NOT RUN**. An account screenshot and field-presence check establish prerequisites only.
