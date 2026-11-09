# H2 sanitized response recording evidence

Observed 9 November 2026 IST on Hriday. The original H2 recorded-response requirement and the approved capture fixture boundary govern this work.

- PASS: eleven package tests cover allowlisted create/capture/GET records, synthetic replacement of buyer/shipping data, URL query stripping, missing-data preservation, provenance/timestamp validation and recording failures that do not change successful payment semantics.
- PASS: six file-boundary tests cover separate atomic records, incomplete-file exclusion, unsanitized input rejection, order-folder mismatch and oversized records. Synthetic file tests use their own ignored test directories and remove them.
- PASS: complete offline suite **201 cases**; typecheck and lint.
- SKIPPED: actual recorded-sandbox parser acceptance, because no real response records exist. The test has no synthetic fallback. Database cases are separately run with test:db.
- NOT RUN: real create/capture response observation, real A4 or Maya SDK purchase.

The optional recorder receives only an in-memory sanitized record after a successful operation parser. OAuth bodies are never observable through this hook. Create retains the selected actual relation/method and a sandbox checkout URL stripped to its matching order token. Capture keeps required IDs, amount, protection/account status and source reference metadata; buyer identity/name/email and all selected shipping values become explicit synthetic values. Other vendor fields are excluded.

Writing/sanitization failure reports a fixed symbolic diagnostic and preserves the successful vendor result. It never causes an application capture replay. Captured GET observations are labelled capture-get and cannot substitute for the required original capture POST fixture. Normal server execution has no recording sink; the opt-in rehearsal uses ignored .work/h2-sandbox. Files are untrusted inputs on replay and must pass the strict sanitizer-envelope check again.

Provenance records what this recorder observed; a JSON label alone cannot independently prove authenticity. Review the actual account-backed run alongside the files before publishing evidence. No real response file was manufactured or committed in this increment.
