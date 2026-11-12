# Hosted Fairfold captures

Captured from [the actual Render website](https://fairfold-api.onrender.com), **13 November 2026 IST / 12 November UTC**, deployed main **`d23ee86adc2adfd4e38f3b001689327cde2791d6`**. The [deployment receipt](../../hriday/evidence/2026-11-13-render-live.md) identifies the actual services, deploys, seed job and hosted checks. The [manifest](provenance.json) records capture time, origin, deployment ID and SHA-256 hashes.

**All buyer/order/review/dispute data shown is synthetic.** Counts are 393 orders across three stores (344 Neel, 24 Indigo, 25 QuickTees), 85 reviews and 16 complaints. No PayPal payment, evidence submission, message, offer or refund was performed for these captures. The resolved dispute is seeded; Shared Cause stays empty without provider-backed embeddings. Store Report figures describe fixtures, not real-world performance.

| Asset                                                                                                                   | Provenance                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Desktop overview](overview.svg) · [mobile overview](overview-mobile.svg)                                               | Code-native passive presentation frames around the actual unaltered screenshots; embedded PNGs, no remote assets or repainted UI                 |
| [Hosted tour](tour.gif) · [reduced-motion still](tour-still.png)                                                        | Six screenshot states, 3.4 seconds each, 20.4 seconds total; resized screenshots with captions outside the UI, not a continuous screen recording |
| [Landing](captures/landing.png) · [Orders](captures/orders.png) · [Pack Station](captures/pack.png)                     | Actual HTTPS pages at 1440 × 1000                                                                                                                |
| [Dispute Room](captures/disputes.png) · [Shared Cause](captures/shared-cause.png) · [Store Report](captures/report.png) | Actual HTTPS pages at 1440 × 1000; missing model results remain visible                                                                          |
| [Mobile packing](captures/pack-mobile.png)                                                                              | Actual responsive website at 390 × 1000                                                                                                          |

The website's native control folded the activity dock before capture. Components, fonts and styling are unchanged. Market figures in the landing design remain presentation copy, not measured results. Images were reviewed for private information; only synthetic identities/identifiers and the public service URL are included. The original [local series](../README.md) is retained with its own source attribution.

Rebuild offline from the committed originals:

```sh
python -m pip install Pillow
python scripts/readme_hosted_media.py
pnpm docs:check
```

Importing replacement captures requires `--captures <directory>` and a passing twelve-view capture receipt pinned to this exact origin/source commit. For a later deployment, deliberately update the provenance and source checks after observing the new deployed hash. Do not relabel old screenshots as a new release. The generator verifies original hashes before rebuilding; the application does not require Python/Pillow.

Documentation validation checks original/derived hashes, link targets, passive SVG contents and the earlier proof specimen. A README preview does not prove how GitHub renders it; the actual published GitHub rendering remains a separate observation. Media is covered by the repository's [MIT licence](../../../LICENSE).
