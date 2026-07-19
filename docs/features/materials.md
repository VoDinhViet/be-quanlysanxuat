# Feature: Materials (Danh mục vật tư)

## Goal

Master data for all materials ("vật tư"): **INTERNAL** (used for production / internal sales) and **CLIENT** (supplied by, or bought to the specific requirement of, a client). Covers the catalog list/detail/CRUD, an image, extended technical info, a multi-file "images & documents" tab, a change-history ("lịch sử thay đổi") audit log, and a `material_groups` master. All materials are inventory-managed (inventory itself is a future module). Excel import/export is out of scope for now.

## Business rules

- **One code = one material** and codes are globally unique. `code` is **auto-generated** as `VT` + zero-padded sequence (`VT0001`) when omitted, and is **immutable** — `PATCH` cannot change it.
- **Type & client**: `type` is `INTERNAL` (default) or `CLIENT`. When `type = CLIENT`, `clientId` is **required** (`E040`) and must reference an existing client. When `type = INTERNAL`, any `clientId` is forced to `null`. On update, changing `type` or `clientId` re-validates this rule using the effective (merged with existing) values.
- **Status**: `ACTIVE` (đang sử dụng) / `INACTIVE` (ngừng sử dụng), default `ACTIVE`. "Ngừng sử dụng" is a plain `status` update (no side effects).
- **No soft delete**: materials have no `deletedAt`. Delete is a **hard delete**, allowed only when the material has no transactions. (No inventory/PO/BOM tables exist yet, so the guard currently always passes — `E041` is reserved for when they do. Attachments and change-logs cascade on delete.)
- **FKs**: `unitId` (required, `units`), `materialGroupId` (required, `material_groups`), `clientId` (optional, `clients`), `preferredSupplierId` (optional, `suppliers`). Missing references raise `E011` / `E037` / `E009` / `E019` respectively.
- **Extended info** (all optional, typed columns): `materialGrade`, `technicalStandard`, `dimensions`, `specificWeight` (numeric — returned as a string), `colorSurface`, `description`, `origin`, `preferredSupplierId`, `leadTime`.
- **Images & documents**: single `imageUrl` for the avatar; a `material_attachments` child table for the docs tab. Both are **replace-all** — sending `attachments: []` clears them, omitting the key leaves them untouched. Files are uploaded first (see integration notes) and their URLs sent as fields.
- **Change history**: every create/update writes a `material_logs` row (`action` CREATE/UPDATE, a `changes` diff `{ field: { from, to } }`, `changedBy`). Read via `GET /materials/:id/logs`.
- **Material groups** are full CRUD; a group cannot be deleted while any material references it (`E039`); a group `code` is unique (`E038`) and immutable on update.

## API contract

All routes require a bearer token; permissions are enforced (secure-by-default).

| Method | Path | Auth (permission) | Request | Response |
| ------ | ---- | ----------------- | ------- | -------- |
| GET | `/materials` | `materials:read` | `GetMaterialsReqDto` (paginated; `q`, `type`, `materialGroupId`, `clientId`, `status`) | `200` + paginated `MaterialResDto` |
| GET | `/materials/:id` | `materials:read` | — | `200` + `MaterialResDto` (with attachments) |
| GET | `/materials/:id/logs` | `materials:read` | paginated | `200` + paginated `MaterialLogResDto` |
| POST | `/materials` | `materials:create` | `CreateMaterialReqDto` | `201` + `MaterialResDto` |
| PATCH | `/materials/:id` | `materials:update` | `UpdateMaterialReqDto` (no `code`) | `200` + `MaterialResDto` |
| DELETE | `/materials/:id` | `materials:delete` | — | `204 No Content` |
| GET | `/material-groups` | `materials:read` | paginated (`q` on code/name) | `200` + paginated `MaterialGroupResDto` |
| GET | `/material-groups/:id` | `materials:read` | — | `200` + `MaterialGroupResDto` |
| POST | `/material-groups` | `materials:create` | `CreateMaterialGroupReqDto` | `201` + `MaterialGroupResDto` |
| PATCH | `/material-groups/:id` | `materials:update` | `UpdateMaterialGroupReqDto` (no `code`) | `200` + `MaterialGroupResDto` |
| DELETE | `/material-groups/:id` | `materials:delete` | — | `204 No Content` |

- `q` on materials fuzzy-matches (`unaccent` ILIKE) `code`, `name`, and the material group's `name`.
- List uses `MaterialType` / `MaterialStatus` enum filters.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Material not found | `ErrorCode.E035` | 404 |
| Material code already taken | `ErrorCode.E036` | 409 |
| Material group not found | `ErrorCode.E037` | 404 |
| Material group code already taken | `ErrorCode.E038` | 409 |
| Delete a group still used by a material | `ErrorCode.E039` | 409 |
| `type = CLIENT` without a client | `ErrorCode.E040` | 400 |
| Delete a material that has transactions (reserved / future) | `ErrorCode.E041` | 409 |
| Unit / client / preferred supplier not found | `ErrorCode.E011` / `E009` / `E019` | 404 |

## Out of scope

- **Import/Export Excel** — deferred.
- **Inventory / stock quantity** — materials are "inventory-managed" conceptually, but there is no stock/transaction module yet; the delete-guard against transactions is a placeholder.
- Per-record (row-level) authorization; group-level permission scoping.

## Frontend integration notes

- **Breaking change (2026-07-19)**: `material-groups:manage` (used on POST/PATCH/DELETE `/material-groups`) was removed and folded into the `materials:*` codes: POST → `materials:create`, PATCH → `materials:update`, DELETE → `materials:delete`. GET `/material-groups` is unchanged (`materials:read`). Any role in the DB that only held `material-groups:manage` loses write access to material groups until re-granted the matching `materials:*` code via the role editor.
- **New (2026-07-18)**: the Materials module ships. All routes require `Authorization: Bearer <token>` and the listed permission (unlike the older products/clients read endpoints, which are public). A `403` `auth.error.forbidden` means the role lacks the permission.
- **Image / documents upload is two-step**: `POST /uploads` (image, ≤5MB jpeg/png/webp/gif) or `POST /uploads/document` (≤10MB pdf/doc/docx/xls/xlsx) → take the returned `url` → send it as `imageUrl` (single) or inside the `attachments[]` array (`{ url, filename, mimetype?, size? }`) on create/update. `attachments` is replace-all: `[]` clears, omit to keep.
- `code` is server-generated (`VTxxxx`) and immutable — don't send it on update; the field is rejected there.
- `type = CLIENT` requires `clientId` (`400` `material.error.client_required`); switching to `INTERNAL` clears the client server-side.
- Delete only works for materials with no transactions; today that's effectively always, but expect `409` `material.error.has_transactions` once inventory ships — fall back to setting `status: "INACTIVE"` (Ngừng sử dụng).
- `specificWeight` is returned as a **string** (numeric column); parse client-side if you need a number.
- Change-history tab → `GET /materials/:id/logs` (paginated), each entry `{ action, changes, changer, createdAt }`.
- Master data endpoints for the form dropdowns: `GET /material-groups`, `GET /units` (đơn vị tính), `GET /clients`, `GET /suppliers`. Seed scripts: `pnpm db:seed:units`, `pnpm db:seed:material-groups`.
