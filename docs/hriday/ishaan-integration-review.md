# Ishaan integration review — 11 November 2026

Target: `Hriday`. Candidate: `origin/ishaan` at `d6104af`. Existing H4 repairs remain committed separately. Ishaan's branch contains I1–I7, real route/worker composition, eval fixtures and a complete source B17 seed; it supersedes the separate uncommitted seed preparation in this audit.

**APPROVED, 11 November 2026:** Hriday selected “Integrate; authorize surgical fixes to preserve original rules” and separately “Approve the listed buyer-note extension.” Restore the original scoring/default threshold and retain unresolved source conflicts honestly. The scope permits necessary source-preserving corrections in Ishaan-owned files; it is not permission for broad redesign or actual PayPal actions.

## Approved integration boundaries

The supplied AGENTS.md requires preserving the architecture, keeps `packages/ai`, `packages/intelligence` and intelligence routes under Ishaan's ownership, and requires the other person's review for shared-contract changes. Ishaan himself marks I-D2 and I-D13 as needing Hriday's review. Technical integration and source-preserving fixes are prepared, but those explicit choices must not be inferred from a request to fix bugs.

| Item                                              | Original source                                                                                               | Candidate branch                                                                                                    | Proposed handling                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Buyer Signal I-D2                                 | Filed disputes +10 each including lost disputes; lost disputes additionally +15 each; refund-ratio reason +15 | Counts only non-lost disputes in the filed bucket; refund-ratio reason +10                                          | Restore original rules unless Hriday explicitly approves the amendment; do not tune a score to force Alex's desired band         |
| Alex history I-D5/I-D43                           | One earlier refund; source narrative and reason/points requirements conflict (existing Q9)                    | Two earlier refunded orders to trigger the >50% ratio                                                               | Preserve source and keep Q9 visible, or explicitly approve Ishaan's amended synthetic history together with scoring              |
| Embedding I-D7                                    | Provider-selected embeddings through packages/ai                                                              | Feature-hashed local fallback when no embedding model is configured                                                 | Keep any fallback explicitly labelled and unmeasured; do not activate it as the demonstrated provider embedding without approval |
| Threshold I-D16/I-D38                             | Default 0.80; 0.85 is a described fallback option                                                             | Render environment sets 0.85 after calibration on the evaluation set                                                | Keep original deployment default unless the calibrated setting is explicitly approved                                            |
| Integration surfaces I-D4/I-D10/I-D13/I-D34/I-D37 | Typed intelligence routes, existing JSON action payloads and shared database/queue                            | Adds intelligence schemas, retires stubs, binds runtime, carries message template/level and release rule IDs/reason | Review and integrate these functional seams; `ready` means implementation present, never successful provider/hosted acceptance   |

Source-preserving integration requires permission for surgical corrections inside Ishaan-owned files where a deviation cannot be fixed at Hriday's boundary. It does not authorize broad rewriting of his implementation. No merge to main, force push, outbound message or PayPal operation is proposed.

## Separate H4 text-retention decision

I-D40 identifies buyer notes that the original complaint intake needs but the approved H4 allowlist currently discards. Proposed extension: keep only these exact text leaves in the existing PayPal shape, after the same approved NFC/line-break/contact redaction and review-required failure boundary:

- `extensions.merchandize_dispute_properties.{product_details.description,service_details.description,service_details.note}` and the same leaves under `extensions.billing_dispute_properties.credit_not_processed`.
- `disputed_transactions[].items[]`: `notes` plus the three product/service leaves above.
- `supporting_info[].notes` and `evidences[].notes` only with `source = SUBMITTED_BY_BUYER`.
- `offer.history[].notes` only with `actor = BUYER`.

Existing strict message-role/timestamp rules remain unchanged. No unmarked message becomes a buyer message. No seller/arbiter notes, contact objects, attachments, arbitrary extensions or vendor URLs are added. Every text leaf has the same 2,000-character ceiling; every extra list is bounded at 100 entries, total extra text at 20,000 characters per snapshot; overflow or uncertain contacts fails the whole sync without partial persistence/jobs. No new table, shared field or job payload is introduced. The controlled-demo redaction limitations still apply.

Status: **APPROVED BY HRIDAY**, 11 November 2026. Apply this bounded extension alongside the original approved allowlist. This decision concerns local retention only; it does not approve any PayPal action.

## Verified ancestry

Fresh fetch confirms merge `3f8c436` has parents `c2221a3` and `762c497`: Ishaan already merged the published Hriday platform baseline. `origin/Hriday` is an ancestor of `origin/ishaan` (0 unique Hriday commits, 52 unique Ishaan commits at review). Integrate that existing history normally; preserve the newer focused Hriday repair commits. Do not recreate the existing intelligence or B17 world.
