# H2 dispute read client evidence

Observed 9 November 2026 IST on Hriday, against original architecture sections 3/16 H2 and the current official schema. Both original DOCX SHA-256 digests still match the source contract.

- PASS: 23 new offline cases through real transport/credential/token/parser code with synthetic HTTP. Covered UTC/filter/default mapping, current page and legacy token round-trips, 180-day/future/calendar bounds, unsafe/duplicate/nonprogressing pagination, invalid input before OAuth and cross-resource get rejection.
- PASS: pnpm typecheck.
- NOT RUN: actual PayPal list/get, real scopes, real pagination or dispute state observation.
- NOT IMPLEMENTED: event ingestion, poll schedule, dispute persistence or approved action execution. These remain H3/H4.

Responses are transient; diagnostics contain safe symbolic information only. The source full-client obligation is now correctly separated from later event/action workflows. See [client inventory and cursor policy](../paypal-client.md). No shared DTO, schema, hosting configuration or Ishaan-owned source changed.
