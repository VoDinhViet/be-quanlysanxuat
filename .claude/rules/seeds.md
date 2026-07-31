# Seed Rules

Not `@import`ed — read when writing a seed file. Pointer: `.claude/rules/database.md`, Seeds.

Reference: `units.seed.ts` (simple curated), `credentials.seed.ts` (multi-entity curated), `clients.seed.ts` (bulk fake via `drizzle-seed`).

- MUST name the file `<name>.seed.ts` in `src/database/seeds/` and add a matching `db:seed:<name>` script to `package.json`. MUST NOT use a `seed-` prefix.
- MUST follow the standard skeleton: `dotenv.config(...)` (env file, then `.env` fallback) → open `postgres()`/`drizzle()` → `main()` calls the exported seed function → `client.end()` in a `finally` → `if (require.main === module)` guard calling `process.exit(0)`/`process.exit(1)`.
- MUST make every seed idempotent — safe to run repeatedly, never duplicating data.
  - **Curated data** (roles, departments, positions, credentials, groups): MUST look up each row by its unique key (`code`, `username`, ...) with `findFirst` before inserting, and skip + log if it exists. MUST NOT blind-insert.
  - **Bulk fake data** (`drizzle-seed`): `seed()` has no per-row idempotency, so MUST gate the whole call behind a single `findFirst` on a known key and skip entirely if it already ran.
- MUST NOT call `drizzle-seed`'s `reset()` (it `TRUNCATE ... CASCADE`s) unless wiping those tables is the seed's explicit purpose.
- MUST supply Vietnamese fake values via `f.valuesFromArray({ values: [...] })` — `drizzle-seed`'s built-in generators (`companyName()`, `fullName()`, `city()`) have no Vietnamese locale.
