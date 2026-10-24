# Project overrides

These rules win over anything in `.claude/rules/ecc/` when they conflict. `ecc/` is the unmodified ECC
2.2.3 rule set (`common` + `typescript`); every project-specific change to it lives in this file, in
"Project deltas to ECC rules" below. Re-copying `ecc/` from the plugin is safe as long as this file stays.

## Not done in this project

- No spec files: do not write unit or integration specs unless the user asks in that request.
  `ecc:tdd-guide` is never used, and the ECC TDD and 80% coverage requirements do not apply.
- After finishing each PH ticket, run an end-to-end check of the whole affected flow on the local stack
  (Playwright MCP or `ecc:browser-qa`, `DEMO-*` data, request, response and error path), and report
  what passed and failed. The user asked for this on 2026-10-24.
- `ecc:planner` only for multi-module features (see `model-routing.md`).
- Never commit or push unless the user orders it in that request.
- Commit format is Conventional Commits with scope, in English: `feat(scope): description (PH-xxx)`.

## When a bug report arrives

A bug report is a PH row (Google Sheet "Tổng hợp") or a user message describing a wrong result. Use the existing ECC skills (`ecc:browser-qa`, `ecc:verification-loop`, `ecc:orch-fix-defect`) in this order. No spec files are written (see above), so the "failing test" step of `orch-fix-defect` is replaced by reproducing in the browser.

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

## Project deltas to ECC rules

Each bullet replaces the matching part of the ECC file named in bold.

- **security.md**:
  - All user input is validated by a request DTO.
  - Queries are parameterized (Drizzle, or a `sql` template with bound values).
  - Only controllers check permissions, with `@Permissions`; services do not.
  - CSRF and rate limiting do not apply: this is a stateless JWT API with no cookies, and rate limiting
    is a deployment decision.
  - A required secret that is missing stops the app at boot (see `config.md`).
- **coding-style.md** (common and typescript):
  - Immutability applies to plain data only; do not rewrite Drizzle query builders or Nest providers to
    fit it.
  - Prefer string literal unions over `enum`, except the domain enums mirrored as `pgEnum` (see
    `database.md`).
  - Services throw `AppException` with an `ErrorCode` (see `api-conventions.md`), not a bare `Error`.
  - Request DTOs use `src/decorators/field.decorators.ts`; no Zod, no raw class-validator decorators.
  - Log with the Nest `Logger`, never `console.log` in `src/`.
- **code-review.md**:
  - Run `security-reviewer` when a change adds a route or edits `@Permissions` / `@Public`, touches
    auth, JWT or credentials, handles upload or a filesystem path, builds raw `sql` or a query from
    dynamic filter or sort input, is reachable from outside a controller, or calls an external API or
    uses cryptography.
  - An ordinary Drizzle read or write inside an existing, guarded route is not a trigger on its own.
  - MEDIUM findings are listed for the user, not fixed unasked.
  - No coverage gate (see "Not done in this project").
- **agents.md**: pass `model` on every Agent call per `model-routing.md`; `ecc:tdd-guide` is never used;
  the agents to run after code are in "After implementing code" above.
- **git-workflow.md**: commit as `feat(scope): description (PH-xxx)` in English. `includeCoAuthoredBy`
  is `false`, so no `Co-Authored-By` trailer.
- **performance.md**: model choice follows `model-routing.md`, not the ECC model table.
- **development-workflow.md**: no PRD or planning-doc pipeline and no GitHub or registry search before
  every change. Plan mode is used per `model-routing.md`, and the rest of the flow follows this file.
- **hooks.md** (common and typescript): the project hooks are `.claude/hooks/format-on-edit.js`
  (Prettier) and `.claude/hooks/typecheck-on-stop.js`; the ECC hook profile is set by
  `ECC_HOOK_PROFILE` in `.claude/settings.local.json`.
