# Decisions

Judgement calls made while building Fairfold. Each entry names who made it and whether it changes the shared contract (sections 3, 7–11, 15 of the architecture doc). Contract changes need the other person's approval.

## Ishaan (intelligence)

### I-D1 — AI provider is Grok (xAI) — 2026-11-09
- `AI_PROVIDER=xai` through the Vercel AI SDK provider `@ai-sdk/xai`, with key `XAI_API_KEY`. `AI_MODEL_VISION` and `AI_MODEL_TEXT` hold Grok model ids.
- `packages/ai` still supports `openai | anthropic | google` (D10 is unchanged).
- Embeddings: `AI_EMBEDDING_PROVIDER` (default = `AI_PROVIDER`). If the chosen provider has no embedding model in the AI SDK, `embed()` throws `EMBEDDING_PROVIDER_UNSUPPORTED` with a clear message instead of failing silently.
- Contract change: none. `.env.example` (Hriday) should add `XAI_API_KEY` and `xai` to the `AI_PROVIDER` options.

### I-D2 — Buyer Signal points: no double count for lost disputes; refund ratio +10 — 2026-11-09
- The section 10 table made the seeded buyer "Alex R." red (at least 35 points), while sections 17 and 19 require him to be yellow for the video.
- Change:
  - OWN_DISPUTES_FILED (+10 each, max +30) counts only disputes the buyer did **not** lose.
  - OWN_DISPUTES_LOST (+15 each, max +30) counts the lost ones.
  - OWN_REFUND_RATIO is **+10** (was +15).
- Alex: OWN_DISPUTES_LOST 15 + OWN_REFUND_RATIO 10 + NEW_ADDRESS 5 + PAYER_VERIFIED −5 = 25 → yellow.
- Contract change: **yes**, to section 10's points table. Needs Hriday's approval.

### I-D5 — Alex R.'s seeded history must give a refund ratio above one half — 2026-11-09
- OWN_REFUND_RATIO needs at least 2 orders with **more than** half refunded. With "one earlier refund" over 2 orders (exactly half), the rule cannot fire. The eval profile therefore gives Alex 2 earlier orders, both refunded, one of which he later disputed and lost, plus a new ship-to address.
- Action for Hriday's `scripts/seed.ts`: seed Alex's history to match this profile (`packages/intelligence/eval/fixtures/buyers.json`, id `b15`).
- Contract change: none (seed data only).

### I-D3 — Dispute messages are appended, not new complaint rows — 2026-11-09
- Section 9 lists a `dispute_message` source, but the `complaints.source` check constraint allows only `buyer_report | dispute | review`, and section 7 says dispute messages are appended to the dispute's complaint text. We follow section 7.
- Contract change: none.

### I-D4 — Contracts shim until H1 lands — 2026-11-09
- `packages/intelligence/src/contracts.ts` temporarily copies the section 9–11 types verbatim, so Ishaan's packages build and test before `packages/contracts` exists.
- When H1 merges, its body becomes `export * from '@fairfold/contracts'`.
- Intel route schemas live in `packages/intelligence/src/schemas/intel.ts` until the pull request moves them to `packages/contracts/src/intel.ts`.
- Contract change: none.
