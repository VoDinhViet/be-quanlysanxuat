# Database Standards

## Database Iron Laws

- Use `generatedAlwaysAsIdentity()` for PostgreSQL integer/generated primary keys. Never use `serial()`.
- Never use `drizzle-kit push` in production or shared environments. Use `pnpm.cmd db:generate` and `pnpm.cmd db:migrate`.
- Define `relations()` alongside table definitions whenever the relational query API may use nested `with:` clauses.
- Never delete, rename, or reorder applied migration files because `__drizzle_migrations__` tracks applied migration checksums.
- Import query operators such as `eq`, `and`, `or`, `gt`, and `inArray` from `drizzle-orm`. Do not use raw strings or custom predicates for client-driven filters.

## Naming

Tables:

- snake_case
- plural business nouns when the table stores a collection, for example `users`, `roles`, `sales_orders`.

Columns:

- snake_case
- entity-specific foreign keys, for example `user_id`, `role_id`, `sales_order_id`.

Entity properties:

- camelCase
- map to snake_case database names in Drizzle schemas.

Example:

```ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: varchar('full_name', { length: 255 }),
  roleId: uuid('role_id'),
});
```

## Required Columns

Most business entities:

- `id`
- `created_at`
- `updated_at`
- `deleted_at` if soft delete is required
- `created_by` when ownership/audit is important
- `updated_by` when ownership/audit is important
- `deleted_by` when soft delete is required and the actor matters

Rules:

- Use `createdAt`, `updatedAt`, and `deletedAt` as TypeScript property names.
- Use `createdBy`, `updatedBy`, and `deletedBy` as TypeScript property names.
- Set `createdAt` with `.defaultNow().notNull()`.
- Set `updatedAt` explicitly on updates.
- Use `deletedAt` for soft delete instead of hard deleting business records.
- Use audit actor columns for important business records such as orders, warehouse documents, approvals, payments, and permission changes.

## Identifier Rules

- UUID is preferred for public/business entity identifiers.
- Use integer identity primary keys only when the data model intentionally needs generated numeric IDs.
- If using an integer/generated primary key, always use `generatedAlwaysAsIdentity()`.
- Never use `serial()`.
- Do not expose predictable numeric IDs publicly when enumeration would be risky.

## Data Type Rules

- Use `timestamp(..., { withTimezone: true })` for business timestamps.
- Use `date` only for date-only values such as due dates or working dates.
- Use `numeric` or integer minor units for money. Do not use floating point types for money.
- Use integer quantities only when fractional quantities are impossible.
- Use `numeric` for fractional quantities, weights, ratios, and measurements.
- Use `boolean(...).notNull().default(false)` for flags unless the business needs three states.
- Use `text` for unbounded text and `varchar` when a real length limit exists.
- Use `pgEnum` for stable statuses and business states.
- Do not store JSON when the fields need filtering, sorting, joining, or constraints.

## Null And Default Rules

- Columns are `notNull()` by default unless the business explicitly allows missing values.
- Nullable columns must have a clear business reason.
- Prefer explicit defaults for status, boolean, and timestamp columns.
- Do not use empty strings as a replacement for `null`.
- For optional request fields, distinguish omitted `undefined` from intentional `null`.
- Do not trust calculated values from clients; calculate totals, balances, and statuses on the server.

## Constraint Rules

- Use `uniqueIndex` for business codes, emails, SKUs, and other stable unique values.
- Use composite unique indexes for scoped uniqueness, for example code unique within a tenant, warehouse, or document.
- Use `.references()` for stable foreign keys.
- Always choose `onDelete` behavior intentionally: `restrict`, `cascade`, `set null`, or `no action`.
- Use `cascade` only for dependent child records that cannot stand alone.
- Use `set null` only when the relation is optional and historical data remains valid.
- Use `restrict` or `no action` for important business records that should not disappear.
- Add check constraints for numeric values that cannot be negative when Drizzle support/project pattern allows it.
- Remember: Drizzle `relations()` do not create database foreign keys.

## Index Rules

- Index searchable columns.
- Index foreign keys and frequent filters.
- Add composite indexes that match real query patterns, not every possible column combination.
- Index columns used by common `orderBy` queries when result sets can grow large.
- Avoid redundant indexes that duplicate a unique index or a composite index prefix.
- Review indexes when adding new list endpoints, search filters, or reporting queries.

