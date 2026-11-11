# Local acceptance run for the intelligence tests (A1, A2, A3, A8, A14)

Run on 11 November 2026 IST at commit `2594b02` (`ishaan` branch, after M14), on a local machine. **This is local evidence only.** Section 20 requires A1–A14 to pass against the deployed Render instance with the sandbox; no Render deployment exists yet, so none of these is a formal acceptance pass.

## Setup

- PostgreSQL 16 in Docker (`fairfold-ishaan-pg`), a fresh scratch database `fairfold_local_acceptance`: `pnpm db:migrate`, then `pnpm seed`.
- Model settings were cleared for the run (`AI_PROVIDER` and the key empty), so every model step used its fixed fallback and no free-tier quota was spent. The figures below therefore come from code only; review themes need a model and were absent.
- The API was Hriday's own runtime (`apps/api/src/server.ts` → `createRuntime`) on port 3199; checks were plain HTTP requests with a demo merchant token. The scratch database was dropped afterwards.

## Results

| Test | Source wording                                                                                                                               | Observed locally                                                                                                                                                                                                                                                                         | Local result                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| A1   | `pnpm seed` then `GET /api/shared-causes?merchantId=<neel>`: one possible or strong hypothesis, batch_code = B17, 18 unshipped orders listed | 200; one open hypothesis "Possible shared product issue: batch B17", `batch_code = B17`, **strong**, `unshippedCount` 18; detail: 5 of 39 orders, rate ratio 25.6, p 0.00060, q 0.0072; proposals hold_orders, add_inspection_rule, send_buyer_messages                                  | PASS (local)                           |
| A2   | Shared-cause fixture: rate ratio 30, p within 1% of 0.000129, q within 1% of 0.00154, 12 values                                              | eval row: batch_code = B17, strong, RR 30, p 0.000129, q 0.00154, 12 values tested                                                                                                                                                                                                       | PASS (local)                           |
| A3   | Null fixture: no hypothesis                                                                                                                  | eval row: no hypothesis raised                                                                                                                                                                                                                                                           | PASS (local)                           |
| A8   | Buyer signal for the 30 eval profiles: all bands as expected, grey for new buyers                                                            | eval row: 30 of 30 bands as expected                                                                                                                                                                                                                                                     | PASS (local)                           |
| A14  | Store report for Neel, Indigo and QuickTees: verified, verified, caution; every review theme links to its reviews                            | 200 ×3; bands **verified, verified, caution** (Neel 324 sealed in 90 days, tracking 100%; Indigo 24, 100%; QuickTees 25 sealed, tracking within 72 h 0%, 4 unanswered not-received complaints). No themes, because no model was configured, so the theme-citation half was not exercised | PASS for bands (local); themes NOT RUN |

Also observed: Alex R.'s order signal is **yellow** with `NEW_ADDRESS`, `OWN_DISPUTES_LOST`, `OWN_REFUND_RATIO` (and `PAYER_VERIFIED`); `GET /api/catalog?q=navy hoodie&maxPrice=45` returns Neel's `HD-IND-01` at 38.00 (verified) and QuickTees' `QT-HD-01` at 29.00 (caution), the choice A13's shopper makes.

## Not covered here

- Running the same checks on Render (no deployment yet), and with a model key (review themes for A14).
- A9–A11 (intelligence parts of joint tests): they need a real sandbox dispute and inspection photos.
