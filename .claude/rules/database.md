# Database (Drizzle) Rules

Reference implementation: `src/database/schemas/users.ts`.

- Schemas live in `src/database/schemas/`, declared with `pgTable('snake_case_name', {...})`.
- DB column names are **snake_case**, TS object keys are **camelCase**: `fullName: varchar('full_name', { length: 255 })`.
- Primary key: `id: uuid('id').defaultRandom().primaryKey()`.
- Timestamps: `createdAt: timestamp('created_at').defaultNow().notNull()` and `updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date())`.
- Enums are declared as a paired TS `enum` + `pgEnum('snake_name', [...])`, e.g. `UserStatus` / `userStatusEnum`.
- Every new/changed schema file **must** be re-exported from `src/database/schemas/index.ts` — `drizzle-kit` only reads that file. Then run `pnpm db:generate` followed by `pnpm db:migrate`.
- **Reality check — no soft delete exists yet**: the `users` table has no `deletedAt` column and no query filters with `isNull(deletedAt)`. Do not assume this pattern is already in place for other tables; if a module needs soft delete, decide and implement the column + filter explicitly rather than assuming it's already there.
