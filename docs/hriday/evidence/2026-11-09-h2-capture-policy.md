# H2.3a approved capture minimization evidence

Date: 9 November 2026 IST. Branch: Hriday. Input: explicitly synthetic responses, not recorded sandbox fixtures.

Hriday approved the exact [capture policy](../capture-persistence-review.md) before implementation: “Use the proposed capture policy.” Original F1/section 12 and current unchanged schema/DTOs were reread. The mapper lives in the API application layer; all vendor HTTP calls remain in packages/paypal.

Implemented the approved NFC/trim/lowercase SHA-256 email rule and six-field canonical address hash, including address_line_2 directly from transient raw. Address whitespace collapses, country uppercases, other field case remains significant, and absent street means no address hash. The output includes only the allowlisted fields. Unknown names/protection/account status are not invented. The raw capture amount and identity/status must parse consistently before the mapper returns; the next transaction validates these against database-priced orders.

Observed checks:

- PASS: pnpm test — 150 offline tests, including 14 new mapper cases; 17 database cases explicitly skipped. These are synthetic parsing/privacy checks, not PayPal acceptance.
- PASS: pnpm typecheck and pnpm lint.
- PASS: focused Prettier formatting. Final repository format and local-link checks run before commit.
- PASS: pnpm install --offline --ignore-scripts linked the existing ledger workspace utility; no dependency versions changed. The API importer is the only lockfile change.

The 14 cases cover exact normalized hash input, excluded plaintext/vendor extras, address_line_2 and line-2-only addresses, case behavior, country/postal without street, unknown identity/protection, empty email/no mutation and seven invalid response variants with safe errors. No plaintext street/email escapes through the mapped result or its validation error.

Not implemented here: database writes, atomic concurrency/deduplication, checkout creation, public routes or /dev. Real sandbox accounts/A4/recorded fixtures and H1 Render hosting remain pending. Ishaan’s broader review is not claimed and Q3’s future payload allowlists remain open.
