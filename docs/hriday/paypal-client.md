# H2 complete PayPal client

The original architecture section 3 defines PayPalClient/ForMerchant, and section 16 H2 requires that complete client. The user explicitly chose “Finish remaining local H2 client work first.” Earlier notes incorrectly assigned the remaining low-level methods entirely to later tasks. H3 owns event ingestion/polling; H4 owns approved dispute workflows. Their vendor bindings belong here.

## Method inventory

| Group           | Source operations                                                                               | Local state                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Orders          | create, capture, get, addTracking                                                               | Implemented and tested                                                                           |
| Payments        | refund                                                                                          | Implemented and tested; no action route or actual refund                                         |
| Reporting       | searchTransactions                                                                              | Implemented and tested; results transient                                                        |
| Carriers        | toDisputeCarrier                                                                                | Implemented; current dispute schema confirms seed carriers                                       |
| Disputes reads  | list, get                                                                                       | Implemented and tested in this increment                                                         |
| Disputes writes | provideEvidence, makeOffer, acceptClaim, sendMessage, sandboxAdjudicate, sandboxRequireEvidence | Implemented and locally tested; both Q2 return-address branches fail before OAuth pending review |
| Webhooks        | verify, register                                                                                | Implemented and locally tested; exact-body postback; no H3 handler or persistence                |
| Composition     | ForMerchant returning all existing groups                                                       | Implemented, satisfies ForMerchant without a cast; API/rehearsal use the full factory            |

## Dispute reads and cursors

list maps the unchanged source filters, uses the injected clock for the documented 180-day bound and normalizes accepted RFC3339 timestamps to UTC. pageSize defaults to 10 and is limited to 1–50. The state filter accepts documented comma-separated values. Invalid input fails before OAuth. get accepts actual hyphenated dispute IDs and validates the returned resource identity/status.

The shared nextPageToken remains opaque. Existing vendor next_page_token values round-trip unchanged; when the current API returns a page-number link, the adapter returns page:N and maps it back to page=N on the next call. The colon distinguishes local cursors from the documented legacy token alphabet. Consumers pass the returned string unchanged and keep the same filters/page size. No shared request/response field changes.

No vendor HATEOAS URL is followed. Pagination extracts only a validated next token or sequential page from exact sandbox API URLs for the disputes path. Other origins, credentials/fragments, duplicate/conflicting cursors, unknown query fields, changed filters and repeated/skipped pages fail closed. A response without a next link is terminal; the adapter does not invent pages from item counts. Only one page is fetched per call, preserving the source list contract.

Dispute objects remain transient unknown values. No raw payloads are written, logged or used as model inputs. Future H3/H4 consumers still need their Q3 persistence mapping and approval/ownership checks. A list/get test is not evidence of a real dispute or an activated poll.

## Verified sources and pending external checks

Checked 9 November 2026: [Disputes schema v1.12](https://developer.paypal.com/api/customer-disputes/v1/schema.json), [list reference](https://developer.paypal.com/api/customer-disputes/v1/disputes-list) and [dispute integration guide](https://developer.paypal.com/api/disputes/). Schema SHA-256: fee5e04ab606f8961b95744e65c4189fc7c4613e79ba2f944d2deab79e834330. Working schemas stay ignored.

Real OAuth, pagination/resource shapes, scopes, action eligibility, actual multipart acceptance and verification remain NOT RUN until the sandbox accounts exist. Q2 return-address, Q3 retention, Q5 accept-claim behavior and Q12 mutation replay boundaries remain explicit. H1/H2 are not complete and H3–H8 remain unstarted. See the [current status](status.md).

## Complete composition and handoff

createPayPalClientFactory returns all 17 shared operations with one credential-versioned per-merchant transport/cache, plus the private readCapture helper. It satisfies the unchanged ForMerchant type without a cast. Constructing a client makes no eager vendor call. The checkout compatibility adapter projects orders/readCapture from this same factory; the normal API and recorded rehearsal use the full factory directly.

All 279 offline and 126 PostgreSQL/HTTP cases pass, including a synthetic call through every shared method, concurrent cross-group token coalescing, merchant isolation and credential rotation/removal/simulation. Actual normal/rehearsal startup checks pass. Q2 return branches and real account-backed acceptance remain explicit; see [complete-client evidence](evidence/2026-11-09-h2-complete-client.md) and [H2 closeout](h2-closeout.md). No H3/H4 consumer or raw retention was activated.
