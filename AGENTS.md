# Workspace Instructions

## Project

Triagem psicossocial

## Objective

Protótipo de questionário de triagem psicossocial do PET-Saúde GAT 9. Triagem, não diagnóstico. GitHub: https://github.com/GAT-9/triagem-psicossocial

## Gartrol operating contract

- Read `memory.md` and load the `workspace-context` skill before planning.
- Inspect repository state before editing.
- Use routed cards for executable work and encode dependencies explicitly.
- Claim a ready card before the first mutation; keep its lease alive while working.
- Maintain the card's single rolling checkpoint after commits, decisions and tests, and before long operations or handoff. Target 6,000 characters and never exceed 12,000.
- Resume by reading the checkpoint and Git state instead of replaying transcripts; never put credentials, lease tokens, raw transcripts or copied logs in a checkpoint.
- Deliver agent work as `done` with evidence. Only humans validate.
- When implementation and evidence are ready, deliver before waiting for pull-request review or merge. Never keep or pause an attempt solely to await review.
- Use `type(scope): imperative summary` for every commit and pull-request title. The scope is mandatory and must remain stable for the project.
- Follow Trunk-Based Development: `main` is the only trunk; use short-lived typed branches, keep incomplete work behind feature flags, and delete branches after verified integration.
- Treat one pull request as one coherent delivery, not as one incremental request. Batch related micro-adjustments on the same branch and keep commits atomic.
- Run the cheapest targeted checks while iterating, then the repository's required full gate once before integration. Require human review for high-risk changes; low-risk changes may auto-merge after required checks.
- Never push directly to `main` unless repository-specific guidance explicitly permits it.
- Pass multiline pull-request Markdown through `gh --body-file`, then verify it with `gh pr view`; never pass escaped `\n` sequences as body text.
- Never store credentials, lease tokens, or raw transcripts in project files.
- Create missing guidance files only; never overwrite existing guidance.
