# H2 dispute action and upload client evidence

Observed 9 November 2026 IST on Hriday. Original PayPalClient and H2 govern the bindings; H4 approved workflows are not implemented here.

- PASS: 86 action/order/transport regression checks, including vendor field mapping, amount requirements, Q2 failures before OAuth, multipart binary preservation, stable bytes/boundary on 429, file/JSON/name/size validation and no 5xx action replay.
- PASS: typecheck and lint.
- NOT RUN: actual evidence upload, offer, accept-claim, message, sandbox adjudication or require-evidence. No vendor action or refund occurred.
- BLOCKED BY Q2: REFUND_WITH_RETURN for offer/accept-claim, because the unchanged shared input cannot supply its required return address. The methods return a precise review-required error before OAuth; other supported branches perform actual bindings.

Multipart sends one input part with application/json and file1..n with original safe filenames/MIME types. It snapshots raw binary bytes once; retries reuse the same serialized bytes and boundary. Signature/extension/MIME checks accept PDF/JPEG/PNG/GIF, reject injection/duplicate names and verify named documents have attachments. JSON must serialize without lossy non-JSON values. The local encoder conservatively uses decimal byte ceilings: files strictly below 10,000,000 bytes and the entire encoded request at most 50,000,000 bytes. These are implementation choices within the documented less-than-10 MB / up-to-50 MB bounds, not newly measured PayPal limits.

Refund offers require a positive decimal-string amount; replacement without refund omits it. Full accept-claim omits refund_amount; PARTIAL_REFUND requires it. No note truncation, amount guessing, carrier inference or return-address invention occurs. The current integration guide documents JSON note/message bodies despite incomplete multipart-only OpenAPI bodies for those actions; actual accept-claim runtime behavior remains Q5.

Every POST carries the source request ID/Prefer header. These mutation operations have no assumed server idempotency: 429 uses the transport's existing bounded retry; 5xx/network ambiguity requires later authoritative reconciliation, not automatic replay. Results remain transient unknown objects; no raw persistence/logging was added. Future callers must enforce approved action rows, merchant/order ownership, fresh stage/options and local dedupe before invoking these helpers.

Primary references checked: [integration examples](https://developer.paypal.com/platforms/disputes/handle-disputes/use-disputes-api/), [offer schema](https://developer.paypal.com/api/customer-disputes/v1/disputes-make-offer), [refund-type testing](https://developer.paypal.com/disputes/test-go-live), [file constraints](https://developer.paypal.com/platforms/disputes/reference/supported-file-types-sizes/). Schemas stay ignored; their digest is in the [client inventory](../paypal-client.md).
