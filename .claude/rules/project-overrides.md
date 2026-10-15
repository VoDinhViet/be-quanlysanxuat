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

## After implementing code

When a coding unit is finished (a feature, a fix touching code, a PH ticket), run these without waiting to be asked, before the final `tsc` and `pnpm lint` and before any commit:

1. `ecc:code-simplifier` on the changed files.
2. In parallel with it, `ecc:code-reviewer` on the diff. Add `ecc:typescript-reviewer` for backend TypeScript and `ecc:react-reviewer` for `.tsx` changes in the web repo.
3. `ecc:security-reviewer` when the change adds or edits a route, a permission, input handling, a database write or query, or a file operation (the triggers in `ecc/common/code-review.md`). Add `ecc:database-reviewer` for a migration or schema change.

How to run them:

- Give each agent a brief with the changed paths, the ticket, and the rules in this folder; pass `model` per `model-routing.md`. Run independent ones in one parallel message.
- Reviewers are read-only. Fix CRITICAL and HIGH findings, then re-run `tsc` and `pnpm lint`; list MEDIUM and LOW in the reply and let the user decide.
- Do not apply a simplifier's rewrite blindly: keep behaviour, keep the naming rules, and drop suggestions that add abstraction.
- When a change adds or edits a route, a status transition, a table or a cross-domain call, update the matching file in `docs/CODEMAPS/` (by hand or with `/ecc:update-codemaps`) and refresh its `Generated:` header.
- Skip all of this for typo or comment-only edits, doc changes, sheet updates, and pure `.claude/` config edits.
- This never grants permission to commit or push; the "Commit & Push" row above still applies.

## Hard rules

- **Verify with** `npx tsc --noEmit` and `pnpm lint`. Run existing specs only when they cover the code you touched. A spec that imports `PdfRendererService` must `jest.mock(...)` it (puppeteer is ESM-only).
- **Never run destructive scripts or `pnpm db:migrate`** against the remote dev/prod databases without approval. `drizzle-kit` is interactive: ask the user to run it.
- ECC `testing.md` files, `performance.md` and both `hooks.md` files were deliberately left out of `ecc/`; do not re-add them.
