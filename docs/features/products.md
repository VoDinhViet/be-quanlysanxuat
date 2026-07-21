# Feature: Products

## Goal

Manage the master catalog of products ("Sản phẩm — Dữ liệu nguồn") shown on the products list screen: search/filter, view, create, edit, duplicate, and delete products, each linked to a client, a product group, and a unit of measure.

## Business rules

- `code` is globally unique. If omitted on create, it's auto-generated as `SP` + a zero-padded sequential number (e.g. `SP0001`), based on the current total row count.
- `type` is `FG` (thành phẩm — a sellable end product) or `WIP` (bán thành phẩm — an intermediate part that only exists as a component inside another product's structure). Defaults to `FG` when omitted on create. Both share every other mechanic on this table (image, revision, attachments); a future BOM/structure feature (out of scope here, see Out of scope) will reference `WIP` rows as child nodes of a `FG` product's tree. `POST /products/:id/copy` carries the original's `type` over onto the copy.
- `unitId` is required and must reference an existing `units` row (`ErrorCode.E011` if not found) that carries the `PRODUCT` scope (`ErrorCode.E043` if not — see `docs/features/units.md`).
- `clientId` and `productGroupId` are optional; when provided they must reference existing rows (`ErrorCode.E009` / `E010`), and can be cleared by sending `null` on update.
- `revision` is **not a settable field** — a product's first revision (`R01`) is auto-created when the product is created, and `revision` on read responses is derived from whichever revision is current. Manage revisions (create new ones, switch/rollback which one is current) via `docs/features/product-revisions.md`. `POST /products/:id/copy` starts the copy's revision history fresh at `R01` rather than carrying the source's over.
- `status` defaults to `ACTIVE` (`ACTIVE | INACTIVE`).
- Delete is a **soft delete** (`deletedAt` timestamp) — deleted products are excluded from every read (list/detail) and no longer count toward `SPxxxx` code generation avoidance (a new product can reuse a freed code once the old row's `deletedAt` is set, since uniqueness checks don't exclude soft-deleted rows explicitly — deleted codes stay reserved).
- Copy (`POST /products/:id/copy`) duplicates all fields of an existing (non-deleted) product except `id`/`code`/timestamps: a fresh `code` is auto-generated, `createdBy` is the caller performing the copy.
- `createdBy` is always taken from the bearer token (`sub` claim) on create/copy — it is never accepted from the request body.
- Search (`q`) is **accent-insensitive** (e.g. "khung may" matches "Khung máy A"), backed by the PostgreSQL `unaccent` extension, and matches `code`, `name`, or the linked product group's `name`.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/products` | public | `GetProductsReqDto` (`q`, `clientId`, `productGroupId`, `type`, `status`, `page`, `limit`) | `OffsetPaginatedDto<ProductResDto>` |
| GET | `/products/:id` | public | — | `ProductResDto` |
| POST | `/products` | jwt (`JwtAuthGuard`) | `CreateProductReqDto` | `201` + `ProductResDto` |
| PATCH | `/products/:id` | jwt | `UpdateProductReqDto` (all fields optional) | `ProductResDto` |
| DELETE | `/products/:id` | jwt | — | `204` (soft delete) |
| POST | `/products/:id/copy` | jwt | — | `201` + `ProductResDto` (duplicate with a new code) |
| — | `/products/:productId/revisions*` | — | — | see `docs/features/product-revisions.md` — create/list/detail/activate a revision |
| GET | `/clients` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<ClientResDto>` (dropdown data) |
| GET | `/product-groups` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<ProductGroupResDto>` (dropdown data) |
| GET | `/units` | public | `q`, `scope` | `UnitResDto[]` — **not paginated** (dropdown data — pass `scope=PRODUCT`) |
| POST | `/files` | jwt | `multipart`, `?type=PRODUCT_IMAGE` | `201` + `FileResDto` (upload before linking `imageFileId`) |

- `ProductResDto` nests lightweight refs: `client { id, code, name } | null`, `group { id, code, name } | null`, `unit { id, code, name }`, `creator { id, username } | null`, and `image: FileResDto | null`.
- **Images go through the `files` registry**, not a URL string: upload with `POST /files?type=PRODUCT_IMAGE`, then send the returned id as `imageFileId`. An unknown id 404s with `E042`. `POST /products/:id/copy` copies the `imageFileId`, so the copy shares the original's file — there is no reference counting, so deleting that file clears the image on both.
- List/detail read routes are public (consistent with the rest of the `users`/`auth` module set at this stage of the project — see Out of scope). Only write routes (create/update/delete/copy) require a valid bearer access token.
- `GET /clients`, `/product-groups`, `/units` are minimal list-only endpoints meant to populate dropdowns/filters on the products screen — full CRUD for these master-data entities is a separate, future task.
- `GET /units` is the odd one out: it returns a bare array rather than a paginated envelope (see `docs/features/units.md` for why). `/clients` and `/product-groups` stay paginated.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Product not found (detail/update/delete/copy) | `ErrorCode.E007` | 404 Not Found |
| Product `code` already taken (create/update, explicit code only) | `ErrorCode.E008` | 409 Conflict |
| `clientId` does not reference an existing client | `ErrorCode.E009` | 404 Not Found |
| `productGroupId` does not reference an existing product group | `ErrorCode.E010` | 404 Not Found |
| `unitId` does not reference an existing unit | `ErrorCode.E011` | 404 Not Found |
| `imageFileId` does not reference a file in the registry | `ErrorCode.E042` | 404 Not Found |
| The unit exists but isn't usable on products (e.g. `Mét`) | `ErrorCode.E043` | 400 Bad Request |

## Out of scope

- No BOM/structure tree or routing yet — revision **history** now exists (see `docs/features/product-revisions.md`), but there is nothing to version inside a revision yet (no structure/routing rows attach to a `revisionId` in this phase). `type` (`FG`/`WIP`) is groundwork for that future structure feature; it does **not** itself imply a parent/child tree or routing exists.
- No CRUD (create/update/delete) for `clients` / `product-groups` / `units` — only read-only list endpoints exist so far.
- No backend Excel export — the frontend is expected to export from the already-fetched list data.
- No `LOCKED` product status (only `ACTIVE`/`INACTIVE`) — no lock/unlock action on this screen.
- No permission enforcement — `@Permissions('products:*')` decorators are metadata only (per `.claude/rules/api-module.md`); actual protection on write routes comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **Breaking change (2026-07-21)**: `revision` is **removed** from `CreateProductReqDto`/`UpdateProductReqDto` — sending it in a create/update body is silently ignored (extraneous fields are stripped by the global `ValidationPipe`). A product's first revision (`R01`) is now auto-created on `POST /products`; to add or switch revisions afterward, use the new `docs/features/product-revisions.md` endpoints (`POST /products/:id/revisions`, `POST /products/:id/revisions/:revisionId/activate`). `ProductResDto.revision` keeps the same field name/type (`string`) so read-only consumers are unaffected — its value now reflects whichever revision is current. `POST /products/:id/copy` no longer carries the source's `revisionNo` over onto the copy — the copy always starts at `R01`.
- **New field (2026-07-21)**: `ProductResDto` now returns `type` (`FG` | `WIP`), and `CreateProductReqDto`/`UpdateProductReqDto`/`GetProductsReqDto` accept it. Additive, **non-breaking** — `type` defaults to `FG` on create when omitted, so existing integrations that don't send it keep working unchanged. Use it to render the "Loại" column/filter on the products list and the "Loại" dropdown on the product form. This is unrelated to `product-groups` (`GET /product-groups`, still the "Nhóm sản phẩm" classification) — `type` is a new, separate axis.
- **Internal rename only (2026-07-16)**: `products.createdBy` now references the `credentials` table (renamed from `users` — see `docs/features/users.md`). No API contract change; `creator { id, username }` is unaffected.
- **Breaking change (2026-07-15)**: `products.creator.fullName` → `products.creator.username`. The `credentials` table (then still called `users`) no longer has a `fullName` column (see `docs/features/users.md`), so the nested creator ref on every product now exposes `{ id, username }` instead of `{ id, fullName }`.
- **Breaking change (2026-07-20)**: the generic upload endpoint moved from `POST /api/uploads` to `POST /api/files` (field `file` + `kind: 'IMAGE'`, response now `{ id, url, originalName, mimetype, size, kind, createdAt }` instead of `{ url, filename, mimetype, size }` — see `docs/features/files.md`). ~~`products.imageUrl` itself is unaffected~~ — **superseded later the same day**: see the `imageFileId` note below.
- **New feature (2026-07-15)**: a generic image upload endpoint now exists (see `docs/features/files.md`) — it is a separate call, not part of `POST /products`/`PATCH /products/:id`. (Its response is now linked as `imageFileId`, not `imageUrl` — see the 2026-07-20 note below.)
- **New feature (2026-07-14)**: `products`, `clients`, `product-groups`, `units` are brand-new endpoints — nothing existed before this. Non-breaking (nothing to migrate from).
- Populate the "Khách hàng" / "Nhóm sản phẩm" / "ĐVT" dropdowns and filters from `GET /clients`, `GET /product-groups`, `GET /units?scope=PRODUCT` respectively (each supports `?q=` for search-as-you-type).
- **Breaking change (2026-07-20)**: the ĐVT dropdown must now pass `scope=PRODUCT`. Without it `GET /units` still returns material-only units such as `Tấm`/`Mét`, and submitting one is rejected with **400 `E043`**.
- **Breaking change (2026-07-20)**: product images moved to the `files` registry. `imageUrl` (plain string) is **gone** from create/update — upload via `POST /files?type=PRODUCT_IMAGE` and send the returned id as **`imageFileId`**. In responses, `imageUrl` is replaced by nested **`image: FileResDto | null`**; read the URL from `image.url`. That URL is signed and **expires after ~1 hour** — don't cache it, re-read the product to refresh (see `docs/features/files.md`).
- **New (2026-07-20)**: `GET /product-groups` now returns seeded data (`THANH_PHAM`, `LINH_KIEN`, `VAT_TU`, `MUA_NGOAI`) — the table was previously empty, so the "Nhóm sản phẩm" dropdown was always blank. Its response also gained `description`, `createdAt`, `updatedAt` (fields added only, non-breaking). Details in `docs/features/product-groups.md`.
- **Breaking change (2026-07-20)**: `GET /units` no longer paginates — it returns `UnitResDto[]` directly instead of `{ data, pagination }`. The ĐVT dropdown must read the array straight off the response; drop `?page=`/`?limit=`. `GET /clients` and `GET /product-groups` are unaffected and still paginated.
- Write actions (Thêm/Sửa/Xóa/Nhân bản) require `Authorization: Bearer <accessToken>` — a logged-out user can still view the list/detail but gets `401` attempting to create/edit/delete/copy.
- The search box on the list screen can send accent-insensitive Vietnamese text directly (no need to strip diacritics client-side); it matches product code, name, and group name.
- "Nhân bản" (copy) is `POST /products/:id/copy` — no request body needed; the response is the newly created product with a fresh `code`.
