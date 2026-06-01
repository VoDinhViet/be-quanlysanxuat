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
5. Product master data defines revisions, multi-level BOM, and routing before production jobs use it.
6. Sales flow starts from clients and orders.
7. Production flow derives work orders and production jobs from approved orders.
8. Outside processing uses suppliers for outsourced production operations.
9. Purchase requisitions and purchase orders use material requests and suppliers.
10. Warehouse and QC flows process receipts, issues, returns, inventory, and stock-in quality approval.

## System Flow Diagram

```text
Auth / RBAC
  -> users
  -> roles
  -> permissions

Master Data
  -> clients
  -> suppliers
  -> products
       -> product_revisions
       -> bom_lines
       -> routing_steps
       -> units
       -> operations

Sales
  -> orders
       -> order_items
            -> products

Planning
  -> approved orders
       -> work_orders
            -> production_jobs
                 -> snapshot product revision
                 -> snapshot routing_steps into job_operations
                 -> explode bom_lines into material demand

Procurement
  -> material demand
       -> purchase_requisitions
            -> purchase_orders
                 -> suppliers

Production Execution
  -> production_jobs
       -> job_operations
            -> inhouse operation
            -> outside processing order
                 -> suppliers
                 -> outside processing receipt

Warehouse / QC
  -> warehouse receipts
  -> warehouse issues
  -> warehouse returns
  -> warehouse inventory
  -> qc stock-in quality approval
```

## Product To Production Flow

```text
Create product
  -> create initial product_revision
  -> define multi-level BOM by product_revision
  -> define routing for FG/WIP nodes
  -> create a new revision by copying BOM/routing from an existing revision when needed
  -> lock or approve revision when ready
  -> use revision for production job creation
  -> copy BOM/routing snapshots into job/material workflows
```

Rules:

- `products` is the source item catalog for FG, WIP, RM, and consumable items.
- `product_revisions` scopes BOM and routing so existing jobs can keep historical data.
- `bom_lines` stores parent-child structure for material explosion.
- `routing_steps` stores planned operations for FG/WIP items only.
- `production_jobs` must snapshot revision/routing/material demand instead of reading mutable product setup directly during execution.

## Cross Module Ownership

| Flow area          | Owner module             | Main tables                                                         |
| ------------------ | ------------------------ | ------------------------------------------------------------------- |
| Authentication     | `auth`, `users`, `roles` | `users`, `roles`, `permissions`, `role_permissions`                 |
| Customer data      | `clients`                | `clients`                                                           |
| Supplier data      | `suppliers`              | `suppliers`                                                         |
| Product setup      | `products`               | `products`, `product_revisions`, `bom_lines`, `routing_steps`       |
| Sales              | future `orders`          | `orders`, `order_items`, `order_files`                              |
| Planning           | future `work-orders`     | `work_orders`, `work_order_items`, `production_jobs`                |
| Production runtime | future `production-jobs` | `production_jobs`, `job_operations`                                 |
| Outside processing | future outside module    | `outside_processing_orders`, `outside_processing_receipts`          |
| Procurement        | future purchasing module | `purchase_requisitions`, `purchase_requisition_items`               |
| Warehouse/QC       | future warehouse/QC      | warehouse tables, inventory tables, QC approval tables when created |

## Documentation Rules

- When changing an API module, update its module spec in `docs/module-specs/` in the same task.
- Module specs must include purpose, source, public API, permissions, dependencies, database rules, security rules, and change checklist.
- When adding a new module, create the module spec before finishing the task.
- When changing shared flow, permissions, auth, database relationships, or cross-module dependencies, update this file.

## Open Documentation Gaps

- Create module specs for `roles`.
- Create module specs for `clients`.
- Add module specs for future production, order, warehouse, and purchasing modules as implementation starts.
