# Hriday research and execution guide

This guide turns the existing Fairfold documents into an ordered work queue for Hriday. It preserves the idea, the chosen architecture and the PayPal-only payment integration. The user first selected research and documents, then authorized building H1 around the absent sandbox accounts on 9 November 2026.

Read and act in this order:

1. [Current status](status.md): what exists, what remains untested, and the immediate action.
2. [Source contract](source-contract.md) and [decisions](../../DECISIONS.md): fixed requirements, source locations and questions requiring joint review.
3. [PayPal research](research.md): verified facts, source dates, limits and unresolved runtime behavior.
4. [Sandbox dispute spike](sandbox-spike.md): Hriday's explicit pre-H1 assignment, with concrete steps and an evidence record.
5. [H1–H8 execution plan](execution-plan.md): implement one task at a time only after the research phase.
6. [Contract and handoff inventory](contracts-handoff.md): endpoints, jobs, tables and the boundaries with Ishaan and the Figma frontend.
7. [Validation plan](validation.md): A1–A14 and the evidence required to call a task complete.
8. [Demo and submission preparation](submission.md): show the same B17 story and substantiate every claim.

The [H1 foundation guide](h1-foundation.md) records the implemented local setup, tests, actual endpoints, handoff and pending deployment gate.

Use the [evidence record template](evidence/README.md) for real runs. Keep unredacted working files under ignored `docs/hriday/evidence/local/` or `.work/`; publish only sanitized summaries. Maintain the root [changelog](../../CHANGELOG.md).

The explicitly allocated research task is the sandbox dispute spike in architecture section 16. The source verification, contract inventory, execution breakdown and submission evidence plan here support that task; they are not a reassignment of Ishaan's research, intelligence, evals, Devpost text or narration.

The planning pass is complete when the documents are reviewed and traceable. H1–H8 remain incomplete until their actual acceptance checks pass. A source-verified API capability is not a successful sandbox call, a seed is not a real transaction, and a target metric is not a measured result.
