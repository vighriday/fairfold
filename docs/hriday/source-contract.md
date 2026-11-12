# Fairfold source contract

Baseline reviewed on 9 November 2026 IST. Both Word documents were read in full, including tables; all six embedded diagrams were visually inspected. No tracked insertions or deletions were present. The originals were not edited.

| Local source                                                                                        | Role                                                                | SHA-256 of the original file                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/internal/README.md`                                                                           | Prohibits committing every file in that directory                   | Rule read directly                                                 |
| `Fairfold — PayPal AI Hackathon Submission.docx`, dated 7 November, with additions dated 8 November | Idea, audience, product loop, pitch and demo                        | `FDF476A9D75A6BEAC357A9AA07961722E71F0B1FD273B82F3F5EA43CE72D3602` |
| `Fairfold — Solution Architecture and Build Plan.docx`, dated 8 November                            | Fixed decisions, detailed contracts, ownership and acceptance gates | `0FCB7420131B28D053FE353A2B2DAA186380C00C3047867C734A751745CF357A` |

The file names in the last two rows are relative to `docs/internal/`. That folder and extracted source media are ignored. These notes are independently written implementation guidance, not replacement copies of the private documents.

## Authority and reading map

The 9 November baseline required exact branch `Hriday`, PayPal-only integration and research first. The user's 12 November instruction supersedes the branch/frontend restrictions: work on integrated `main` and connect the supplied website without redesign. The idea and architecture remain fixed. The idea document defines the experience. Architecture sections 3, 5, 7–11, 14 and 15 define how to implement it. A factual conflict with a current vendor interface is recorded for review; it does not permit an unannounced contract change.

| Architecture sections | Use                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| 1–4                   | Working rules, system context, PayPal constraints and dispute lifecycle              |
| 5                     | D1–D18, fixed decisions; summary in root `DECISIONS.md`                              |
| 6–7                   | Component ownership, 25 tables and exact ledger hashing                              |
| 8                     | F1 checkout, F2 pack and seal, F3 watchdog, F4 disputes, F5 shared cause, F6 shopper |
| 9                     | Shared-cause population, exposure, grouping, statistics and affected-order rules     |
| 10                    | AI schemas, deterministic decisions, buyer/store bands and evaluation targets        |
| 11                    | All 42 endpoint contracts and response types                                         |
| 12                    | Encryption, privacy, authentication, approval, uploads and retention                 |
| 13                    | Production pitch only; not hackathon implementation                                  |
| 14–15                 | Monorepo, environment, conventions and two-person handoff                            |
| 16                    | Hriday's pre-H1 spike and H1–H8 brief                                                |
| 17                    | Ishaan's pre-I1 photos and I1–I7 brief; dependency only                              |
| 18–21                 | Checkpoints, B17 seed, A1–A14 and documented fallback options                        |
| 22                    | Original reference list, rechecked selectively in `research.md`                      |

| Submission sections | Use                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| 1–3                 | Submission premise, judging context and original feature mapping                                |
| 4–8                 | Prior art, data constraints, audience, incentives and attacks                                   |
| 9–11                | Fairfold experience, Shared Cause Detection and end-to-end story                                |
| 12–14               | Integration summary, AI principles and work split; detailed architecture governs implementation |
| 15–16               | Demo timings and subjective self-scores, not measured results                                   |
| 17                  | Risks and optional cuts; no cuts activated in this phase                                        |
| 18–19               | Ishaan's submission draft and references; publish only claims actually demonstrated             |

## Product requirements retained

| Requirement                                                            | Implementation responsibility                                                     | Source                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| Store Report beside PayPal checkout, with linked facts and reviews     | Ishaan builds report; Hriday supplies data/API host; Figma binds UI               | Submission 9; architecture 8 F1, 10–11 |
| Private Buyer Signal with reasons, recommendations and a contest route | Ishaan computes it; Hriday supplies captured payment/history and auth             | Architecture 10–12, 15                 |
| Pack Station AI check, batch/tracking label checks and sealed evidence | Hriday stores/seals; Ishaan attests; Figma captures photos                        | Architecture 7–8 F2, 10–11             |
| Tracking and gap detection                                             | Hriday                                                                            | Architecture 8 F2–F3, 16 H5–H6         |
| Dispute evidence or a fair offer after merchant approval               | Ishaan drafts/decides; Hriday executes against PayPal                             | Architecture 8 F4, 10, 16 H4           |
| Shared Cause Detection and approved preventive actions                 | Ishaan detects/proposes; Hriday executes holds, inspections, messages and refunds | Architecture 8 F5, 9, 15–17            |
| Agent checks trust before a human approves PayPal payment              | Hriday, using Ishaan's catalogue/report functions                                 | Architecture 8 F6, 16 H7               |
| Buyer pages and unified merchant dashboard                             | Figma frontend, supported by the fixed API                                        | Architecture 1, 11, 15                 |

The build never pools real cross-merchant buyer histories, replaces PayPal adjudication, changes Buyer Protection, or claims packing photographs prove what was inside a delivered parcel. Scores and statistics are code-driven. Synthetic network data is labelled. Authorized first-party history and verified-payment reviews supply the data; social scraping is not an implementation task.

The older submission architecture image includes optional sponsor services. D11 and the detailed build plan choose in-memory cosine over stored embeddings, PostgreSQL storage and Render. Preserve that later, specific choice. No additional provider or sponsor service has been added.
