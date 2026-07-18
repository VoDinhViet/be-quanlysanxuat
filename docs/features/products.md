# Feature: Products

## Goal

Manage the master catalog of products ("Sản phẩm — Dữ liệu nguồn") shown on the products list screen: search/filter, view, create, edit, duplicate, and delete products, each linked to a client, a product group, and a unit of measure.

## Business rules

- `code` is globally unique. If omitted on create, it's auto-generated as `SP` + a zero-padded sequential number (e.g. `SP0001`), based on the current total row count.
- `unitId` is required and must reference an existing `units` row (`ErrorCode.E011` if not found).
- `clientId` and `productGroupId` are optional; when provided they must reference existing rows (`ErrorCode.E009` / `E010`), and can be cleared by sending `null` on update.
- `revision` defaults to `R01` on create. There is no revision history — updating `revision` just overwrites the stored value (see Out of scope).
- `status` defaults to `ACTIVE` (`ACTIVE | INACTIVE`).
- Delete is a **soft delete** (`deletedAt` timestamp) — deleted products are excluded from every read (list/detail) and no longer count toward `SPxxxx` code generation avoidance (a new product can reuse a freed code once the old row's `deletedAt` is set, since uniqueness checks don't exclude soft-deleted rows explicitly — deleted codes stay reserved).
- Copy (`POST /products/:id/copy`) duplicates all fields of an existing (non-deleted) product except `id`/`code`/timestamps: a fresh `code` is auto-generated, `createdBy` is the caller performing the copy.
- `createdBy` is always taken from the bearer token (`sub` claim) on create/copy — it is never accepted from the request body.
- Search (`q`) is **accent-insensitive** (e.g. "khung may" matches "Khung máy A"), backed by the PostgreSQL `unaccent` extension, and matches `code`, `name`, or the linked product group's `name`.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/products` | public | `GetProductsReqDto` (`q`, `clientId`, `productGroupId`, `status`, `page`, `limit`) | `OffsetPaginatedDto<ProductResDto>` |
| GET | `/products/:id` | public | — | `ProductResDto` |
| POST | `/products` | jwt (`JwtAuthGuard`) | `CreateProductReqDto` | `201` + `ProductResDto` |
| PATCH | `/products/:id` | jwt | `UpdateProductReqDto` (all fields optional) | `ProductResDto` |
| DELETE | `/products/:id` | jwt | — | `204` (soft delete) |
| POST | `/products/:id/copy` | jwt | — | `201` + `ProductResDto` (duplicate with a new code) |
| GET | `/clients` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<ClientResDto>` (dropdown data) |
| GET | `/product-groups` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<ProductGroupResDto>` (dropdown data) |
| GET | `/units` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<UnitResDto>` (dropdown data) |

- `ProductResDto` nests lightweight refs: `client { id, code, name } | null`, `group { id, code, name } | null`, `unit { id, code, name }`, `creator { id, username } | null`.
- List/detail read routes are public (consistent with the rest of the `users`/`auth` module set at this stage of the project — see Out of scope). Only write routes (create/update/delete/copy) require a valid bearer access token.
- `GET /clients`, `/product-groups`, `/units` are minimal list-only endpoints meant to populate dropdowns/filters on the products screen — full CRUD for these master-data entities is a separate, future task.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Product not found (detail/update/delete/copy) | `ErrorCode.E007` | 404 Not Found |
| Product `code` already taken (create/update, explicit code only) | `ErrorCode.E008` | 409 Conflict |
| `clientId` does not reference an existing client | `ErrorCode.E009` | 404 Not Found |
| `productGroupId` does not reference an existing product group | `ErrorCode.E010` | 404 Not Found |
| `unitId` does not reference an existing unit | `ErrorCode.E011` | 404 Not Found |

## Out of scope

- No revision history, BOM, or routing — `revision` is a single free-text field, not a versioned entity.
- No CRUD (create/update/delete) for `clients` / `product-groups` / `units` — only read-only list endpoints exist so far.
- No backend Excel export — the frontend is expected to export from the already-fetched list data.
- No `LOCKED` product status (only `ACTIVE`/`INACTIVE`) — no lock/unlock action on this screen.
- No dedicated image upload wired into this endpoint — `imageUrl` is still a plain string set by the client. It can now be populated via the generic `POST /uploads` endpoint (see `docs/features/uploads.md`): upload the image first, then send the returned `url` as `imageUrl` on create/update.
- No permission enforcement — `@Permissions('products:*')` decorators are metadata only (per `.claude/rules/api-module.md`); actual protection on write routes comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **Internal rename only (2026-07-16)**: `products.createdBy` now references the `credentials` table (renamed from `users` — see `docs/features/users.md`). No API contract change; `creator { id, username }` is unaffected.
- **Breaking change (2026-07-15)**: `products.creator.fullName` → `products.creator.username`. The `credentials` table (then still called `users`) no longer has a `fullName` column (see `docs/features/users.md`), so the nested creator ref on every product now exposes `{ id, username }` instead of `{ id, fullName }`.
- **New feature (2026-07-15)**: a generic image upload endpoint now exists at `POST /api/uploads` (see `docs/features/uploads.md`) — use it to get an `imageUrl` before creating/updating a product. This is a separate call, not part of `POST /products`/`PATCH /products/:id`.
- **New feature (2026-07-14)**: `products`, `clients`, `product-groups`, `units` are brand-new endpoints — nothing existed before this. Non-breaking (nothing to migrate from).
- Populate the "Khách hàng" / "Nhóm sản phẩm" / "ĐVT" dropdowns and filters from `GET /clients`, `GET /product-groups`, `GET /units` respectively (each supports `?q=` for search-as-you-type).
- Write actions (Thêm/Sửa/Xóa/Nhân bản) require `Authorization: Bearer <accessToken>` — a logged-out user can still view the list/detail but gets `401` attempting to create/edit/delete/copy.
- The search box on the list screen can send accent-insensitive Vietnamese text directly (no need to strip diacritics client-side); it matches product code, name, and group name.
- "Nhân bản" (copy) is `POST /products/:id/copy` — no request body needed; the response is the newly created product with a fresh `code`.
