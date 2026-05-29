# System Flow

## Purpose

This file gives AI agents and developers one place to understand the current backend flow and module ownership.

Update this file when a change affects multiple modules, authentication/RBAC, database flow, or the expected order of business operations.

## Request Flow

```text
HTTP request
  -> main.ts global prefix /api and URI versioning
  -> AuthGuard unless endpoint is public
  -> RolesGuard when @Permissions(...) is present
  -> Controller DTO/param validation
  -> Service business logic
  -> Drizzle database query/write
  -> DTO response mapping
  -> GlobalExceptionFilter on errors
```

## Authentication And Permissions

- APIs are private by default unless marked with `@ApiPublic(...)`.
- JWT payload carries user identity and role code.
- `RolesGuard` loads role permissions from the database.
- `system:manage` bypasses specific permission checks.
- Permission keys use `resource:action`, for example `orders:create`, `orders:read`, `roles:manage`, `suppliers:read`.
- Permission seed source is `src/database/seeds/rbac.seed.ts`.
- Permission TypeScript union source is `src/constants/permission.constant.ts`.

## Current Business Flow Map

1. User authenticates through `auth`.
2. Frontend calls `GET /auth/me` to get role and permission codes.
3. Admin/user management uses `users` and `roles`.
4. Business master data starts with `clients`, `suppliers`, `products`, and related setup tables.
5. Sales flow starts from clients and orders.
6. Production flow derives work orders and production jobs from approved orders.
7. Outside processing uses suppliers for outsourced production operations.
8. Purchase requisitions and purchase orders use material requests and suppliers.
9. Warehouse and QC flows process receipts, issues, returns, inventory, and stock-in quality approval.

## Documentation Rules

- When changing an API module, update its module spec in `docs/module-specs/` in the same task.
- When changing implementation status, update `docs/module-progress.md` in the same task.
- Module specs must include purpose, source, public API, permissions, dependencies, database rules, security rules, and change checklist.
- When adding a new module, create the module spec before finishing the task.
- When changing shared flow, permissions, auth, database relationships, or cross-module dependencies, update this file.

## Open Documentation Gaps

- Create module specs for `roles`.
- Create module specs for `clients`.
- Add module specs for future production, order, warehouse, purchasing, and product modules as implementation starts.
