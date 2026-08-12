# Database (Drizzle) Rules

Reference: `src/database/schemas/users.ts`, `src/database/schemas/clients.ts` (soft delete).

- MUST declare schemas in `src/database/schemas/` with `pgTable('snake_case_name', {...})`.
- MUST use snake_case DB column names with camelCase TS keys: `fullName: varchar('full_name', { length: 255 })`.
- MUST use `id: uuid('id').defaultRandom().primaryKey()` as the primary key.
- MUST declare timestamps as `createdAt: timestamp('created_at').defaultNow().notNull()` and `updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date())`.
- MUST declare enums as a paired TS `enum` + `pgEnum('snake_name', [...])` (e.g. `UserStatus` / `userStatusEnum`).
- MUST re-export every new/changed schema file from `src/database/schemas/index.ts` — `drizzle-kit` reads only that file — then run `pnpm db:generate` followed by `pnpm db:migrate`, in that order.
- MUST NOT hand-edit a generated migration except to add a data migration (e.g. backfilling a column, remapping enum values before a cast).
- MUST export `export type XSelect = typeof x.$inferSelect;` right after a table's `relations(...)` block (e.g. `OperationSelect`, `FileSelect`, `BomItemSelect`, `UnitSelect`) — a consumer needing that table's row shape imports `XSelect` from `src/database/schemas`, never re-derives `typeof x.$inferSelect` inline at the call site.

## Soft delete

Seven tables carry `deletedAt`: `clients`, `orders`, `suppliers` (deleted via API) plus `items`, `users`, `roles`, `operations` (column + read filters only, no delete route). Every other table hard-deletes — including `inventory_receipts`/`inventory_issues` (hard delete, only while `DRAFT`; `CANCELLED` is the "voided" state, not a second delete mechanism).

- MUST declare it as a nullable `deletedAt: timestamp('deleted_at')` — no default, no `notNull`.
- MUST delete by `.set({ deletedAt: new Date() })` on a table that has the column. MUST NOT call `db.delete()` on one.
- MUST filter every read with `isNull(<table>.deletedAt)` — list, detail, existence checks, and FK-validation lookups alike. Forgetting it leaks deleted rows.
- Uniqueness on these tables is a plain `.unique()` on the column, **not** scoped to live rows — a soft-deleted row keeps holding its `code`, so that code can never be reused. MUST NOT switch it to a partial unique index without asking; that changes behaviour for existing data.
  **Exception:** `items.code` — a `uniqueIndex(...).where(sql`deleted_at IS NULL`)`` (`uq_items_code_active`), scoped to live rows on purpose, because `code` is also auto-generated (`VTxxxx`/`SPxxxx`) and a permanently-dead code would waste a slot in that sequence for no reason. Asked and approved; don't treat this as the default — every other table in this list still follows the plain-`.unique()` rule above.
- MUST NOT add `deletedAt` to a new table unless the module actually needs it — decide explicitly.
- MUST NOT read a partial index ending in ``.where(sql`deleted_at IS NULL`)`` as enforcing anything **except `uq_items_code_active`** (e.g. `idx_clients_status`, a same-shaped index on a different table, exists for query performance only, not enforcement) — check the index's own name/prefix (`uq_` vs `idx_`) before assuming either way.

## Seeds

- MUST name seed files `<name>.seed.ts` in `src/database/seeds/` and add a matching `db:seed:<name>` script to `package.json`.
- MUST make every seed idempotent. Read `.claude/rules/seeds.md` before writing one.
