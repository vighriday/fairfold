# Q3/Q4 — H4 dispute and action policy proposal

Status: **APPROVED BY HRIDAY**, 10 November 2026 IST. Hriday explicitly replied “Approve the H4 policy and mapping” to this concrete proposal. This authorizes local H4 implementation under the boundary below, not an actual PayPal action. Ishaan's joint review has not been received; Q2 return-address branches remain blocked without changing shared inputs.

Source authority: original architecture sections 3, 7, F4, 10–12 and H4; source `disputes`, `evidence_packs`, ledger and job contracts are unchanged. Current official [Disputes 1.11 schema](https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/customer_disputes_v1.json) confirms the fields below. No actual dispute/spike fixture exists yet.

## Structured dispute retention

| Destination                      | Proposed retained fields                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `disputes` columns      | ID, receiving merchant UUID, matching merchant-owned order UUID or null, reason/status/lifecycle symbols, decimal amount/currency, seller response due UTC time, outcome symbol, first observed resolution UTC time and injected-clock updated time            |
| `disputes.raw`                   | `dispute_id`, `create_time`, `update_time`, `reason`, `status`, `dispute_life_cycle_stage`, `dispute_channel`, `dispute_amount {currency_code,value}`, seller/buyer response due dates and `dispute_outcome {outcome_code,amount_refunded}`                    |
| Transaction linkage in `raw`     | `disputed_transactions[]` with `seller_transaction_id` only, for exact capture-to-order mapping inside the receiving merchant; no buyer/seller contact objects                                                                                                 |
| Response options in `raw`        | `allowed_response_options.make_offer.offer_types[]` and `accept_claim.accept_claim_types[]`, preserving documented symbol lists. Unknown option fields are discarded; action execution always re-fetches authoritative details                                 |
| Requested evidence in `raw`      | `evidences[]` with `evidence_type`, `source`, optional UTC `date` and `item_id` only; discard vendor evidence_info, notes, documents, URLs and files                                                                                                           |
| Messages in `raw`                | `messages[]` containing only `posted_by`, UTC `time_posted` and the contact-redacted `content` described below; no attachments/document URLs                                                                                                                   |
| Private dedupe metadata in `raw` | A reserved `_fairfold` object containing SHA-256 fingerprints of already-observed sanitized messages. It contains no raw text/contact value. This avoids resending old buyer messages after an overlapping poll or a temporarily shorter provider message list |
| Jobs                             | Existing `dispute.synced {disputeId,isNew,newBuyerMessages[]}` with only newly observed redacted BUYER text; existing evidence/report jobs keep their exact identifiers-only payloads                                                                          |

Validate mandatory ID/reason/status and one consistent merchant/capture association. Do not guess an order from email, buyer name or a foreign merchant's capture. Preserve null order linkage when an otherwise valid dispute has no local order; ambiguous/foreign mappings fail visibly. Symbolic fields use bounded ASCII enums/patterns, money follows the existing schema, and dates normalize to UTC. First observed resolution uses the injected clock; do not label it as a provider-supplied resolution timestamp.

Original section 3 also prescribes `invoice_number` → the receiving merchant's existing `orders.invoice_id` as a fallback when no capture match exists. Read that value transiently for exact matching; no extra vendor invoice field needs to be retained in raw. A known foreign/conflicting capture is rejected rather than concealed by a plausible invoice fallback.

No arbitrary nested vendor object is copied. Full dispute bodies, headers, contact objects, addresses, links, account identifiers unrelated to mapping, attachments, adjudication narratives and vendor error descriptions remain transient. No automatic download/follow of a vendor URL is permitted.

## Exact free-text boundary proposed for the controlled sandbox demo

Free text is necessary for the source Complaint Reader. Do not silently replace a buyer complaint with a reason code or publish an empty message array just to avoid sanitization.

1. Normalize text to Unicode NFC and CRLF/CR to LF. Preserve meaning, case and line breaks. Reject non-text, embedded NUL/control characters and strings exceeding the source 2,000-character message limit; do not truncate a complaint into apparent success.
2. Collect known buyer email/street-line values from the transient authoritative dispute and any linked authoritative order response, in memory only. Match normalized contact values case-insensitively with collapsed whitespace. Replace email values and complete street-line occurrences with `[CONTACT_REDACTED]`; never persist the dictionary.
3. Independently replace ordinary email-address tokens and HTTP(S)/mailto/tel URLs with `[CONTACT_REDACTED]` or `[LINK_REDACTED]`. This covers contacts appearing in text rather than structured fields. Do not retain URL queries/fragments or encoded contact values.
4. If a recognizable street-address/contact candidate remains after those replacements, fail the text boundary with a fixed `DISPUTE_TEXT_REVIEW_REQUIRED` code. Leave the sync/job incomplete instead of saving the raw text, dropping it, inventing a cleaned complaint or forwarding it to a model. Review only in an ignored private working area, never in logs/Git. A later attempt must pass the same boundary.
5. Apply the same boundary to BUYER, SELLER and ARBITER message content and to persisted merchant-edited action notes/narratives. Hash the canonical tuple `{posted_by,time_posted,content}` after redaction; compare durable fingerprints before emitting new buyer strings. Messages have no provider message ID in the current schema; identical normalized tuples are one observation, not invented IDs.

