# Hriday sandbox dispute spike

This is the pre-H1 task explicitly assigned to Hriday in architecture section 16. Its purpose is to discover whether the planned demo's real PayPal dispute path works before investing in the application. Budget from the source: approximately 60 minutes. **Current result: NOT RUN.** These are instructions and request examples, not code executed during this documentation pass.

The original brief requires a buyer-opened not-as-described case, a details snapshot, timing and a report to Ishaan. The full evidence/offer rehearsal extends that discovery into the highest-risk H4 path. Keep separate results for discovery and action rehearsal; do not call H4 complete merely because discovery succeeds.

## 1. Prepare accounts and private storage

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), select **Sandbox**. Create or identify the business account for fictional Neel Block Prints and its Merchant REST app. Enable Customer disputes and Transaction Search before requesting the first token.
2. Create or identify a personal sandbox account for fictional Maya. Use separate browser profiles/sessions for buyer and merchant. These are sandbox identities, not real customer accounts.
3. Keep app credentials and account passwords in local secret storage or `.env` when implementation supplies it. Do not put them in chat, a screenshot, a command transcript, README or a committed fixture. PowerShell does not automatically load `.env`.
4. Keep unredacted responses in ignored `.work/spike/` if necessary. Copy only redacted evidence into the committed evidence record. Do not commit local original photos or inspection exports from the private documents.
5. Do not create a paid Render service for this spike. A public webhook receiver is an H1/H3 dependency; list/get can establish dispute visibility before it exists.

