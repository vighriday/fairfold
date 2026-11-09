# H3 source and persistence preparation

Date: 10 November 2026 IST. Branch: `Hriday`.

- **PASS:** reread the original H3/F4/F6 and privacy/idempotency requirements. Original submission SHA-256 remains `FDF476A9D75A6BEAC357A9AA07961722E71F0B1FD273B82F3F5EA43CE72D3602`; architecture remains `0FCB7420131B28D053FE353A2B2DAA186380C00C3047867C734A751745CF357A`.
- **PASS:** inspected existing schema, jobs transaction adapter, full PayPal client, capture store and API/worker composition. Endpoint source path is `/webhooks/paypal/:merchantSlug`; seven subscribed events are listed in the plan.
- **PREPARED:** [H3 plan](../h3-webhooks.md), [Q3 event allowlist proposal](../webhook-persistence-review.md) and [acceptance/human handoff](../h3-acceptance.md). No implementation, event persistence or remote action performed in this work unit.
- **PASS:** final formatting and staged-file audit: 148 local Markdown links resolve; eight expected documentation paths only; clean patch and no private path or credential pattern. No application source changed, so application tests/typecheck were not rerun for this documentation-only unit.
- **BLOCKED FOR IMPLEMENTATION:** current AGENTS.md's explicit no-H3 gate needs an exception while H1/H2 real acceptance remains pending. Q3's event proposal needs approval; the prior capture approval is narrower.
- **NOT RUN:** new H3 tests, actual registration/signature/A5, sandbox purchase and hosted deployment. Existing H2 results remain historical, not rerun here.

Primary-source verification consulted PayPal's [webhook overview](https://developer.paypal.com/api/rest/webhooks/), [integration guide](https://developer.paypal.com/api/rest/webhooks/rest/), [payment supplementary IDs](https://developer.paypal.com/api/payments/v2/definitions/supplementary_data/) and [official dispute schema](https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/customer_disputes_v1.json). Their documented shapes do not substitute for the pending real webhook/spike.
