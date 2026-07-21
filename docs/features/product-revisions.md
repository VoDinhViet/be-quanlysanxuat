# Feature: Product Revisions

## Goal

Versioning shell for a product's structure/routing ("Cấu trúc sản phẩm & Công đoạn"): lets a product carry a history of named revisions ("R01", "R02", ...) instead of a single free-text label, with one revision always marked as **current**. This is groundwork — the BOM tree (`structure_nodes`) and routing (`node_operations`) that a future feature will build will hang off a `revisionId` from this module, so "Tạo revision mới" can clone a structure snapshot instead of overwriting it in place. This feature only builds the versioning mechanism itself; there is no structure/routing to version yet.

## Business rules

- Every product is guaranteed a current revision from the moment it's created: creating a product auto-creates its first revision, always numbered `R01`, and points the product at it in the same transaction. There is no way to create a product without one.
- `revisionNo` is unique **per product**, not globally — `"R01"` exists once per product, not once across the whole system. If omitted on create, it's auto-generated: `R` + the next free zero-padded 2-digit number, starting from the product's current revision count + 1. Generation is collision-safe — because a caller may create an explicit `revisionNo` out of order (e.g. `"R05"` while `"R02"`–`"R04"` don't exist), a naive "count + 1" can collide with an already-taken number; the generator keeps incrementing until it finds a free one.
- "Current" is defined purely by a pointer (`products.currentRevisionId`) — there is no status enum on a revision itself. Creating a new revision makes it current **by default**; sending `setAsCurrent: false` inserts it without switching the pointer (a draft revision, prepared ahead but not yet promoted). `POST .../activate` switches the pointer to any existing revision, including an older one (rollback/switch — this is not append-only).
- Every new revision is created **from** an existing one — `sourceRevisionId` (required) must reference another revision of the same product ("Sao chép từ" in the UI). It's recorded for lineage only in this phase: there is no structure/routing content yet to actually duplicate (that lands with the future BOM feature, at which point `sourceRevisionId` is what it will clone from). It is not exposed on `ProductRevisionResDto` yet — nothing reads it back today.
- Copying a product (`POST /products/:id/copy`) starts the copy's revision history fresh at `R01` — it does **not** carry over the source's current `revisionNo`. A copy is a new product identity.
- A revision's **basic info** — `revisionNo` and `note` — can be edited after creation (`PATCH .../:revisionId`). `revisionNo` stays unique per product on update too (excludes the row being edited). `sourceRevisionId` is immutable — it's lineage recorded at creation time, not editable. No delete of a revision itself in this feature (see Out of scope).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/products/:productId/revisions` | public | — | `ProductRevisionResDto[]` — **not paginated** (small, bounded per-product list, same reasoning as `GET /units`), newest first |
| GET | `/products/:productId/revisions/:revisionId` | public | — | `ProductRevisionResDto` |
| POST | `/products/:productId/revisions` | jwt (`JwtAuthGuard`) | `CreateProductRevisionReqDto` (`revisionNo?`, `sourceRevisionId`, `note?`, `setAsCurrent?`) | `201` + `ProductRevisionResDto` — current by default |
| PATCH | `/products/:productId/revisions/:revisionId` | jwt | `UpdateProductRevisionReqDto` (`revisionNo?`, `note?`) | `ProductRevisionResDto` — edits basic info only, does not change which revision is current |
| POST | `/products/:productId/revisions/:revisionId/activate` | jwt | — | `ProductRevisionResDto` — switches the product's current revision to this one |

- `ProductRevisionResDto`: `{ id, revisionNo, note, isActive, creator: { id, username } | null, createdAt, updatedAt }`. `isActive` is computed per request (`revision.id === product.currentRevisionId`), not a stored column.
- Read routes are public; write routes (create, activate) require a valid bearer access token, consistent with `products`.
- `ProductResDto.revision` (on the `products` endpoints) is unaffected in shape — still a plain `string` — but its value is now derived from the product's current revision here, not a directly-editable field. See `docs/features/products.md`.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Product not found (any route — `:productId` doesn't reference an existing, non-deleted product) | `ErrorCode.E007` | 404 Not Found |
| Revision not found (detail/activate — `:revisionId` doesn't exist, or belongs to a different product) | `ErrorCode.E048` | 404 Not Found |
| `sourceRevisionId` doesn't reference an existing revision of this product (create) | `ErrorCode.E048` | 404 Not Found |
| `revisionNo` already taken for this product (create or update, explicit `revisionNo` only) | `ErrorCode.E049` | 409 Conflict |

## Out of scope

- No delete of a revision — create + update + activate is the full write surface for now. Safe because `revisionNo` auto-generation never collides, so there's no "stuck, need to delete and retry" case.
- `PATCH .../:revisionId` only edits basic info (`revisionNo`, `note`) — it cannot change `sourceRevisionId` (immutable lineage) or which revision is current (use `POST .../:revisionId/activate` for that).
- No BOM tree (`structure_nodes`) or routing (`node_operations`) — this is purely the versioning shell they will attach to in a later feature.
- No permission enforcement beyond the global guard — `@Permissions('products:read' | 'products:revisions-manage')` decorators are metadata only (per `.claude/rules/api-module.md`); actual protection on write routes comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **New feature (2026-07-21)**: `products/:productId/revisions*` are brand-new endpoints. See `docs/features/products.md` for the accompanying breaking change to `products.revision`.
- **Breaking change (2026-07-21)**: `POST /products/:productId/revisions` now requires `sourceRevisionId` (UUID of an existing revision of the same product — "Sao chép từ" in the "Tạo Revision mới" dialog) and additionally accepts optional `setAsCurrent` (boolean, default `true`). A request missing `sourceRevisionId` now fails validation (`422`); a request that omits it entirely was previously accepted. `revisionNo` and `note` are unchanged (both still optional).
- Render revision history (Tab "Cấu trúc sản phẩm & Công đoạn") from `GET /products/:productId/revisions` — it's a plain array, not the usual `{ data, pagination }` envelope.
- "Tạo revision mới" is `POST /products/:productId/revisions` with `{ sourceRevisionId, revisionNo?, note?, setAsCurrent? }` — `sourceRevisionId` is the revision picked in the "Sao chép từ" dropdown (populate it from the same `GET /products/:productId/revisions` list); `revisionNo` is optional and best left omitted (auto-generated) unless the user explicitly types one; leave `setAsCurrent` unset (or `true`) for the normal "Đặt làm bản hiện hành ngay" toggle-on case, send `false` when the toggle is off.
- **New (2026-07-21)**: `PATCH /products/:productId/revisions/:revisionId` edits basic info — `{ revisionNo?, note? }`, both optional (send only what changed). It does not touch which revision is current. A conflicting `revisionNo` still 409s (`E049`); a `:revisionId` that doesn't exist under this product 404s (`E048`).
- Switching/rolling back to a past revision is `POST /products/:productId/revisions/:revisionId/activate` — no request body.
