# Fairfold working instructions

## Current phase and source authority

- The user confirmed on 2026-11-09: research and documents first; no application code yet. This delivery must not create application scaffolding, install packages, deploy services, or claim implementation is complete.
- Work only on the exact case-sensitive branch `Hriday`. This user instruction overrides the internal plan's branches per task and instructions to push directly to main. Do not merge or force-push main.
- Read `docs/hriday/README.md`, `DECISIONS.md`, and `docs/hriday/status.md` before continuing.
- The authoritative local sources are `docs/internal/Fairfold — PayPal AI Hackathon Submission.docx` and `docs/internal/Fairfold — Solution Architecture and Build Plan.docx`. Their sections are indexed in `docs/hriday/source-contract.md`. Read the relevant originals before implementing a task; derived documents do not replace them.
- `docs/internal/README.md` explicitly prohibits committing any file in that directory. Never stage the originals, extracted copies, or their embedded diagrams. Keep local inspection output in ignored `.work/`.
- Preserve the idea, D1–D18, shared contracts, H1–H8 order, and ownership. Record uncertainty in `DECISIONS.md`; do not silently redesign. Shared-contract changes require the other person's review as specified in the architecture.

## Implementation rules for the next phase

- Hriday implements architecture section 16, in order H1 through H8. Ishaan owns `packages/ai`, `packages/intelligence`, and `apps/api/src/routes/intel/` after the H1 handoff. H1 may create only the skeletons expressly required by that brief.
- All PayPal operations are sandbox only, through `packages/paypal`; the shopper's documented toolkit integration must explicitly set `context.sandbox = true`. Never call live endpoints.
- All model calls go through `packages/ai`. Code computes scores, recommendations and statistics. Models describe, extract, draft and explain.
- Frontend design and implementation come from Figma. Hriday owns only the unstyled `/dev` harness and the documented API/MCP integration surfaces.
- No pooling real buyer histories across merchants. Label synthetic network data and seeded PayPal identifiers. PayPal holds funds and decides disputes.
- Every evidence submission, hold, message, offer and refund requires the documented human approval. Reading a research runbook is not an approved action row.
- Follow architecture section 7 exactly for schema and ledger hashing. Use decimal strings for money, UTC timestamps and an injected clock.
- Preserve raw webhook bytes for signature verification. Never process unverified messages or treat simulator postback failures as permission to skip verification.
- Keep secrets, tokens, passwords, raw buyer email/street addresses, and unsanitized vendor payloads out of commits and logs. Resolve the open raw-payload question before persistent capture fixtures.
- For implementation tasks, run the specified acceptance checks and `pnpm typecheck` before a task commit. Start messages with `H1:`, `H2:`, etc. Documentation-only preparation uses `DOCS:` and does not complete an H task.
- Update `CHANGELOG.md`, task status and evidence records with every meaningful work unit. `NOT RUN`, `PASS`, `FAIL`, and `BLOCKED` must reflect actual observations. Never manufacture metrics, sandbox successes, deployment URLs or judging outcomes.

## Scope changes and release

- Do not activate optional sponsor integrations, production partner onboarding, new payment providers, scope cuts or alternate architecture. Existing fallback descriptions are options to discuss, not authorization to alter the user's idea.
- Do not send messages to Ishaan or submit to Devpost/YouTube unless explicitly instructed. Prepare reviewable handoff material locally.
- A remote push, if requested, must contain only reviewed tracked files on `Hriday`. Check that no `docs/internal/` path or secret is staged before publishing.
