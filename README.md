# Fairfold

Fairfold is a neutral AI witness for both sides of a PayPal payment. Packing evidence supports the merchant, a cited Store Report informs the buyer, and Shared Cause Detection links complaints to possible problems before more orders ship. PayPal holds the payment and decides disputes.

Hriday and Ishaan are preparing this project for the PayPal AI Hackathon. The documented audience is Indian apparel exporters selling to overseas PayPal buyers.

**Current state, 9 November 2026:** research and execution documentation only. There is no application, runnable demo, deployment, or measured AI evaluation in this checkout yet. Work is on `Hriday`. The existing idea and architecture remain the governing specification.

Start with the [Hriday work guide](docs/hriday/README.md). It links the sequential build plan, verified PayPal research, sandbox dispute runbook, responsibilities, acceptance tests, and submission preparation.

- [Current status and next action](docs/hriday/status.md)
- [Architecture decisions and open questions](DECISIONS.md)
- [Change history](CHANGELOG.md)
- [Contributor instructions](AGENTS.md)

The internal source documents remain local and are excluded from Git. Future setup and run commands are described as acceptance targets, not as commands that work today. The final application README will be completed in H8 after those targets pass.

Licensed under the [MIT License](LICENSE).
