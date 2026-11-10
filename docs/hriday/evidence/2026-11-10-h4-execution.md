# H4 approved action execution evidence

Date: 10 November 2026 IST. Branch: `Hriday`.

- **PASS:** an approved pack is claimed before any vendor POST, with a deterministic request ID; a second delivery does not repeat the POST.
- **PASS:** fresh dispute state and response options are checked immediately before execution; stale state publishes `evidence.rebuild` and performs no action.
- **PASS:** stored evidence blobs are re-read by SHA-256 and MIME, and exact bytes are passed to the existing multipart PayPal binding.
- **PASS:** successful responses retain only operation/dispute/outcome/status fields; links and vendor response bodies are not persisted.
- **PASS:** definitive provider rejection marks the pack `failed` and requests a rebuild.
- **PASS:** uncertain network outcome remains `submitted` with `outcome_unknown`; no automatic replay is attempted.
- **PASS:** full PostgreSQL regression suite completed 186 tests; typecheck and targeted lint passed.

All fixtures and provider responses were synthetic. No PayPal action, evidence upload, offer, claim, refund or sandbox mutation was made. Real A12 remains **NOT RUN**.
