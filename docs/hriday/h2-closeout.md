# H2 local closeout and remaining human work

Local H2 implementation is ready. Formal H2 acceptance remains IN PROGRESS because the source requires an actual sandbox A4 purchase, Maya using /dev and recorded real create/capture parser fixtures. No account-backed success has been observed. H1 hosting remains separate and pending; H3–H8 have not started.

## Delivered locally

The complete source PayPalClient/ForMerchant is implemented and used by API runtime: all 17 shared methods across orders, payments, disputes, webhooks, reporting and carriers. No casts, empty methods or throwing placeholder groups are used. Both REFUND_WITH_RETURN branches are precise Q2 validation failures because the existing shared input lacks the required address; this review-gated limitation is not hidden as a supported return workflow.

The same per-merchant transport/token cache serves every group. Lookup/decryption/version checks occur on each operation; concurrent grants coalesce, merchants remain isolated and credential rotation/removal/simulation invalidates use. All resource requests stay on the exact sandbox API origin. Non-idempotent dispute/registration mutations do not inherit blind 5xx/network retries. Raw webhook data stays unchanged through signature postback and is never trusted on a failure result.

The seven source HTTP endpoints, database-priced checkout, atomic capture/ledger/job writes, scoped order reads, unstyled client-ID-only /dev, minimal Neel setup, opt-in sanitized recording and read-only A4 verifier are already wired. The checkout compatibility factory projects from the full composition; it is no longer a separate incomplete client. No H3 event handler, poll, H4 action workflow or product frontend was added.

## Verified result

| Check                                            | Observation                                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Offline tests                                    | PASS: 279; real-record acceptance explicitly skipped                                                              |
| PostgreSQL/HTTP tests                            | PASS: 126, run separately against the isolated test database                                                      |
| Complete client                                  | PASS: all 17 shared operations exercised with synthetic HTTP; token concurrency/isolation/rotation/removal tested |
| Typecheck / lint / formatting                    | PASS                                                                                                              |
| Actual normal-server startup                     | PASS: database/queue readiness, seven OpenAPI routes, private401, /dev demo-on200 and demo-off404                 |
| Actual rehearsal CLI startup                     | PASS: isolated synthetic setup, public config, /dev, health and private401; its process/fixture removed           |
| Actual sandbox account check                     | SKIPPED: credentials absent; no acceptance passed                                                                 |
| Real OAuth, purchase, signature, uploads/actions | NOT RUN; no vendor action occurred                                                                                |
| Source/contracts/ownership                       | Original DOCX unchanged; shared DTO/schema and Ishaan-owned code unchanged                                        |

Detailed final evidence is in [complete-client validation](evidence/2026-11-09-h2-complete-client.md), with separate [read](evidence/2026-11-09-h2-dispute-reads.md), [action/upload](evidence/2026-11-09-h2-dispute-actions.md) and [webhook](evidence/2026-11-09-h2-webhook-client.md) records. Synthetic response statuses are logic fixtures, not observed PayPal outcomes.

## Hriday's remaining account and approval steps

1. Create Neel's sandbox business app and Maya's separate personal sandbox account. Put the app credentials privately in ignored local configuration, preserving APP_ENCRYPTION_KEY. Do not share credentials/passwords in chat or Git. Follow the existing [account/rehearsal guide](sandbox-rehearsal.md).
2. Run pnpm setup:sandbox and pnpm test:sandbox. They verify only local configuration/catalogue. Start pnpm test:sandbox serve and open the printed /dev URL. No payment begins automatically.
3. In PayPal's own sandbox window, confirm Maya, merchant and USD38.00 hoodie, then approve the intended purchase. Retain the safe Fairfold UUID/PayPal ID shown by capture. If uncertain, recover the same approved order; do not create a generic replacement payment.
4. Run pnpm test:sandbox verify FAIRFOLD_ORDER_UUID and pnpm exec vitest run recorded-sandbox.test.ts. Review the actual SDK/Maya outcome and the in-memory-sanitized files before recording a real PASS or publishing fixtures. Missing account/protection values remain failures, never defaulted as verified/eligible.

The tools for those steps are implemented. An account login, human payment approval and observed vendor response cannot be replaced by more synthetic local checks. Do not repeat local scaffolding while these gates remain unchanged.

## Joint review and deployment dependencies

| Dependency                   | Exact remaining decision/action                                                                                                                   | Effect                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Maya private-history binding | Verify the actual payer identity and agree the existing fixed demo-subject association; do not merge/reassign from email or role                  | Needed before demonstrating authenticated Maya history; guest /dev purchase has no guessed identity binding |
| Q2 return actions            | Hriday/Ishaan review an address-capable shared input and corresponding approved action parameters against the actual permitted PayPal options     | Required before either REFUND_WITH_RETURN branch can execute; no contract extension was implemented         |
| Q3/Q11                       | Review webhook/dispute retained fields and prove durable event/enqueue recovery                                                                   | H3/H4 persistence gate, outside H2 client bindings                                                          |
| Q5/Q12                       | Observe actual action behavior and enforce approval/stage/ownership/dedupe before side effects                                                    | H4 workflow gate; low-level bindings alone authorize no action                                              |
| Render                       | Resolve existing capacity/billing and apply the same reviewed API/worker/Postgres configuration, or explicitly assign the prepared Ishaan handoff | H1 hosted verification, independent of local H2 readiness                                                   |

No outbound handoff, Devpost submission, billing entry or hosting-plan change occurred. Current scope remains H2; subsequent work starts with the original H3 brief when authorized. See [current status](status.md) and [source execution plan](execution-plan.md).