## Query Rules

- Avoid N+1 queries. Use joins, relational queries with `with:`, or batched queries.
- Select only the columns needed for the use case when loading large records or sensitive fields.
- Never pass raw client-provided table names, column names, SQL, or sort fields into queries.
- Import query operators such as `eq`, `and`, `or`, `gt`, and `inArray` from `drizzle-orm`.
- Use raw SQL only when Drizzle cannot express the query cleanly.
- Raw SQL must be parameterized and must not concatenate client input.
- Whitelist dynamic sort and filter fields.

## Soft Delete Rules

- Do not hard delete business records unless the data is temporary, technical, or explicitly approved.
- Use `deletedAt` for soft delete.
- Use `deletedBy` when the actor matters.
- Default list/detail queries for business records must exclude soft-deleted rows.
- Unique indexes must account for soft delete when the business allows recreating the same code after deletion.
- Cascading hard deletes are allowed only for technical child rows that have no business/audit value.

## Transactions And Concurrency

- Use transactions for multi-step operations.
- In a transaction, read the latest state before writing state transitions.
- Approval, payment, warehouse import/export, and stock movement flows must validate current status inside the transaction.
- Prevent double-submit/double-approval by checking the current status before update.
- Prefer idempotency keys or unique business references for external callbacks and imports.
- Keep transactions short. Do not perform slow network calls inside an open database transaction.

## Transactions Required

- create order + items
- warehouse import
- warehouse export
- payment
- approval workflow
- permission changes with role assignments
- any write flow that updates more than one table

## Seed Rules

- Seeds must be idempotent.
- Use `onConflictDoNothing` or `onConflictDoUpdate` for repeated seed runs.
- Seed stable codes and permissions with explicit business values.
- Do not seed environment-specific secrets into source-controlled files.
- Do not delete user/business data from seeds.

## Migration Rules

- Generate migrations with `pnpm.cmd db:generate`.
- Apply migrations with `pnpm.cmd db:migrate`.
- Do not use `drizzle-kit push` in production or shared environments.
- Do not run migrations without explicit user approval.
- Never delete, rename, reorder, or edit applied migration files.
- Review generated SQL before applying migrations.
- Destructive changes require a data migration/backfill plan.
- Large table changes require a rollout plan that avoids long locks where possible.
- Keep schema files and generated migration files in sync.

## Drizzle Rules

Use Drizzle PostgreSQL core imports from:

```ts
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
```

Use camelCase TypeScript keys and snake_case database names.

```ts
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fullName: varchar('full_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('users_full_name_idx').on(table.fullName)],
);
```

Numeric primary key example:

```ts
export const productionLines = pgTable('production_lines', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
});
```

Rules:

- Export schemas and relations through `src/database/schemas/index.ts`.
- Use `generatedAlwaysAsIdentity()` for PostgreSQL integer/generated primary keys.
- Do not use `serial()`.
- Use `pgEnum` for stable database statuses.
- Use `.references()` for stable foreign keys.
- Use Drizzle `relations()` for relational queries.
- Remember: Drizzle relations do not create database foreign keys.
- Use `uniqueIndex` for business codes.
- Use `index` for foreign keys and frequent filters.
- Use the current Drizzle Kit index callback array style for table extra config.
- Do not use the deprecated object-returning extra config style.
- Use `$inferSelect` and `$inferInsert` for database types when needed.
- Use `.returning()` for PostgreSQL inserts/updates when the service needs the changed row.
- Set `updatedAt` explicitly on updates.
- Use `db.transaction(...)` for multi-step writes.
- Use `onConflictDoNothing` / `onConflictDoUpdate` for idempotent seeds/imports.
- Do not run migrations without explicit user approval.

## Migration Commands

```text
pnpm.cmd db:generate
pnpm.cmd db:migrate
```

Review generated SQL before running migrations.
Do not run migrations without explicit user approval.
Do not use `drizzle-kit push` in production or shared environments.
Do not delete, rename, reorder, or edit applied migration files.

Extra config example:

```ts
export const roles = pgTable(
  'roles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    code: text('code').notNull(),
  },
  (table) => [uniqueIndex('roles_code_unique').on(table.code)],
);
```
