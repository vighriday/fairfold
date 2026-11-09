# H2 webhook client evidence

Observed 9 November 2026 IST on Hriday. Original PayPalClient/H2 and the official signature postback guide govern these bindings. No H3 handler or schedule was added.

- PASS: 80 webhook/action/transport checks. Covered unchanged raw JSON formatting/escapes/number spelling, case-insensitive header mapping, duplicate/missing/invalid metadata rejection before OAuth, exact verification status handling, stable read-only retries, registration snapshots/identity validation and no uncertain registration replay.
- PASS: typecheck and lint.
- The initial lint run rejected a control-character regex in header validation. It was replaced by equivalent character-code checks; lint/typecheck and all 80 targeted cases then passed before publication.
- NOT RUN: real webhook registration, signature verification, event delivery or simulator postback. Synthetic SUCCESS values in tests do not verify an actual PayPal signature.

verify embeds the original raw body directly as webhook_event inside the outgoing JSON envelope. It parses only to validate a JSON object and never reserializes that event. The transport's raw JSON mode is restricted to this one postback path. Missing/malformed metadata returns false; only PayPal's exact SUCCESS yields true. FAILURE remains false; malformed/provider failures propagate safely rather than becoming success. There is no simulator bypass or fallback to trusting the payload.

Certificate URLs must name the documented sandbox PayPal certificate resource; this code does not download certificates or follow supplied URLs. Raw input is locally limited to 1 MiB, matching the current API body budget, and remains transient. The five headers and registered webhook ID are mandatory. Signature payloads and buyer/contact values never enter diagnostics or recording files.

register validates public HTTPS, snapshots the explicit event set and requires matching returned ID/URL/events. Its generated request ID is stable within transport retries; no provider registration idempotency or duplicate lookup is claimed. A 5xx/ambiguous outcome is not automatically replayed. Future H3 setup must resolve an existing/uncertain registration before another call, enforce the source seven-event set and persist only the reviewed identifier.

Sources checked 9 November: [signature integration guide](https://developer.paypal.com/api/rest/webhooks/rest/), [verification endpoint](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post) and [Webhooks schema](https://developer.paypal.com/api/webhooks/v1/schema.json), SHA-256 a10f9d6d44b4732393bf07001979110e0f6a584efad07e31d0d4ad76d6300ca3. The integration guide explicitly requires unchanged event data and says simulator events cannot use postback verification. H3 event retention/durable dedupe remain Q3/Q11 and are not implemented here.
