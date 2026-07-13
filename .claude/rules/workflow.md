# Workflow Rules

- Package manager is **pnpm**. Never use `npm` or `yarn` commands in this repo.
- Before considering a change done: run `pnpm lint` and the relevant `pnpm test` file(s); make sure `pnpm build` stays clean.
- **Never run `pnpm db:migrate` against a shared/prod database** without explicit user approval.
- Drizzle schema changes follow edit → re-export in `schemas/index.ts` → `pnpm db:generate` → `pnpm db:migrate`, in that order (full detail in `.claude/rules/database.md`).
- Don't assume removed business modules (clients/suppliers/products/orders/roles) or the old RBAC schema exist — they were deleted. Don't search for them or recreate them unless explicitly asked.
- Talk to the user in Vietnamese. Write code, comments, and commit messages in English. Follow Conventional Commits for commit messages (`feat:`, `fix:`, `refactor:`, ...).
- Before implementing a new feature (or a non-trivial change to business rules of an existing one), write or update a short spec at `docs/features/<feature>.md` (copy `docs/features/_TEMPLATE.md`; see `docs/features/users.md` for a filled example). It captures business rules, the API contract, error cases, and a dated "Frontend integration notes" section for any consumer-facing (breaking) change — not implementation details, which the other rule files already cover. Skip this for pure bug fixes or refactors that don't change behavior.
