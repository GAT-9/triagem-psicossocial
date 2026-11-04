# Workspace Memory

Durable, non-secret context for **Triagem psicossocial**.

## Objective

Protótipo de questionário de triagem psicossocial do PET-Saúde GAT 9. Triagem, não diagnóstico. GitHub: https://github.com/GAT-9/triagem-psicossocial

## Durable decisions

- Gartrol is the source of truth for cards, claims, leases, deliveries, commits, and evidence.
- Agents deliver cards as `done`; only humans validate or reject them. Pull-request review or merge is not a prerequisite for delivery.

## Conventions

- Read `AGENTS.md` before editing.
- Use Conventional Commits with a mandatory stable scope: `type(scope): imperative summary`.
- Follow Trunk-Based Development with `main` as the only trunk and short-lived topic branches.
- Treat one pull request as one coherent delivery; batch related micro-adjustments and keep commits atomic.
- Run targeted checks while iterating and the required full gate once before integration; require human review for high-risk changes.
- Use `gh --body-file` for multiline pull-request Markdown and verify the published body.
- Record only concise facts that remain useful across sessions.
- Never store credentials, lease tokens, raw transcripts, or temporary status.
