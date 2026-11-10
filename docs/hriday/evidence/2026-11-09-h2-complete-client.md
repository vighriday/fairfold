# H2 complete-client validation

Observed 9 November 2026 IST on Hriday. This closes the ungated local implementation pass, not real H2 acceptance.

- PASS: 279 offline cases across 17 test files. The same run explicitly skipped 126 database cases and one real-record acceptance case; database tests were then separately observed below. Ignored JSON report: .work/h2-specs/h2-complete-tests.json.
- PASS: all 126 PostgreSQL/HTTP cases across 11 test files against the isolated local PostgreSQL 16 database.
- PASS: typecheck and lint after full-client/API composition. The webhook lint issue was corrected in its unpublished focused commit before this run.
- PASS: actual API startup on loopback3112 in both demo modes: database/queue readiness, H2/stub health, all seven OpenAPI routes, protected private401 and correct asset gating.
- PASS: actual test:sandbox serve CLI startup on loopback3113 using isolated synthetic credentials/catalogue; public config, /dev, health and private401. Its fixture/process were removed. No PayPal request or recording was made.
- SKIPPED: actual test:sandbox with missing credentials. No PayPal acceptance check passed.
- NOT RUN: real OAuth/A4/Maya purchase/recorded response fixtures, real dispute calls, signature verification or hosting.

Five new composition cases execute all 17 shared operations with synthetic HTTP, prove no eager vendor action, single token across groups, concurrent grant coalescing, merchant isolation, credential rotation/removal/simulation and invalid-ID/live-origin rejection. The factory satisfies ForMerchant at compile time without a cast; its private readCapture helper remains additional to the unchanged shared contract.

The API now injects createPayPalClientFactory. Existing checkout callers retain the source-compatible orders/readCapture projection, now delegated to that same composition. All prior real database capture/read/HTTP/privacy checks pass after the change. No new route, worker schedule, action approval path, raw-payload persistence or dependency was introduced.

The [local closeout](../h2-closeout.md) lists the concrete remaining human and joint-review steps. Q2's two return-address branches still fail precisely before OAuth, rather than inventing an address. Formal H2 remains IN PROGRESS; H3–H8 remain unstarted.
