# H2 sandbox rehearsal: setup to evidence

This completes the local tooling around the source H2/F1 path. It does not close H2: real Neel/Maya accounts, human PayPal approval, account-backed SDK behavior and real response fixtures are still pending. H1 hosting is separately pending; H3–H8 remain unstarted. All work stays on Hriday.

## What is ready

| Command                                       | What it actually does                                                                              | Required input                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| pnpm setup:sandbox                            | Transactionally provisions only Neel and HD-IND-01 at USD38.00; encrypts the merchant secret       | Local sandbox app credentials and existing local database/key |
| pnpm test:sandbox                             | Read-only check of stored merchant credentials, hoodie and single catalogue currency               | Same local configuration                                      |
| pnpm test:sandbox serve                       | Starts the normal H2 API composition on loopback with /dev and opt-in sanitized response recording | Passing setup; free configured PORT                           |
| pnpm test:sandbox verify FAIRFOLD_ORDER_UUID  | Read-only database/ledger/recording audit of the specified source-merchant order                   | The UUID printed by the capture response                      |
| pnpm exec vitest run recorded-sandbox.test.ts | Replays sanitized observed responses through actual operation parsers without network calls        | Actual files from the recorded rehearsal                      |

`check` and setup print SKIPPED when both app credentials are absent; this is never acceptance. `serve`/`verify` exit 2 for that missing-account gate. Invalid configuration or a failed/blocked verification exits nonzero. A ready local preflight does not exercise OAuth. The actual credentials have not been used in this work.

## 1. Human account setup, when available

Use the account setup instructions in the [sandbox runbook](sandbox-spike.md) and [verified PayPal research](research.md). Create Neel's business sandbox account/app and Maya's separate personal sandbox buyer. Ensure the app credentials belong to the sandbox account; the code permits only https://api-m.sandbox.paypal.com and the sandbox browser SDK. A sandbox credential remains sensitive even though it cannot move live money.

Keep PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET only in ignored local .env or the process environment. Keep PAYPAL_BUYER_EMAIL local for operator reference. Enter Maya's password only in PayPal's own sandbox window. Do not place credentials in commands, screenshots, Git, browser source or chat. No account/password is generated or guessed by these tools.

Retain the existing APP_ENCRYPTION_KEY; losing/changing it prevents decryption of stored merchant credentials. Use DEMO_MODE=true, a loopback DATABASE_URL whose database name starts fairfold_, and the exact sandbox API origin. The setup/rehearsal tools deliberately reject a hosted database; ordinary Render deployment remains the existing Blueprint workflow.

## 2. Prepare the existing local database

Run these separately and inspect each result:

```powershell
pnpm setup:local
pnpm db:migrate
pnpm setup:sandbox
pnpm test:sandbox
```

setup:local preserves an existing .env. Fill only the required local fields privately before the remaining commands. Migrations use the configured database; inspect DATABASE_URL privately first. setup:sandbox then requires local/demo/sandbox guards before opening its database connection.

Setup uses the existing fixed merchant demo subject, slug neel-block-prints, domain neelblockprints.example and country IN. It creates only HD-IND-01, one block-print cotton hoodie, USD38.00 and initial listing version v1. It preserves compatible existing product IDs, listing content/version and encrypted credentials. Concurrent setup is serialized. Identity/client/secret/key/price/currency conflicts return SANDBOX_SETUP_CONFLICT without replacing data; inspect and resolve the intended configuration explicitly. This is not credential rotation or database reset.

No buyers, batches, seeded orders/disputes, simulated stores or inventory are created. The full source B17 world remains H8. Passing these checks does not satisfy the deferred sandbox dispute spike.

## 3. Run the real browser purchase

Stop a competing local API on the configured PORT, or choose a free local PORT in the ignored environment. Run:

```powershell
pnpm test:sandbox serve
```

Open the exact REHEARSAL_READY URL printed by the command. It uses localhost at that PORT, binds only loopback and configures the same-origin harness. The normal server and rehearsal share runtime composition, database credentials, checkout service, queue, auth, HTTP schemas and recovery behavior; only the recording sink is opt-in. Do not run pnpm dev simultaneously on the same port.

1. Select Load checkout. Confirm Neel and the configured USD currency; missing/ambiguous configuration must remain an error.
2. Select the eligible PayPal button. The server creates one hoodie using the database price. The SDK receives the actual PayPal order ID.
3. In PayPal's own sandbox window, sign in as Maya, inspect the merchant and USD38.00 total, and approve only the intended purchase. Eligibility, login, cookies/pop-ups and approval are real browser checks; a local VM result does not substitute for them.
4. Wait for the page's safe capture JSON. Retain its Fairfold UUID and PayPal ID locally. Confirm the displayed state is captured; cancellation, PENDING, a declined instrument or an error is not payment completion.
5. Leave the rehearsal server running until the callbacks finish. Stop it with Ctrl+C afterward. Do not publish raw network exports, SDK objects or PayPal responses.

