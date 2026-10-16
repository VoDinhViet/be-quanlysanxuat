# Project overrides

These rules win over anything in `.claude/rules/ecc/` when they conflict. `ecc/` has been trimmed for this
project; re-running `/ecc:configure-ecc` can overwrite it, so read `git diff` before accepting.

## Not done in this project

- No tests: do not write them unless the user asks in that request. `ecc:tdd-guide` is never used.
- `ecc:planner` only for multi-module features (see `model-routing.md`).
- Never commit or push unless the user orders it in that request.
- Commit format is Conventional Commits with scope, in English: `feat(scope): description (PH-xxx)`.

## When a bug report arrives

A bug report is a PH row (Google Sheet "Tổng hợp") or a user message describing a wrong result. Use the existing ECC skills (`ecc:browser-qa`, `ecc:verification-loop`, `ecc:orch-fix-defect`) in this order. No tests are written (see above), so the "failing test" step of `orch-fix-defect` is replaced by reproducing in the browser.

1. Read the report: screen, steps, expected vs actual result, ticket ID.
2. Reproduce on the **local** stack only (Postgres 5433, BE + web dev servers) with `ecc:browser-qa` or the Playwright MCP, and note the request and response. If the reporter's data is not in the local DB, create `DEMO-*` records; never touch a remote DB.
3. Trace the root cause by reading code before editing (`Explore` on haiku; `opus` when it spans several files, per `model-routing.md`). Separate the root cause from side findings and ask before widening the scope.
4. Make the smallest fix, sized and reviewed the way `ecc:orch-fix-defect` does, minus the test step.
5. Verify with a trimmed `ecc:verification-loop` (`npx tsc --noEmit`, `pnpm lint`, read the diff), then repeat step 2 and confirm the symptom is gone, including the error path.
6. Log it in `wiki-qlsx/DANH-GIA-UNG-DUNG.md` (ID, reproduction, root cause, status), update `docs/CODEMAPS/` if a DTO, route or status changed, and run the reviewers in the next section. Data already corrupted by the bug is not repaired silently: tell the user which records need re-entering.

## After implementing code

When a coding unit is finished (a feature, a fix touching code, a PH ticket), run these without waiting to be asked, before the final `tsc` and `pnpm lint` and before any commit:

1. In parallel: `ecc:code-simplifier` on the changed files and `ecc:typescript-reviewer` on the diff (`ecc:react-reviewer` for `.tsx` in the web repo).
2. `ecc:security-reviewer` only for the triggers in `ecc/common/code-review.md` (new route, permission change, upload, raw `sql`, dynamic filter or sort, a caller outside a controller).
3. `ecc:database-reviewer` only for a migration or schema change.

How to run them:

- Give each agent a brief with the changed paths, the ticket, and the rules in this folder; pass `model` per `model-routing.md`.
- Reviewers are read-only. Fix CRITICAL and HIGH findings, then re-run `tsc` and `pnpm lint`; list MEDIUM and LOW in the reply and let the user decide.
- Do not apply a simplifier's rewrite blindly: keep behaviour, keep the naming rules, and drop suggestions that add abstraction.
- Tell the simplifier and reviewers to check the code against `naming.md`, `api-conventions.md` and the comments you added or touched against `comments.md` (why not what, no changelog or ticket tags, no pointer to a missing file or section, no claim the code contradicts).
- When a change adds or edits a route, a status transition, a table or a cross-domain call, update the matching file in `docs/CODEMAPS/` (by hand or with `/ecc:update-codemaps`) and refresh its `Generated:` header.
- Skip all of this for typo or comment-only edits, doc changes, sheet updates, and pure `.claude/` config edits.
- This never grants permission to commit or push.

## Hard rules

- **Verify with** `npx tsc --noEmit` and `pnpm lint`. Run existing specs only when they cover the code you touched. A spec that imports `PdfRendererService` must `jest.mock(...)` it (puppeteer is ESM-only).
- **Never run destructive scripts or `pnpm db:migrate`** against the remote dev/prod databases without approval. `drizzle-kit` is interactive: ask the user to run it.
- ECC `testing.md` files, `performance.md` and both `hooks.md` files were deliberately left out of `ecc/`; do not re-add them.
