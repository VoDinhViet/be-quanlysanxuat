# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NestJS 11 modular monolith for a production management system ("quản lý sản xuất"). PostgreSQL + Drizzle ORM, Redis, Swagger. Package manager is pnpm.

Current state: 24 API modules under `src/api/` — `auth`, `users`, `roles`, `health`, `files`, `clients`, `client-groups`, `products`, `product-groups`, `boms`, `routing`, `materials`, `material-groups`, `suppliers`, `supplier-groups`, `units`, `departments`, `positions`, `countries`, `operations`, `orders`, `inventory`, `production-orders`, `production-jobs`. RBAC (roles + granular permission codes) is live. `package.json` is still named `be-giasu-ai` — it hasn't been renamed for this project.

Removed on purpose (don't recreate unless asked): `uploads` (replaced by `files`). A prior `orders` module existed very early in the project's history and was removed along with most of the scaffold (`eea5926`) — the current `orders` (added 2026-07-24, see below) is an unrelated, fresh greenfield build, not a restoration of that old one (different schema shape: no PO/PR/VAT/approval workflow).

`suppliers`/`supplier-groups` were removed on 2026-07-20 and **rolled back the same day** — they exist and are current. They were restored on the `files` registry (`logoFileId` / `attachmentFileIds`), not the plain-URL model they originally shipped with. `countries` exists because suppliers reference it.

`operations` (added 2026-07-21) is master data for công đoạn (production steps), classified `INHOUSE`/`OUTSOURCE` — groundwork for a future product structure/routing feature. `products` gained a `type` (`FINISHED_GOOD`/`WORK_IN_PROGRESS`, renamed from `FG`/`WIP` on 2026-07-22) column the same day for the same reason.

`product-revisions` (added 2026-07-21, **removed 2026-07-24**) was a versioning shell for products — don't recreate it or look for `product_revisions`/`currentRevisionId` in the schema, they're gone. Versioning is now done by cloning the whole product (see `POST /products/:id/copy` below) instead of editing a version-history sub-resource. `products.sourceProductId` (nullable, self-FK) records which product a clone was made from, for lineage display only.

`boms` (added 2026-07-21, writer added 2026-07-22, **repointed from revision to product 2026-07-24**) is the BOM/structure tree ("Cấu trúc sản phẩm") — `boms` + `bom_items` (self-referencing, PRODUCT/MATERIAL leaf items), one BOM per product (`boms.productId` unique). Read via `GET /products/:productId/bom`; written per-node in real time via `POST/PATCH/DELETE .../bom/items[/:itemId]` (permission `products:bom-manage`). Each PRODUCT node's read response embeds its own as-used routing as `operations` (see `routing` below); MATERIAL nodes always get `[]`.

`routing` (added 2026-07-22 as `revision-operations`, renamed `product-operations` + repointed from revision to product 2026-07-24, **generalized to per-BOM-node ("as-used") and renamed again 2026-07-24**) is routing ("Công đoạn") — the sequence of `operations` a node of a product's structure goes through, table `routing_steps`. A row is keyed by **either** `productId` (the root product's own "Cấp 0" routing) **or** `bomItemId` (one specific `bom_items` node's own routing — the same WIP referenced from two different parents can carry a different routing at each position), mutually exclusive via a DB CHECK. Read/write Cấp 0 via `GET/POST/PATCH/DELETE /products/:productId/operations[/:stepId]`; read/write one BOM node via the same verbs under `/products/:productId/bom/items/:itemId/operations[/:stepId]` (permission `products:bom-manage` for writes, reused from `boms`).

`POST /products/:id/copy` (permission `products:copy`) deep-clones a product: the row itself, its attachments, its whole BOM tree, and its whole routing — a full independent product, not a version of the source. This is the versioning mechanism for this project (see the `product-revisions` note above).

`orders` (added 2026-07-24) is Sales Order management. Pared down to a single header-only table earlier on 2026-07-27, then re-expanded to a full order the same day, then had `OrderStatus.DRAFT` removed and `GET /orders/stats` redesigned later the same day (see `docs/features/orders.md`): `orders` (`code`, `clientId`, `contactName`/`contactPhone`/`contactEmail`, `staffId`, `orderDate`, `dueDate`, `deliveryAddress`, `paymentTerm`, `currency`, `exchangeRate`, `status`, `subtotal`, `discountType`/`discountValue`/`discountAmount`, `vatPercent`/`vatAmount`, `shippingFee`, `total`, `note`, `internalNote`, `createdBy`) + child tables `order_items` (per-line `productId`/`quantity`/`unitPrice`/`discountPercent`/`lineTotal`/`status`/`sortOrder`) and `order_attachments` (`files` registry links, same shape as `product_attachments`). Every derived amount (`lineTotal`, `subtotal`, `discountAmount`, `vatAmount`, `total`) is **server-computed in Postgres** by `OrdersService.recalculateTotals` (two `UPDATE ... FROM`/CTE statements run inside the same transaction as the write) — no request DTO field accepts any of them. `contactName`/`contactPhone`/`contactEmail` are a snapshot of a `client_contacts` row at submit time, not an FK (`ClientsService.replaceContacts` deletes+reinserts contacts on every client update, so contact ids aren't stable). `staffId` is the only business-domain FK in the repo pointing at `users.id` rather than `credentials.id`. `OrderStatus` is `CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED` — **no `DRAFT`**: an order is `CONFIRMED` the moment it's created (default status), there's no separate confirm step (`POST /orders/:id/confirm` was removed the same day it was added). `PATCH /orders/:id`/`DELETE` are blocked once `status` reaches `COMPLETED` or `CANCELLED` (`E065`); `CONFIRMED`/`IN_PROGRESS` stay editable. No "revision" concept anywhere on order lines — `product-revisions` stays removed (see above). Unlike most master-data modules, **every** `/orders*` route requires a bearer token, including reads. "Trễ hạn" (overdue) is a computed, not stored, flag exposed as `OrderResDto.expired` — evaluated directly in SQL via a Drizzle relational-query `extras` expression (`OrdersService.expiredSql`, renamed from `isOverdueSql`/`isOverdue` on 2026-07-27), not re-derived in JS per row. `GET /orders/stats` returns 12 fields for a 6-card dashboard (totals + month/week trends + delivered/in-progress/expired/completed, each with a % or trend companion) computed in one conditional-aggregation query; two fields are documented approximations (`completedValue` proxies "đã giao" off `status = COMPLETED` since there's no delivery/DO tracking yet, `expiredTrendCount` re-evaluates today's status against a week-old due-date cutoff since no status-history table exists).

`production-orders` + `production-jobs` (both added 2026-07-29, several redesigns the same day — see below) together are "LSX" (lệnh sản xuất) — bridging an approved PO (`orders.status = AWAITING_PRODUCTION`) to finished-goods stock checking and a production decision, the gap both `orders.md` and `inventory.md` had documented as future work. Three tables: `production_orders` (header, **one order = one LSX**, `orderId` unique, `status: PENDING | ISSUED`), `production_order_items` (the production-decision child rows, one per NORMAL order line, 1-1 with `orderItemId`), `production_jobs` (**one FG product = one Job**, summed across every line sharing that product within one LSX, only created on issue). `OrdersService.approveOrder` seeds the header + item rows (Đề xuất SX computed from `InventoryService.getStockLevels`'s onHand/reserved, excluding the PO's own demand); the user can edit and save them (`PATCH /production-orders/:orderId`), then "Tạo LSX" (`POST /production-orders/:orderId/issue`) flips the header to `ISSUED` (mã `LSXxxxx`), groups every item row by `productId` into one `production_jobs` row each (mã `JOBxxxx`) for products with quantity > 0, lumps every line's stock-covered quantity into a single `OUT`/`DELIVERY` stock receipt, and moves the order to `IN_PROGRESS`. History the same day: started as 2 tables/2 modules (`production_plans` + `production_orders`, one row per PO line each mistakenly minted its own `LSXxxxx`); merged into one table/one module for a simplification request; then corrected the unit mistake by splitting into the current 3-table shape and pulling Job out into its own module (`ProductionJobsController`/`Service` at `/production-jobs*`, called from `ProductionOrdersService.issueProductionOrders`'s transaction via `ProductionJobsService.issueJobs`) since Job is a distinct concept/lifecycle ("Quản lý sản xuất", the shop floor's actual unit of work), not just another read shape of the same LSX. See `docs/features/production.md`. **Note**: the `PENDING | ISSUED`/"Tạo LSX" model described just above is superseded — see `docs/features/production.md` for the current `PENDING | APPROVED` approve flow (`approveProductionOrder`, permission `production:approve`), kept here only as history of how the shape arrived at its current form. `production_jobs` gained its own lifecycle on 2026-07-30 (`status: PENDING | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED`, cộng dồn `producedQty`/`rejectedQty`, table `production_job_logs`) via 7 new `/production-jobs/:jobId/*` routes (`start`/`report`/`pause`/`resume`/`complete`/`cancel`/`logs`) — Job is no longer read-only after `createJobs` seeds it.

`inventory` gained materials tracking on 2026-07-30 (previously finished-goods only): `stock_receipts` gained a `subject` column (`FINISHED_GOOD`/`MATERIAL`, bất biến sau khi tạo) generalizing the same ledger to both kho, `stock_receipt_items.productId` became nullable alongside a new nullable `materialId` (đúng-một-trong-hai, CHECK `chk_stock_receipt_items_target`), and receipt codes now branch on `subject` (`PN`/`PX` cho thành phẩm, `PNVT`/`PXVT` cho vật tư). `GET /inventory/materials` (new route) mirrors `GET /inventory` for `materials`, with `reserved`/`bomDemand` hardcoded to `0` this phase (no Phiếu lãnh vật tư, no BOM explosion yet — see `docs/features/inventory.md`). Same day, `materials` gained `minStock` (ngưỡng cảnh báo tồn) and `supplierId` (NCC chính, nullable FK `suppliers`) to support this screen.

## Rules

Detailed, enforceable conventions live in `.claude/rules/` and are imported below (always active for every task):

@.claude/rules/workflow.md
@.claude/rules/api-module.md
@.claude/rules/dto.md
@.claude/rules/code-docs.md
@.claude/rules/database.md
@.claude/rules/errors-pagination.md

Testing rule (`.claude/rules/testing.md`) is intentionally **not imported** — testing is paused repo-wide as of 2026-07-28 (see `.claude/rules/workflow.md`). The file itself is untouched, kept as reference for when testing resumes: re-add the `@` import line above and remove the paused banner at the top of that file.

On-demand capabilities (doc refactor, CLAUDE.md audit, Fowler-style code refactor) live in `.claude/skills/` — see `.claude/README.md` for the rule-vs-skill standard.

## Commands

```bash
pnpm start:dev                    # dev server with watch (default port 3000, api at /api)
pnpm build                        # nest build
pnpm lint                         # eslint with --fix
pnpm format                       # prettier --write on src/ and test/

pnpm test                         # all unit tests (*.spec.ts under src/) — paused, see workflow.md; run only if explicitly asked
pnpm test -- users.service        # single test file (matches path/name) — paused, same as above
pnpm test:e2e                     # e2e tests (test/jest-e2e.json) — paused, same as above

pnpm db:generate                  # generate Drizzle migration from schema changes
pnpm db:migrate                   # apply migrations (never against shared/prod DBs without approval)
pnpm db:studio                    # Drizzle Studio
pnpm db:seed:credentials          # seed 7 default accounts (roles + departments + positions + credentials + users), idempotent
```

Env is loaded from `.env.${NODE_ENV}` first, then `.env` as fallback (see `src/main.ts` and seed scripts). Requires PostgreSQL and Redis running. Swagger UI at `/api-docs` outside production.

## Architecture

### Request pipeline (configured in `src/main.ts`)

- Global prefix `api` + URI versioning (routes look like `/api/v1/...` when a version is set on the controller). `GET /` and `GET health` are explicitly excluded from the `api` prefix in `main.ts` (`app.setGlobalPrefix('api', { exclude: [...] })`) — so the health check lives at `GET /health`, not `GET /api/health`.
- Global `ValidationPipe` with `whitelist: true`, `transform: true`; validation errors return 422.
- Global `ClassSerializerInterceptor` + `GlobalExceptionFilter`.
- `main.ts` exports a serverless-style handler (cached Express instance) and also listens on `PORT` when run directly.

### Modules (`src/api/<module>/`)

`users` is the reference example for new modules — coding conventions (controller/service shape, DTOs, errors, pagination) live in `.claude/rules/` (imported above), not repeated here. Business rules and API contracts per module, when written, live in `docs/features/<module>.md` (no fixed template — written as needed, see `.claude/rules/workflow.md`).

Register new modules in `src/app.module.ts`.

**Global secure-by-default guards**: `JwtAuthGuard` + `PermissionsGuard` are registered as `APP_GUARD` in `src/app.module.ts` (in that order). Every route requires a valid bearer token by default; mark a route `@Public()` / `@ApiPublic()` (`src/decorators/public.decorator.ts`) to opt out of both auth and permission checks. A route declares the permission it needs with `@Permissions('resource:action')`; `PermissionsGuard` enforces it (a role holding `system:manage` passes everything). Roles live in the DB and are resolved per-request from the token's credential id (Redis-cached). Read the authenticated user with `@CurrentUser()` (`src/decorators/current-user.decorator.ts`) — on `@Public()` routes it resolves to `undefined`.

### Database (Drizzle)

- `DatabaseModule` is `@Global()`, token `DRIZZLE`, type `Database` (`src/database/database.type.ts`). Conventions (schema shape, re-export requirement, soft-delete reality): `.claude/rules/database.md`.
- Cross-cutting ER diagram + data-flow diagram for the product/BOM/routing domain (products, boms, bom_items, routing_steps, operations, product_groups, units): `docs/architecture.md`. Different in shape from `docs/features/*.md` — no business rules/API contract there, just how the tables connect and in what order writes happen.

## Notes

- README references an older doc layout (`coding-standards.md`, `api-standards.md`, `database-rules.md`, `module-specs/*`) and `AGENTS.md` — none of those exist, don't look for them. `docs/architecture.md` (added 2026-07-22) is a real, current file — it's a fresh cross-cutting ER/data-flow doc, unrelated in shape or content to whatever the old abandoned layout's version of that path used to be. The `docs/features/` folder (feature specs, see `.claude/rules/workflow.md`) is likewise a fresh convention, not a restoration of the old one.
- `uploads/` is served statically at `/uploads/` and is git-ignored.
- `src/common/` has some DTOs duplicated at both `common/*` and `common/dto/*` (e.g. pagination, error DTOs) — prefer the versions under `common/dto/`.
