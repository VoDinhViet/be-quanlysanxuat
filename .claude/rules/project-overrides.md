# Project overrides

These rules win over anything in `.claude/rules/ecc/` when they conflict.

## Where ECC is overridden

| ECC says | In this project |
|---|---|
| TDD, "write tests first", `tdd-guide` agent (`development-workflow.md`, `agents.md`) | Skip. Do not write tests unless the user asks in that request |
| "Tests exist for new functionality", "coverage >= 80%" (`code-review.md`) | Skip both checklist items and the coverage step in the review workflow |
| Immutability "NEVER mutate" (`coding-style.md`) | Applies to plain data only; do not rewrite Drizzle query builders or Nest providers to fit it |
| CSRF protection, rate limiting on all endpoints (`security.md`) | Not applicable: stateless JWT API with no cookies. Rate limiting is a deployment decision, not a per-change check |
| Use `ecc:planner` "proactively" and `ecc:tdd-guide` on every feature (`agents.md`) | `ecc:planner` only for multi-module features (see `model-routing.md`); never `ecc:tdd-guide` |
| "Commit & Push" step (`development-workflow.md`, `git-workflow.md`) | Never commit or push unless the user orders it in that request |
| Commit format `<type>: <description>` | Use Conventional Commits with scope, in English: `feat(scope): description (PH-xxx)` |

## Hard rules

- **Verify with** `npx tsc --noEmit` and `pnpm lint`. Run existing specs only when they cover the code you touched. A spec that imports `PdfRendererService` must `jest.mock(...)` it (puppeteer is ESM-only).
- **Never run destructive scripts or `pnpm db:migrate`** against the remote dev/prod databases without approval. `drizzle-kit` is interactive: ask the user to run it.
- ECC `testing.md` files, `performance.md` and both `hooks.md` files were deliberately left out of `ecc/`; do not re-add them.
