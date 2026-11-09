# Fairfold validation and evidence plan

The source definition of done is A1–A14 against the deployed Render build and PayPal sandbox. H1 now has passing local unit and PostgreSQL 16 integration checks, recorded in the [H1 evidence report](evidence/2026-11-09-h1-local.md). The full deployed acceptance suite and AI evaluations remain NOT RUN. A written procedure is not a passing test.

## Test layers and recording

| Layer                 | Future command or method                   | Evidence required                                                      |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Offline unit/contract | `pnpm test`, no network                    | Command, commit, runtime, test counts and failures                     |
| Static types          | `pnpm typecheck`                           | Exit code and affected workspace packages                              |
| Database/integration  | PostgreSQL 16 test instance and migrations | Schema version, transactional/concurrency checks and clean isolation   |
| PayPal sandbox        | `pnpm test:sandbox`                        | Real linked sandbox IDs and sanitized request/response results         |
| A1–A8 automation      | `pnpm test:e2e` as specified               | Per-test results; external prerequisites stated                        |
| A9–A14 manual         | Deployed browser/API/agent script          | Operator, deployed commit, actual observations and sanitized artifacts |
| Intelligence eval     | `pnpm --filter intelligence eval`          | Ishaan's fixture version, provider/model and measured results          |

Credential-aware skips must say SKIPPED, never PASS. An offline mock does not satisfy A4/A9/A10/A12/A13. A manual check labelled automated in the source remains automation work until implemented. Keep test data separate from the recording world, and reset only the designated disposable test database.

## Source acceptance matrix

| ID  | Owner | Procedure and required result                                                                                                                                            | Status                                                       |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| A1  | I     | Seed then fetch shared causes for Neel: one possible/strong B17 hypothesis and 18 unshipped orders                                                                       | NOT RUN                                                      |
| A2  | I     | Equal-exposure fixture: RR = 30; p within 1% of 0.000129; q within 1% of 0.00154 with exactly 12 testable values                                                         | NOT RUN                                                      |
| A3  | I     | Null fixture: no hypothesis                                                                                                                                              | NOT RUN                                                      |
| A4  | H     | Create/approve/capture a real sandbox order: captured row with capture ID, seller protection and payer status; ledger seq 1 captured                                     | NOT RUN                                                      |
| A5  | H     | Redeliver the same verified webhook twice: one paypal_events row and one logical handler execution                                                                       | NOT RUN                                                      |
| A6  | Both  | Upload packing photos, await real attestation, seal: photo/attestation/sealed/tracking_pushed ledger entries and verified=true                                           | NOT RUN                                                      |
| A7  | H     | Tamper with one payload in disposable SQL data: ledger verifies false with first broken seq                                                                              | H1 library case PASS; GET endpoint and Render checks pending |
| A8  | I     | All 30 buyer fixture bands match, including grey new buyers                                                                                                              | NOT RUN                                                      |
| A9  | Both  | Maya's real sandbox dispute maps to the order, creates one complaint, and pack says inspect_first while B17 is open                                                      | NOT RUN                                                      |
| A10 | Both  | Attest defective seam inspection, confirm, rebuild and approve supported offer; PayPal accepts. Record source-defined accept-claim alternative if case stage requires it | NOT RUN                                                      |
| A11 | Both  | Approve hold of the 18 orders; held seal fails ORDER_HELD and an unheld B17 order without required clean seam inspection fails INSPECTION_REQUIRED                       | NOT RUN                                                      |
| A12 | Both  | Item Not Received case with delivered scan: PROOF_OF_FULFILLMENT carrier/tracking evidence is actually accepted by provide-evidence                                      | NOT RUN                                                      |
| A13 | H     | Shopper prompt for navy hoodie under $45: report tool called, QuickTees skipped, Neel sandbox order created, human approval pause, capture                               | NOT RUN                                                      |
| A14 | I     | Neel/Indigo/QuickTees report bands verified/verified/caution; every theme cites its reviews                                                                              | NOT RUN                                                      |

In A12, “INR” means **Item Not Received**, not Indian rupees. Do not build a domestic INR-currency payment to satisfy this test.

## Manual run order and observations

1. Record the deployed commit and service health. Confirm API/worker/database refer to the same build and DEMO_MODE is intentional. Use fresh demo-role tokens without including them in artifacts.
2. Run the seed in the intended demo database. Observe A1 and A14 before the live checkout. Capture counts and bands, not just screenshots of labels.
3. Run the checkout/capture and packing path, A4/A6. Use Maya for the live transaction and Alex R. only for the returning-buyer signal shot. Capture actual tracking response and tracker ID after the asynchronous push.
4. Add the explicitly simulated delivered scan. Open the real sandbox not-as-described dispute as Maya. Observe webhook or polling ingestion and A9; do not paste a manually fabricated webhook into the verified-event path.
5. Upload the deliberate seam close-up, await its inspection attestation, and confirm the hypothesis. Record inspected/defective counts from attestations. Verify A10 with the actual allowed action, merchant approval and PayPal response.
6. Approve the proposed hold/inspection actions. Verify A11 on the 18 remaining unshipped orders and a separate unheld B17 test order. Preserve failed seal responses and prove no stock decrement/shipment/ledger seal occurred.
7. Test A12 on a separate delivered-tracking sandbox transaction/dispute. Do not reuse the case closed by A10. Its evidence must use that case's shipment and disputes-carrier mapping.
8. Run A13 and keep its sanitized transcript. Recheck A14 and buyer rights with the current seed/outcomes. The agent's captured order must appear through the real webhook/import path.
9. Exercise A7 only in isolated test data, never the recording order. Re-run the relevant verifier after deliberate tampering and retain the first broken sequence result.

