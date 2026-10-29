---
paths:
  - "src/database/**"
  - "drizzle/**"
  - "src/api/**/*.service.ts"
  - "src/api/**/*.query.ts"
---

# Database (Drizzle + postgres.js)

- The database is injected through the `DRIZZLE` token (global `DatabaseModule`). Schemas are grouped by domain under `src/database/schemas/` and re-exported from its `index.ts`.
- Prefer `.select().from(...).limit(1)` over `db.query.*.findFirst` for simple existence or uniqueness checks.
- Soft delete is `deletedAt`; filter on it in every query that should not see deleted rows.
- Enums such as `OrderStatus` or `ProductionJobStatus` are TypeScript enums exported from the schema files and mirrored as `pgEnum`. Changing an enum value also needs a migration, and partial indexes that mention the old value must be rewritten.
- Columns of type `date` are compared as UTC midnight. "Today" for business rules is Vietnam time (`Asia/Ho_Chi_Minh`): see `vnToday()` in `src/common/utils/time.ts` and the `VN_TODAY` constant in `reports.service.ts`.
- Columns of type `timestamp` store UTC. The app connection sets `TimeZone=UTC` (`database.module.ts`), so `DEFAULT now()` writes UTC; a script or migration that opens its own connection must do the same, or write `now() at time zone 'UTC'`.
- Group, truncate or compare a `timestamp` column by Vietnam day through `vnTimestamp(column)` (and `VN_NOW` for "now") from `src/common/utils/time.ts`. Comparing a `timestamp` with `now() ± interval` needs no wrapper.
- A date-range filter on a `timestamp` column uses `startOfVnDay(startDate)` and `exclusiveEndOfDay(endDate)` (`lt`), never the raw parsed date; a `date` column compares the parsed value directly.
- Migrations live in `drizzle/`; `pnpm db:check-drift` compares the journal and file hashes with each database's applied migrations.
- Do not repeat in application code a default the column already has in its schema.
