# Fairfold evidence records

No runtime record has been created yet. Use one record per actual spike, acceptance run, eval or deployment. A committed record is a sanitized summary; original responses, private photos, credentials and tokens stay in ignored `local/` or `.work/`.

Copy this template into a dated Markdown file when a real run occurs:

```text
Run ID:
Purpose and source gate:
Operator:
Start/end time (UTC and IST):
Branch and commit:
Environment and actual API/demo URL:
Runtime/package versions:
Fixture/seed version and model/provider if relevant:
Prerequisites and authorized sandbox action:
Exact command or manual steps (secrets removed):
Expected result:
Observed result:
Status (PASS / FAIL / SKIPPED / BLOCKED / NOT RUN):
Sanitized request/response artifact paths:
Real sandbox order/capture/dispute IDs where needed:
HTTP status and PayPal debug ID on failure:
Database/ledger/worker result:
Known limits and follow-up:
Reviewer:
```

Preserve field names, enums, money and timestamps when sanitizing a fixture; replace private identifiers consistently so joins remain testable. Strip raw emails, street addresses, secrets, passwords and Authorization headers, including nested payloads and screenshots. Do not call a fixture real if its values were invented.

Reconcile evidence status with `status.md`, `validation.md`, `DECISIONS.md` and `CHANGELOG.md`. If a test was skipped because credentials were missing, leave its acceptance gate open. If a rerun supersedes a failure, retain the failure and link the fix and later result.
