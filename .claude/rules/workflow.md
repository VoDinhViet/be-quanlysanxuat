# Workflow Rules

- MUST use **pnpm**. MUST NOT run `npm` or `yarn`.
- MUST NOT run `pnpm build`/`lint`/`format` after every small edit — only once at the end of a larger unit of work, or when asked.
- MUST NOT create/update `*.spec.ts` or run `pnpm test*` unless explicitly asked (testing paused repo-wide — see `.claude/rules/testing.md`).
- MUST NOT run `pnpm db:migrate` against a shared/prod database without explicit user approval.
- MUST talk to the user in **Vietnamese**; MUST write identifiers and commit messages in **English**; MUST write code comments in **Vietnamese** (`.claude/rules/code-docs.md`).
- MUST follow Conventional Commits (`feat:`, `fix:`, `refactor:`, ...). MUST NOT commit unless asked.
- MUST write/update docs before implementing a new feature or changing business rules, in the right layer. Skip for pure bug fixes and behavior-preserving refactors.
  - `docs/architecture.md` — cross-module facts: how two modules' data connects, write order spanning modules.
  - `docs/domains/<domain>.md` — the **why**: concepts, lifecycle/state machine, business rules, invariants, cross-domain dependencies, common mistakes.
  - `docs/features/<module>.md` — the **what**: API contract table, error codes, DTO shapes.
- MUST NOT put business rules in `.claude/rules/*` or `CLAUDE.md` — they belong in `docs/domains/`.
- MUST NOT restate a domain concept in a feature doc — link to the domain doc instead.