Implementation rules for that review are explicit: known email values use NFC/trim/lowercase; known street lines use NFC/trim/collapsed whitespace and case-insensitive whole-value matching across whitespace. Do not replace a one-character/numeric-only address component throughout product text: known street dictionary entries need at least four characters and a letter. Ordinary email tokens contain a non-whitespace local part, `@`, a non-whitespace domain and dotted suffix. Remove the entire non-whitespace HTTP(S), mailto or tel token. After replacement, a remaining `@`/`%40`, an unredacted marked contact clause (`email:`, `e-mail:`, `address:`, `ship to:` or `deliver to:`), or a number/address sequence ending in `street`, `st`, `road`, `rd`, `avenue`, `ave`, `lane`, `ln`, `boulevard`, `blvd`, `drive`, `dr`, `court`, `ct`, `way`, `place` or `pl` triggers review. Matching is case-insensitive; punctuation/whitespace variants must be tested. These are conservative English-demo candidates, not a global address vocabulary. Contact clauses containing only the explicit redaction placeholders are safe.

Accept at most the official 1,000 messages per snapshot and 10,000 historical fingerprints per dispute as a local safety budget; exceedance fails without truncation. Each retained message needs a valid provider role and time_posted. Missing timestamps are not replaced with invented message IDs/times.

Example with known source street `10 Synthetic Street`: `The seam split. Email maya@example.invalid; address 10 Synthetic Street.` becomes `The seam split. Email [CONTACT_REDACTED]; address [CONTACT_REDACTED].` The product complaint remains intact. An unfamiliar address candidate fails review instead of leaking through a fallback.

This is a bounded demo redaction proposal, not a universal international-address detector. Do not claim regex proves that arbitrary text is contact-free. The real controlled Maya fixture needs a privacy review before commit/model use; unclear content remains blocked. If this limitation is unacceptable, revise this text boundary before implementation rather than adding an unapproved intake workflow or weakening the source privacy rule. Models remain solely in Ishaan's packages/ai; Hriday does not call a model to redact input.

## Approved-action result retention proposed

Keep `evidence_packs.paypal_response` as a small local operation summary, not a vendor mirror: existing pack/dispute IDs, operation symbol, result `submitted`/`failed`/`outcome_unknown`, UTC observation time, deterministic request ID, safe PayPal debug/status/symbolic error codes when available. Retain actual returned `dispute_id`/`status` only when present and valid. Do not manufacture success fields from an empty response or save links, notes, documents, contacts, headers or the full response. This summary is neither approval nor proof that an uncertain action succeeded.

H4 ledger payloads retain existing dispute/pack IDs, recommendation/operation symbols, permitted amount/currency and outcome/error symbols. No response body or message text is required in ledger/jobs/logs. Evidence blobs and source pack files keep their existing hash-based storage/approval rules; this proposal does not authorize new raw PayPal evidence downloads or override H5's retention task.

## Q4 mapping and approval edits proposed

| Boundary                    | Existing field mapping                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft `actionParams.amount` | `action_params.offerAmount` for `make_offer`; `action_params.refundAmount` for `accept_claim` with `PARTIAL_REFUND`; no amount for full accept-claim or replacement without refund |
| Approval body `amount`      | Same operation-specific field; edits must match dispute currency and be positive/no greater than the disputed amount                                                               |
| Worker → PayPal             | `offerAmount` → `makeOffer(...).offerAmount`; `refundAmount` → `acceptClaim(...).refundAmount`; note/type forwarded only after fresh stage/options checks                          |

Reject conflicting amount representations rather than guessing precedence. Existing explicit approval edits override the corresponding draft values and are frozen into the existing action_params with the chosen recommendation, approved_by and approved_at. This is necessary to execute the actual approved body; no shared field is renamed/added. `inspect_first` stays 409 PACK_NOT_ACTIONABLE; `merchant_decides` requires an explicit actionable recommendation. A submitted/failed/superseded pack is not silently reapproved, and a worker never executes a draft.

Q2's return-address omission still blocks both REFUND_WITH_RETURN branches before OAuth. Shared contract changes still require joint review. This proposed mapping does not claim Ishaan has reviewed it.

## Scope and required proof

Approval permits local implementation/tests of this storage/text/mapping boundary, including synthetic fixtures, merchant ownership, transactional sync/message dedupe, approval edits, safe action summaries and worker recovery. It does not approve an actual evidence submission, offer, message, refund, adjudication, billing action or new model/provider integration. Each real action still needs its documented human approval.

Required local cases: nested unknown-field removal; known and embedded contact redaction; unclear text failing without persistence/job; unchanged complaint meaning; duplicate/reordered/shorter message lists; merchant/capture isolation; first-resolution timestamps; atomic ledger/job rollback; Q4 edits/conflicts; no action on stale stage/options or missing approval; safe failures/ambiguous outcomes. Real pre-H1/H4 spike, action options, multipart evidence, stage rehearsal and A12 remain NOT RUN until accounts/human actions exist.

11 November approved extension: see [the bounded integration review](ishaan-integration-review.md#separate-h4-text-retention-decision). It adds only the listed buyer-authored note leaves under the existing controlled-demo redaction policy, with 2,000 characters per leaf, 100 entries per new list and 20,000 extra-text characters per snapshot. This is not approval to perform a PayPal action.