## 4. Recover the same order before buying again

For an uncertain capture, use Check the approved capture again on the page. It reuses the same active PayPal order; the server reads its authoritative state before any capture POST and uses the stable ff-capture request ID. A committed local capture returns its current summary. A pending/declined or mismatched capture stays unsuccessful locally.

The page's recovery context does not survive reload. If lost, preserve the known IDs and inspect the existing local/PayPal order before a new purchase. The existing bodyless POST /api/checkout/orders/:paypalOrderId/capture is the same recovery API; use only the original approved ID. Do not create a fresh order as a generic retry. A vendor create followed by a failed local insert can leave no local order: O17 remains open to H3's future import/reconciliation, and this tool does not fabricate a repair.

If SANDBOX_RECORDING_FAILED appears, a payment may still have succeeded. Verify the original order before any further approval. GET recovery files stay labelled capture-get; they cannot prove an original POST response was recorded. Do not rename them to obtain a green fixture check.

## 5. Verify and retain reviewable evidence

Replace FAIRFOLD_ORDER_UUID below with the actual internal UUID from the safe capture JSON:

```powershell
pnpm test:sandbox verify FAIRFOLD_ORDER_UUID
pnpm exec vitest run recorded-sandbox.test.ts
```

The first command checks the source merchant/hoodie/amount, captured state and IDs, filled protection/account status, exactly one captured entry at ledger sequence 1, matching ledger IDs/details and the full hash chain. It is read-only and reports individual booleans. Missing vendor values remain failures; they are never backfilled as VERIFIED/ELIGIBLE. It also requires matching sanitized create and COMPLETED capture POST observations. It does not assert Maya identity or an actual SDK session.

Recordings live only under ignored .work/h2-sandbox/PAYPAL_ORDER_ID/. Each observation is a separate atomically finalized file. Bodies are sanitized in memory before serialization: required IDs, amount, protection/account state and source references remain; buyer ID/name/email and shipping values are synthetic replacements; other vendor fields and nonessential URL queries are excluded. OAuth/request headers and unsanitized bodies are never recorded. Replay rejects edited provenance, extra fields, unsafe URLs, wrong order folders and oversized files. Incomplete .tmp files are not fixtures.

Use the [evidence template](evidence/README.md) to write a sanitized review record with actual date, Hriday commit, local runtime, API route sequence, safe IDs, verifier/parser results and the observed SDK/Maya approval outcome. Files and their labels alone are not independent proof of an actual transaction. Review before committing any future real fixture; do not stage .work wholesale or copy raw payloads into an evidence document.

## Remaining human and integration gates

| Gate                       | Who/what is needed                                                                                                                   | Current observation                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Neel app and Maya account  | Account owner creates them and supplies credentials privately                                                                        | Absent/deferred; no actual OAuth/payment |
| SDK/Maya purchase          | Human approves in the real PayPal sandbox window and records the observed result                                                     | NOT RUN                                  |
| A4 and recorded parsing    | Run verifier and parser checks after the actual purchase                                                                             | NOT RUN / NOT RECORDED                   |
| Authenticated Maya history | Verify her actual payer identity and review the fixed demo buyer binding before using private history pages                          | NOT MAPPED                               |
| Shared intelligence        | Ishaan implements existing owned exports/handlers and reviews integration contracts                                                  | Current runtime explicitly stub          |
| H1 hosted verification     | Apply existing plans in the confirmed Render workspace after capacity/billing is resolved, or explicitly assign the prepared handoff | No Fairfold services/Postgres observed   |

Maya's PayPal identity comes from the actual capture, never the demo JWT role or email alone. The tool does not merge buyer rows, change order ownership or assert that an arbitrary account is Maya. If a first guest capture creates a different buyer UUID from the fixed demo subject, retain that real association and review the binding before buyer-history acceptance; do not reassign rows to make a demonstration pass.

The full H2 client, including webhook/dispute bindings, is now implemented; [local closeout](h2-closeout.md) is the current handoff. Subsequent H3/H4 consumers still require their retention and action-workflow reviews. No H3 implementation, product frontend, provider change or outbound Ishaan message is included. Local validation and its limits are recorded in the [rehearsal evidence](evidence/2026-11-09-h2-sandbox-rehearsal.md).
