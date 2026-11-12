# Live README and hosted media verification

13 November 2026 IST. The user requested updated live links and enhanced website photos with seeded data after the first Render deployment. This is documentation/media work; no application component, contract, payment flow or retention policy changed.

## Source and additions

- Live origin: `https://fairfold-api.onrender.com`; actual deployed main **`d23ee86adc2adfd4e38f3b001689327cde2791d6`**. The [deployment receipt](2026-11-13-render-live.md) records the infrastructure and real read-only smoke.
- Added live landing/console/API docs/OpenAPI/health links, route-by-route guidance, current topology and setup limits. Removed obsolete pending-hosting assertions by updating their meaning; retained earlier narrative, implementation maps, diagrams, local screenshots, tour and provenance.
- Fresh hosted capture run started **2026-11-12T18:41:31.738Z / 13 November 00:11:31 IST**. All six pages passed at 1440 × 1000 and 390 × 1000, with no API failures, browser exceptions or horizontal overflow.
- Imported seven unaltered originals: six desktop routes plus mobile packing. The existing activity-dock control folds the dock. All records are synthetic; no camera capture, seal, payment, message, offer or refund occurred.
- Added passive desktop/mobile SVG frames, a six-frame **20.4-second** captioned GIF and reduced-motion still. Screenshots remain unmodified inside presentation frames; no component was repainted. A separate manifest records origin, source/deployment IDs, capture time and original/derived SHA-256 digests.
- Original local captures remain attributed to `6e0268c`. The historical static verification board remains dated; an adjacent current receipt explains the later hosted result. Seed counts are fixture sizes, not traction or real customers.

## Observed checks

| Check                   | Result                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm docs:check`       | **PASS**: local targets/anchors, 16 passive described SVGs, seven unchanged local captures, seven hosted captures, four derived hosted assets and production-checked proof/tamper examples |
| Typecheck and lint      | **PASS**; documentation checker is the only changed TypeScript file                                                                                                                        |
| Actual Markdown preview | **PASS** at 1280 px light/dark and 390 px with reduced motion                                                                                                                              |
| Hosted mockup           | **PASS**: real live-link target and correct desktop/mobile picture source                                                                                                                  |
| Hosted tour             | **PASS**: native keyboard reveal, GIF on normal motion and still fallback on reduced motion                                                                                                |
| Galleries               | **PASS**: four new full-resolution linked previews, all six earlier gallery images/links retained                                                                                          |
| Native interactions     | **PASS**: all 17 disclosures/images, earlier keyboard paths and nested proof reveal; no page overflow                                                                                      |
| SVG layout              | **PASS**: new frames render, all checked text stays inside each viewBox                                                                                                                    |
| Preview runtime         | **0** JavaScript exceptions and **0** external network requests; live links checked without navigating the offline preview                                                                 |

The first preview run passed all three page states but failed while saving a nested-SVG QA screenshot because its generated filename contained a directory separator. Corrected that ignored harness filename and reran: full **PASS**. No product/media change was required. Machine evidence and visual-review screenshots are ignored under `.work/readme-preview/`; capture source receipts are under `.work/render-captures/`.

The optional generator is `scripts/readme_hosted_media.py`; it rebuilds from the committed originals offline and checks original hashes. `scripts/check-readme.ts` now validates the hosted manifest and nested SVGs as well as the preserved local set. Python/Pillow remain documentation tooling, not app dependencies.

Final checks: **181 local references**, **16 SVGs**, both seven-capture sets and all four derived hosted hashes PASS. XML parsing and original PNG dimensions PASS; the GIF has six frames totalling exactly **20,400 ms**. Offline regeneration is byte-for-byte stable. Repository formatting PASS. The new hosted media occupies approximately 2.8 MB; original local assets were not changed.

Actual GitHub-hosted Markdown rendering and final submission/video remain unobserved. Real provider/photo, PayPal and complete hosted A1–A14 acceptance remain pending. No prize, production readiness, successful sandbox action or new provider access is claimed.
