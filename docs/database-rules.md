# Database Rules

## Drizzle Rules

Use Drizzle PostgreSQL core imports from:

```ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
```

Use camelCase TypeScript keys and snake_case database names.

```ts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: varchar('full_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Rules:

- Export schemas and relations through `src/database/schemas/index.ts`.
- Use `pgEnum` for stable database statuses.
- Use `.references()` for stable foreign keys.
- Use Drizzle `relations()` for relational queries.
- Remember: Drizzle relations do not create database foreign keys.
- Use `uniqueIndex` for business codes.
- Use `index` for foreign keys and frequent filters.
- Prefer the current Drizzle Kit index callback array style for new schemas.
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

Do not run migrations without explicit user approval.