Source A9 inspect-first assumes response due is more than 48 hours away. If the actual sandbox deadline is shorter, the fixed decision table yields merchant_decides. Record that external condition and review the rehearsal fixture; do not change the decision table or fake a deadline.

## B17 fixture and live seed must remain distinct

| Quantity                 | Deterministic numerical fixture  | Seed and live demo                                                                    |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------- |
| B17 delivered population | 40 orders, each 14 days exposure | 39 seeded deliveries; Maya becomes the 40th after simulated delivery                  |
| Rest population          | 200, each 14 days exposure       | Earlier batches need delivery dates in the specified population window                |
| B17 seam complaints      | 6                                | 5 before checkout/dispute, then the live sixth                                        |
| Rest seam complaints     | 1                                | One B15 complaint                                                                     |
| Testable values          | Exactly 12                       | Derived from actual seeded dimensions; verify, do not force by omission               |
| Rate ratio               | Exactly 30                       | About 31 after live case; source test range 28–34                                     |
| p/q                      | About 0.000129 / 0.00154         | Seed before live case about 0.0006 / 0.007; not the equal-exposure fixture            |
| Unshipped hoodie orders  | Not the statistical assertion    | 18 before live checkout; temporarily 19 after capture; back to 18 once Maya is sealed |
| B17 stock                | Not the statistical assertion    | 64 received = 39 delivered + 4 in transit + 21 in stock before live seal              |

Also seed 80 delivered T-shirt orders; 60 verified Neel reviews averaging about 4.4; 25 QuickTees reviews including four unanswered never-arrived complaints; 30 buyer eval profiles; 10 labelled simulated network records; a four-day tracking gap; and the two packing stations/listing v1. The original section 19 governs all details. Fictional Indigo/QuickTees are simulated stores; only Neel uses the real sandbox app.

Every seeded sealed order needs the derived shipment, match attestation with model='seed' and ledger history specified in section 19. Such seeded attestations are not measured vision results. Keep seam complaint records and disputes separate so the Store Report dispute denominator stays honest. A1/A2/A14 must all pass in the same consistent world.

## Platform checks required by the design

H1 verifies recursive key sorting, no-whitespace canonical JSON, 64-zero genesis hash, exact UTC millisecond timestamps, serialized concurrent appends, tamper detection, image dedupe and PDF byte identity. The verifier checks the complete chain; the database owner could rewrite a chain, so describe this as tamper evidence without external anchoring.

H2 checks server-derived order totals, decimal-string handling, capture response parsing, repeated capture safety, merchant credential separation, expiry handling and error redaction. Record an absent optional account-status field honestly rather than inventing VERIFIED.

H3 checks signature failure/simulator behavior, duplicate ingestion, queued-handler recovery after a crash, unknown toolkit order import, cursor pagination, poll/webhook convergence, and no processing of unverified events.

H4 checks exact multipart structure/limits, action availability, approval ownership, inspect-first rejection, explicit merchant choice, stale-stage rebuild, 422 alerting and duplicate submission. No fake success on a PayPal timeout.

H5 checks all five seal blockers, limited overrides, stale/missing inspection results, stock locking and repeat seals, queue-after-transaction behavior, failed tracking pushes, action ownership, repeated refund jobs and shared-blob retention. Ledger and database writes must agree after failures.

H6 checks 72-hour and 48-hour boundaries with a fixed clock, open-alert dedupe, simulated scan ordering, and disabled demo routes. H7 checks merchant-only evidence tooling, private proof ownership, an orders-only toolkit allowlist, caution policy and the human approval stop.

Across tasks, verify merchant A cannot see merchant B's data and buyer A cannot read buyer B's order/signal/messages. Models and logs must not receive raw emails/street addresses or secrets. Shared-cause suspicion is merchant context, never submitted as an established defect in an individual case's evidence.

These checks protect specified behavior. They are not instructions to create a redundant test for every implementation line.

## Intelligence evaluation handoff

Ishaan owns the runner, fixtures and results. Hriday supplies stable storage/order interfaces and publishes only the actual returned table in the README.

| Set                                       | Source target                                                         | Measured result |
| ----------------------------------------- | --------------------------------------------------------------------- | --------------- |
| 20 packing sets, 5 deliberate mismatches  | At least 18/20 handled correctly, batch labels read in at least 16/20 | NOT RUN         |
| 24 complaint texts, 3 clusters plus noise | Pairwise precision at least 0.85                                      | NOT RUN         |
| B17 scenario                              | Correct batch hypothesis, strong in the specified seed                | NOT RUN         |
| Null scenario                             | No hypothesis                                                         | NOT RUN         |
| 8 dispute cases                           | 8/8 recommendations match the fixed decision table                    | NOT RUN         |
| 30 buyer profiles                         | 30/30 bands match                                                     | NOT RUN         |

Record model/provider, input version, retries/fallbacks, cost/latency source and sample size. A small fixture result does not establish field accuracy, avoided fraud or dispute win rate. Do not fill bracketed submission metrics with targets.
