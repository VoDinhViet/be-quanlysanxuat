# Database (Drizzle) Rules

Reference: `src/database/schemas/users.ts`. Soft delete: `src/database/schemas/roles.ts`.

- MUST declare schemas in `src/database/schemas/` with `pgTable('snake_case_name', {...})`.
- MUST use snake_case DB column names with camelCase TS keys: `fullName: varchar('full_name', { length: 255 })`.
- MUST use `id: uuid('id').defaultRandom().primaryKey()` as the primary key.
- MUST declare timestamps as `createdAt: timestamp('created_at').defaultNow().notNull()` and `updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date())`.
- MUST declare enums as a paired TS `enum` + `pgEnum('snake_name', [...])` (e.g. `UserStatus` / `userStatusEnum`).
- MUST re-export every new/changed schema file from `src/database/schemas/index.ts` — `drizzle-kit` reads only that file — then run `pnpm db:generate` followed by `pnpm db:migrate`, in that order.
- MUST NOT hand-edit a generated migration except to add a data migration (e.g. backfilling a column, remapping enum values before a cast).

## Soft delete

Two tables carry `deletedAt` in this template: `roles` (column + `isNull(roles.deletedAt)` on every
read, no delete route) and `users` (column exists but **no query filters on it today** —
`docs/domains/identity-access.md`, mistake #5; don't copy that, it's a known gap, not the pattern to
follow). Every other table hard-deletes.

- MUST declare it as a nullable `deletedAt: timestamp('deleted_at')` — no default, no `notNull`.
- MUST delete by `.set({ deletedAt: new Date() })` on a table that has the column. MUST NOT call `db.delete()` on one.
- MUST filter every read with `isNull(<table>.deletedAt)` — list, detail, existence checks, and FK-validation lookups alike. Forgetting it leaks deleted rows.
- Uniqueness on these tables is a plain `.unique()` on the column, **not** scoped to live rows — a soft-deleted row keeps holding its `code`, so that code can never be reused. MUST NOT switch it to a partial unique index without asking; that changes behaviour for existing data.
- MUST NOT add `deletedAt` to a new table unless the module actually needs it — decide explicitly.
- MUST NOT read a partial index ending in ``.where(sql`deleted_at IS NULL`)`` as enforcing anything — those exist for query performance only, not as a constraint.

## Seeds

- MUST name seed files `<name>.seed.ts` in `src/database/seeds/` and add a matching `db:seed:<name>` script to `package.json`.
- MUST make every seed idempotent. Read `.claude/rules/seeds.md` before writing one.