Primary setup reference: [PayPal dispute account setup](https://developer.paypal.com/platforms/disputes/set-up).

## 2. Obtain a token without printing it

Run in a private PowerShell session. Do not enable shell transcription, request verbosity or header logging. The code uses task-specific variables and fixes the sandbox base URL.

```powershell
$ffBase = 'https://api-m.sandbox.paypal.com'
$ffClientId = Read-Host 'Sandbox merchant client ID'
$ffSecureSecret = Read-Host 'Sandbox merchant client secret' -AsSecureString
$ffSecret = [System.Net.NetworkCredential]::new('', $ffSecureSecret).Password
$ffBasic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ffClientId + ':' + $ffSecret))
$ffToken = Invoke-RestMethod -Method Post -Uri ($ffBase + '/v1/oauth2/token') `
  -Headers @{ Authorization = 'Basic ' + $ffBasic } `
  -ContentType 'application/x-www-form-urlencoded' -Body 'grant_type=client_credentials'
$ffAccessToken = $ffToken.access_token
$ffHeaders = @{ Authorization = 'Bearer ' + $ffAccessToken; Prefer = 'return=representation' }
Remove-Variable ffSecret, ffBasic, ffSecureSecret, ffToken
```

Record only token success/failure, granted scope names if relevant and expiry duration. Never print the token or the Authorization header. On permission errors, inspect the app features; do not swap in live credentials.

## 3. Create and approve a $38 order

```powershell
$ffOrderId = [guid]::NewGuid().ToString()
$ffCreateBody = @{
  intent = 'CAPTURE'
  purchase_units = @(@{
    reference_id = $ffOrderId
    custom_id = 'neel-block-prints'
    invoice_id = 'FF-' + $ffOrderId
    amount = @{
      currency_code = 'USD'; value = '38.00'
      breakdown = @{ item_total = @{ currency_code = 'USD'; value = '38.00' } }
    }
    items = @(@{
      name = 'Block-print cotton hoodie'; sku = 'HD-IND-01'; quantity = '1'
      unit_amount = @{ currency_code = 'USD'; value = '38.00' }
    })
  })
} | ConvertTo-Json -Depth 10
$ffHeaders['PayPal-Request-Id'] = 'ff-create-' + $ffOrderId
$ffCreated = Invoke-RestMethod -Method Post -Uri ($ffBase + '/v2/checkout/orders') `
  -Headers $ffHeaders -ContentType 'application/json' -Body $ffCreateBody
$ffPayPalOrderId = $ffCreated.id
$ffApproval = $ffCreated.links | Where-Object { $_.rel -in @('payer-action', 'approve') } | Select-Object -First 1
$ffApproval.href
```

Open the returned sandbox approval URL in Maya's sandbox browser session. Complete approval as the buyer. Record approval time. Do not capture before approval, and do not reuse a `SEED-` identifier. If no approval link is returned, preserve the sanitized status/error and stop that request path.

## 4. Capture and record identifiers

```powershell
$ffHeaders['PayPal-Request-Id'] = 'ff-capture-' + $ffOrderId
$ffCaptured = Invoke-RestMethod -Method Post `
  -Uri ($ffBase + '/v2/checkout/orders/' + $ffPayPalOrderId + '/capture') `
  -Headers $ffHeaders -ContentType 'application/json' -Body '{}'
$ffCapture = $ffCaptured.purchase_units[0].payments.captures[0]
$ffCaptureId = $ffCapture.id
$ffCaptured | Select-Object id, status
$ffCapture | Select-Object id, status, seller_protection
$ffCaptured.payment_source.paypal.account_status
```

Record Fairfold reference UUID, PayPal order ID, capture ID, invoice ID, currency/amount, Seller Protection and payer account status. These are future mapping-fixture inputs, not yet database records. Capture responses contain buyer data; sanitize before sharing. For an ambiguous timeout, retrieve the order and inspect captures before retrying with the **same** capture request ID.

## 5. Open the dispute as Maya

1. Log into [sandbox.paypal.com](https://www.sandbox.paypal.com/) as Maya.
2. Locate the captured transaction and use the Resolution Center to report that the item is not as described. Use fictional seam-defect text consistent with the B17 story. Do not state an actual delivery happened; this is sandbox test data.
3. Record the submit time in UTC and IST. Leave the case open; do not accept, settle or adjudicate it before capturing its first state.
4. If the action is unavailable, record exactly which UI action is missing and check both account roles and capture status. Do not try an undocumented create endpoint with ordinary merchant credentials.

The buyer-side create API requires additional PayPal-granted scopes and consent; the source plan intentionally uses this manual path.

## 6. Discover and inspect the case

```powershell
$ffList = Invoke-RestMethod -Method Get -Uri ($ffBase + '/v1/customer/disputes') -Headers $ffHeaders
$ffList.items | Select-Object dispute_id, reason, status, dispute_life_cycle_stage
$ffDisputeId = Read-Host 'Dispute ID observed for this capture'
$ffDetails = Invoke-RestMethod -Method Get `
  -Uri ($ffBase + '/v1/customer/disputes/' + $ffDisputeId) -Headers $ffHeaders
$ffDetails | Select-Object dispute_id, reason, status, dispute_life_cycle_stage, seller_response_due_date
$ffDetails.disputed_transactions | Select-Object seller_transaction_id, invoice_number
$ffDetails.links | Select-Object rel, method, href
$ffDetails.allowed_response_options | ConvertTo-Json -Depth 10
```

If the case is not listed, follow pagination and retry at one-minute intervals, recording actual elapsed time. A missing event after two minutes is the source plan's signal to rely on reconciliation; it is not a promised API latency. Use capture-ID matching first and invoice matching second. Do not accidentally select an unrelated case.

Record `status`, `dispute_life_cycle_stage`, all action link names, allowed offer/accept types and first-seen delay. The app later stores lifecycle stage as `life_cycle_stage`. Keep the wire and database field names distinct.

## 7. Rehearse available actions on separate cases

This step requires an explicit human choice of the action for that sandbox case. Each action can change or close it. Preserve the before snapshot and prepare a fresh captured transaction/dispute for another branch. These examples do not constitute blanket approval for application workers to submit anything.

| Observation | Documented action to test | Evidence to record |
| --- | --- | --- |
| WAITING_FOR_SELLER_RESPONSE and `provide-evidence` link | Multipart evidence; first use a small PDF/PNG clearly labelled as spike material | Actual request structure, HTTP result, PayPal debug ID on failure, after snapshot |
| INQUIRY and allowed replacement/refund offer | Merchant-approved `make-offer`, using a supported type and appropriate amount | Accepted offer type/amount, response and resulting state |
| Escalated case where offer is unavailable | Inspect allowed accept options; test the source's accept-claim alternative only when its payload can be represented correctly | Allowed type and refund consequence; do not improvise missing return-address fields |
| Sandbox case needing seller evidence reopened | `require-evidence` with `action: SELLER_EVIDENCE`, then re-fetch | New status **and** lifecycle stage and links; do not assume the stage changed |
| Separate disposable case after other checks | Sandbox adjudicate to rehearse resolution | Explicit sandbox label and observed outcome; not a Fairfold prediction |

For evidence, prepare an ignored `evidence-input.json` matching this shape. Use a real tracking number only if it is genuinely associated with the tested captured order; otherwise test OTHER with truthful spike notes. The A12 fulfilment path must later use the real linked tracking data.

```json
{
  "evidences": [{
    "evidence_type": "OTHER",
    "notes": "Sandbox integration spike material. This is not production shipment proof."
  }]
}
```

The documented multipart wire pattern is:

```powershell
curl.exe --silent --show-error --fail-with-body `
  -X POST "$ffBase/v1/customer/disputes/$ffDisputeId/provide-evidence" `
  -H "Authorization: Bearer $ffAccessToken" `
  -H "PayPal-Request-Id: ff-evidence-<unique-pack-uuid>" `
  -F 'input=@.work/spike/evidence-input.json;type=application/json' `
  -F 'file1=@.work/spike/spike.pdf;type=application/pdf'
```

Replace the request-ID placeholder with the stable UUID of this logical pack, and create the referenced local files first. The PDF is a required input to this optional request, not an artifact created by this documentation pass. Let curl set the multipart boundary. Do not add a hard-coded Content-Type boundary, enable verbose headers, or commit the token. Check file size below 10 MB before sending.

Offer JSON for a human-selected REFUND_WITH_REPLACEMENT test includes `note`, `offer_type`, and `offer_amount: { currency_code: "USD", value: "38.00" }`. Use only if the case advertises that type. The amount must come from the actual captured/disputed amount, not a copied literal for a different case. `REPLACEMENT_WITHOUT_REFUND` omits the amount. Return-based actions remain gated on Q2 in `DECISIONS.md`.

The source's `accept_claim_reason` list remains unverified. The integration guide demonstrates `note` alone for accepting a full claim. Do not invent optional reasons or guess a return address. Read [action availability](https://developer.paypal.com/api/customer-disputes/v1/disputes-provide-evidence), [multipart examples](https://developer.paypal.com/platforms/disputes/integrate-disputes/), and [offer constraints](https://developer.paypal.com/api/customer-disputes/v1/disputes-make-offer) before an action run.

## 8. Record the discovery result and handoff

| Field | Result |
| --- | --- |
| Run date/time, operator, branch/commit | NOT RUN |
| App features enabled; business/personal roles checked | NOT VERIFIED |
| Fairfold reference / invoice / PayPal order / capture | NOT RUN |
| Capture status, seller protection, payer account status | NOT RUN |
| Buyer dispute submit time and first API visibility | NOT RUN |
| Dispute ID, reason, status, lifecycle stage | NOT RUN |
| Action links and `allowed_response_options` | NOT RUN |
| Capture/invoice mapping result | NOT RUN |
| Multipart evidence result and post-state | NOT RUN |
| Offer or accepted documented alternative, result/post-state | NOT RUN |
| Webhook arrival and verification, if a receiver exists | NOT RUN |
| Sanitized artifact paths; failures/debug IDs | NONE |
| Joint contract questions resolved | NONE |

Copy the actual discovery summary into root `DECISIONS.md`, update `status.md`, and prepare the result for Ishaan's CP0 handoff. The source plan asks Hriday to tell Ishaan; no message has been sent by this agent. Log evidence/action rehearsal separately. Remove token/header variables or close the private shell when finished.

If the spike fails, record the failure and the source-defined fallback candidate. The user has prohibited idea alterations, so do not silently change the demo or replace a real dispute with simulated success. Documentation work can proceed while runtime prerequisites remain unverified.
