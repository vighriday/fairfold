# H2.2c refund and reporting verification

Date: 9 November 2026 IST. Branch: `Hriday`; increment after tracking commit `76cba6e`. Sources: original architecture 3, 12, 15 and 16 H2. No schema, shared interface, API route, job handler or Ishaan-owned package changed.

## Current primary sources

| Specification                                                                                   | Version | SHA-256 of ignored download                                        |
| ----------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| [Payments schema](https://developer.paypal.com/api/payments/v2/schema.json)                     | 2.12    | `c2c95b3b8a4baca873712cc72cc63240ba95f0627aae12614526a2c17792803a` |
| [Transaction Search schema](https://developer.paypal.com/api/transaction-search/v1/schema.json) | 1.10    | `85909abeb33b12e184a11d404beb6494ad51115523e6d534ee26ef865d3f9a6d` |

Checked the [refund operation](https://developer.paypal.com/api/payments/v2/captures-refund) for body fields and request-ID idempotency, and [Transaction Search](https://developer.paypal.com/api/transaction-search/v1/search-get) for date windows, field selection and pagination. PayPal notes that reporting transaction IDs need not be unique and history can be delayed; reporting remains outside the live path. The 100-page guard is local O16, not a platform quota claim.

## Actual checks

| Check                                          | Result                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                               | PASS                                                                                                                                                                                                                                                           |
| `pnpm lint`                                    | PASS                                                                                                                                                                                                                                                           |
| `pnpm test`                                    | PASS; 136 offline tests, 17 DB checks explicitly skipped; 7 files passed and 4 skipped                                                                                                                                                                         |
| New refund/reporting coverage                  | PASS; 25 synthetic cases cover full/partial refund fields, exact amounts, actual PENDING status, stable retry ID/body, response redaction, UTC/offset date bounds, duplicate transaction IDs, page iteration and fail-closed incomplete/changing/error results |
| Dependency changes                             | NONE                                                                                                                                                                                                                                                           |
| Database suite                                 | NOT RERUN; schema/provider/queue code unchanged, prior 17 real local PostgreSQL checks remain recorded                                                                                                                                                         |
| Refunds/history calls and real vendor fixtures | NOT RUN; injected HTTP responses only                                                                                                                                                                                                                          |
| Capture persistence / public routes / `/dev`   | NOT IMPLEMENTED here                                                                                                                                                                                                                                           |
| H1 hosted checks / H2 A4                       | PENDING / NOT RUN                                                                                                                                                                                                                                              |

The final offline run began at approximately 19:24 IST. Source/tests were formatted. No actual refund, PayPal request, buyer message, model call or Render action occurred.

The refund binding does not establish approval, ownership, remaining refundable balance or age eligibility. Those checks are required in its future authenticated approved caller; PayPal remains authoritative. A PENDING refund is not reported as completed. The reporting helper returns transient raw rows only, and does not persist or model fields=all payloads.

H2.2's specified operation groups are now locally implemented, not the full application or full PayPalClient/ForMerchant. Next is Q3 review and H2.3. See [H2 work order](../h2-paypal.md).
