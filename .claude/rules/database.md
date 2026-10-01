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
- Columns of type `date` are compared as UTC midnight. "Today" for business rules is Vietnam time (`Asia/Ho_Chi_Minh`): see `src/database/vn-date.util.ts` and the `VN_TODAY` constant in `reports.service.ts`.
- Migrations live in `drizzle/`; `pnpm db:check-drift` compares the journal and file hashes with each database's applied migrations.
- Do not repeat in application code a default the column already has in its schema.
