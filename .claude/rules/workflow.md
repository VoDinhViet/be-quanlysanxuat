# Workflow Rules

- MUST use **pnpm**. MUST NOT run `npm` or `yarn`.
- MUST NOT run `pnpm build`/`lint`/`format` after every small edit — only once at the end of a larger unit of work, or when asked.
- MUST NOT create/update `*.spec.ts` or run `pnpm test*` unless explicitly asked (testing paused repo-wide — see `.claude/rules/testing.md`).
- MUST NOT run `pnpm db:migrate` against a shared/prod database without explicit user approval.
- MUST talk to the user in **Vietnamese**; MUST write identifiers and commit messages in **English**; MUST write code comments in **Vietnamese** (`.claude/rules/code-docs.md`).
- MUST follow Conventional Commits (`feat:`, `fix:`, `refactor:`, ...). MUST NOT commit unless asked.
- MUST write/update `docs/features/<feature>.md` before implementing a new feature or changing an existing feature's business rules. Skip for pure bug fixes and behavior-preserving refactors.
- MUST put cross-module facts (how two modules' data connects, write order spanning modules) in `docs/architecture.md`, not in a feature doc.
- MUST NOT put business rules in `.claude/rules/*` or `CLAUDE.md` — they belong in `docs/features/<feature>.md`.
