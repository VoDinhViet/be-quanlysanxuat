# Database (Drizzle) Rules

Reference implementation: `src/database/schemas/users.ts`.

- Schemas live in `src/database/schemas/`, declared with `pgTable('snake_case_name', {...})`.
- DB column names are **snake_case**, TS object keys are **camelCase**: `fullName: varchar('full_name', { length: 255 })`.
- Primary key: `id: uuid('id').defaultRandom().primaryKey()`.
- Timestamps: `createdAt: timestamp('created_at').defaultNow().notNull()` and `updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date())`.
- Enums are declared as a paired TS `enum` + `pgEnum('snake_name', [...])`, e.g. `UserStatus` / `userStatusEnum`.
- Every new/changed schema file **must** be re-exported from `src/database/schemas/index.ts` — `drizzle-kit` only reads that file. Then run `pnpm db:generate` followed by `pnpm db:migrate`.
- **Reality check — no soft delete exists yet**: the `users` table has no `deletedAt` column and no query filters with `isNull(deletedAt)`. Do not assume this pattern is already in place for other tables; if a module needs soft delete, decide and implement the column + filter explicitly rather than assuming it's already there.

## Seeds

Reference implementation: `src/database/seeds/material-groups.seed.ts` (simple), `src/database/seeds/credentials.seed.ts` (multi-entity, cross-referencing).

- File name: **`<name>.seed.ts`** in `src/database/seeds/` — no `seed-` prefix, the `.seed.ts` suffix already says what it is.
- Each seed file gets a matching `db:seed:<name>` script in `package.json`, e.g. `"db:seed:units": "ts-node src/database/seeds/units.seed.ts"`.
- Seeds **must be idempotent**: look up the row by its unique key (`code`, `username`, ...) with `findFirst` before `insert`; skip (log it) if it already exists. Never blind-insert.
- Standard skeleton: `dotenv.config(...)` (env file, then plain `.env` fallback) → open a `postgres()`/`drizzle()` connection → `main()` calls the exported seed function → `client.end()` in a `finally` → `if (require.main === module)` guard that runs `main()` and calls `process.exit(0)`/`process.exit(1)`.
- Don't use the `drizzle-seed` package (unused elsewhere in this repo) — plain Drizzle `insert`/`findFirst` is the established pattern.
