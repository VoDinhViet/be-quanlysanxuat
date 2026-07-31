# General Rules

Cách làm việc trong repo: công cụ, thao tác nguy hiểm, ngôn ngữ, commit.

## Tooling

- MUST use **pnpm**. MUST NOT run `npm` or `yarn`.
- MUST NOT run `pnpm build`/`lint`/`format` after every small edit — only once at the end of a larger unit of work, or when asked.
- MUST validate a finished unit of work with `pnpm lint` + `npx tsc --noEmit` + `pnpm build`.

## Dangerous operations

- MUST NOT run `pnpm db:migrate` against a shared/prod database without explicit user approval — `DATABASE_URL` in `.env` points at a remote shared DB, not localhost.
- MUST NOT create/update `*.spec.ts` or run `pnpm test*` unless explicitly asked (`docs/decisions/testing-paused.md`).
- MUST NOT commit unless asked. MUST follow Conventional Commits (`feat:`, `fix:`, `refactor:`, ...).

## Language

- MUST talk to the user in **Vietnamese**.
- MUST write identifiers, file names, and commit messages in **English**.
- MUST write code comments in **Vietnamese** (`.claude/rules/documentation.md`).
