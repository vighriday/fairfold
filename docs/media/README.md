# README media and provenance

All artwork is self-hosted. The graphics add presentation around the existing website; they do not redesign its components. Screenshots show actual local API-bound pages at website commit `6e0268c`, captured on 12 November 2026 with Chromium at 1440 and 390 px. The existing activity-dock control was used to fold the dock before capture. The source run reported no JavaScript exceptions or failed API responses.

**Every record shown is synthetic. No PayPal purchase, signature verification, dispute submission, offer, message or refund was performed to make these assets.** Shared Cause is visibly empty because the local embedding provider is not configured. A seeded resolved dispute is not a real sandbox dispute fixture. The mockup and tour do not replace the required functioning demo video.

Market figures in the supplied landing-page design are presentation copy, not measured Fairfold results. This README does not use them as evidence of impact or performance.

| Asset                                                                         | Source and meaning                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Light cover](fairfold-hero-light.svg) · [dark cover](fairfold-hero-dark.svg) | Independently authored, code-native SVGs using Fairfold’s existing ink/paper/violet palette; product positioning, not acceptance evidence                                                                                                        |
| [Desktop/phone mockup](product-overview.svg)                                  | The original [Orders screenshot](captures/orders.png) and [mobile Pack Station](captures/pack-mobile.png), embedded as PNG data in a self-contained SVG frame; no UI elements are repainted                                                      |
| [Tour GIF](console-tour.gif) · [still fallback](console-tour-still.png)       | Six original screenshots, resized into a captioned frame (the landing frame focuses on its hero region; the full original is linked separately); 19.2 seconds, six discrete route states, not a continuous screen recording or transaction video |
| [Approval-boundary illustration](approval-boundary.svg)                       | Original SVG architecture illustration; motion ends before the human gate and honours reduced motion; no actual approval or external event asserted                                                                                              |
| [Proof specimen](proof-specimen.json)                                         | Two synthetic hash-format examples, independently generated and checked against the production canonical JSON/SHA-256 functions; never inserted as order evidence                                                                                |
| [Provenance manifest](provenance.json)                                        | Capture commit/date/mode and SHA-256 of each original PNG                                                                                                                                                                                        |

### Additional visual explainers

These independently authored SVGs explain the existing product; they are not screenshots of new functionality. They use the same ink/paper/violet palette and accessible titles/descriptions.

| Asset                                                                                       | Meaning                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Merchant](path-merchant.svg) · [buyer](path-buyer.svg) · [builder](path-builder.svg) cards | Visual links to reading paths in the README; navigation is supplied by the surrounding Markdown/HTML link                                                       |
| [Order story](evidence-journey.svg) · [mobile layout](evidence-journey-mobile.svg)          | Four illustrated moments, with the same content arranged for desktop and mobile: read, pack, connect, review                                                    |
| [PayPal lifecycle](paypal-lifecycle.svg)                                                    | PayPal's payment/dispute authority beside Fairfold's evidence and review responsibilities; intended integration, not observed sandbox outcomes                  |
| [B17 investigation](b17-investigation.svg)                                                  | Synthetic scenario: test alternatives, inspect a possible common fault, then recommend a remedy if confirmed; no statistical result or provider run is asserted |
| [Original proof](proof-original.svg) · [changed proof](proof-changed.svg)                   | Views of the exact specimen and a change to only `payload.label`; stored/recomputed digests are checked against production hashing by `docs:check`              |
| [Verification board](verification-board.svg)                                                | Static summary of recorded local results at `6e0268c`, alongside pending account/model/hosted acceptance. Counts overlap; this is not a live dashboard          |

## Rebuild or verify

The application does not depend on Python or Pillow. These are optional documentation tools:

```sh
python -m pip install Pillow
python scripts/readme-media.py
pnpm docs:check
```

The generator rebuilds the cover SVGs, mockup, GIF, proof specimen and manifest from the committed originals in `docs/media/captures`. It also calls the standard-library-only [illustration generator](../../scripts/readme_illustrations.py), which can be run separately with `python scripts/readme_illustrations.py`. To replace the captures, run the actual local website against synthetic data, verify each page is API-bound, and review the images for private information. The generator’s `--captures` import is deliberately pinned to the recorded website commit and successful local capture manifest; update that provenance deliberately for a future capture, not silently.

`docs:check` verifies local links/anchors, descriptions and passive content in SVGs, capture hashes and the proof specimen, then changes a payload in memory to demonstrate a broken chain. It performs zero PayPal requests and does not connect to a database.

Only GitHub-native interactions are used in the root README: links, disclosure sections, theme/reduced-motion picture sources and Mermaid. No external badge service, visitor counter, tracking pixel, embedded app or JavaScript widget is required. See GitHub’s [diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams), [disclosures](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections) and [supported media](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files) documentation.

Original Fairfold artwork and generated media are supplied under the repository’s [MIT licence](../../LICENSE). No PayPal logo, endorsement, award, live deployment link or external acceptance result is fabricated. The supplied website design remains credited in [`standalone/`](../../standalone).
