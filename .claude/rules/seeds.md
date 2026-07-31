# Seed Rules

Not `@import`ed by `CLAUDE.md` — read this when actually writing a seed file. Pointer:
`.claude/rules/database.md`, Seeds section.

Reference implementation: `src/database/seeds/units.seed.ts` (simple), `src/database/seeds/credentials.seed.ts` (multi-entity, cross-referencing) — both curated data; `src/database/seeds/clients.seed.ts` (bulk fake data via `drizzle-seed`).

- File name: **`<name>.seed.ts`** in `src/database/seeds/` — no `seed-` prefix, the `.seed.ts` suffix already says what it is.
- Each seed file gets a matching `db:seed:<name>` script in `package.json`, e.g. `"db:seed:units": "ts-node src/database/seeds/units.seed.ts"`.
- Standard skeleton: `dotenv.config(...)` (env file, then plain `.env` fallback) → open a `postgres()`/`drizzle()` connection → `main()` calls the exported seed function → `client.end()` in a `finally` → `if (require.main === module)` guard that runs `main()` and calls `process.exit(0)`/`process.exit(1)`.
- Seeds **must be idempotent** (safe to run repeatedly, never duplicate data) — two patterns depending on what's being seeded:
  - **Curated/reference data** (roles, departments, positions, credentials, groups, and other small, fixed business data): per-row — look up by its unique key (`code`, `username`, ...) with `findFirst` before `insert`; skip (log it) if it already exists. Never blind-insert.
  - **Bulk fake data for testing** (large volume, not meant to be exact/curated, e.g. `clients.seed.ts`): the `drizzle-seed` package (`import { seed } from 'drizzle-seed'`) may be used — `seed(db, { table1, table2 }).refine((f) => ({ ... }))`. It has **no built-in per-row idempotency**, so gate the whole call with a single check (e.g. `findFirst` on a known first-row key) and skip calling `seed()` entirely if it already ran. Never call `reset()` (it `TRUNCATE ... CASCADE`s the given tables) unless the seed's explicit purpose is to wipe and reseed those tables. `drizzle-seed`'s built-in generators (`companyName()`, `fullName()`, `city()`, ...) have **no Vietnamese locale** — supply Vietnamese fake values via `f.valuesFromArray({ values: [...] })` with a hand-written pool instead.
