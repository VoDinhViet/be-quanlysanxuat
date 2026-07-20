# Feature: Materials (Danh mục vật tư)

## Goal

Master data for all materials ("vật tư"): **INTERNAL** (used for production / internal sales) and **CLIENT** (supplied by, or bought to the specific requirement of, a client).

**Phase 1 (current) ships only the list and create screens** — `GET /materials`, `POST /materials`, plus a read-only `GET /material-groups` for the group dropdown. Detail, update, delete and the change-history log are deliberately deferred; see "Out of scope".

## Business rules

- **One code = one material** and codes are globally unique. `code` is **auto-generated** as `VT` + zero-padded sequence (`VT0001`) when omitted, and is immutable once written.
- **Type & client**: `type` is `INTERNAL` (default) or `CLIENT`. When `type = CLIENT`, `clientId` is **required** (`E040`) and must reference an existing, non-deleted client. When `type = INTERNAL`, any supplied `clientId` is forced to `null`.
- **Status**: `ACTIVE` (đang sử dụng) / `INACTIVE` (ngừng sử dụng), default `ACTIVE`.
- **No soft delete**: materials have no `deletedAt`. (No delete route exists yet in phase 1.)
- **FKs**: `unitId` (required, `units`), `materialGroupId` (required, `material_groups`), `clientId` (optional, `clients`). Missing references raise `E011` / `E037` / `E009` respectively. `unitId` must also carry the `MATERIAL` scope (`E043` if not — see `docs/features/units.md`).
- **Extended info** (all optional): `materialGrade`, `technicalStandard`, `dimensions`, `specificWeight` (numeric — returned as a **string**), `colorSurface`, `description`, `origin`, `leadTime`.
- **Images & documents** go through the **file registry** (`docs/features/files.md`), never bare URLs: upload first via `POST /files`, then send `imageFileId` (the avatar) and `attachmentFileIds: string[]` (the documents tab). Every id is validated before the write — an unknown one 404s with `E042` and **nothing is persisted**.
- **Atomic create**: the `materials` row and its `material_attachments` rows are written inside a single `db.transaction(...)`. If the attachment insert fails, the material row is rolled back too — a create either lands completely or not at all.
- **Material groups** are read-only in phase 1 (seeded via `pnpm db:seed:material-groups`).

## API contract

All routes require a bearer token; permissions are enforced (secure-by-default).

| Method | Path | Auth (permission) | Request | Response |
| ------ | ---- | ----------------- | ------- | -------- |
| GET | `/materials` | `materials:read` | `GetMaterialsReqDto` (paginated; `q`, `type`, `materialGroupId`, `clientId`, `status`) | `200` + paginated `MaterialResDto` |
| POST | `/materials` | `materials:create` | `CreateMaterialReqDto` | `201` + `MaterialResDto` |
| GET | `/material-groups` | `materials:read` | paginated (`q` on code/name) | `200` + paginated `MaterialGroupResDto` |

- `q` on materials fuzzy-matches (`unaccent` ILIKE) `code`, `name`, and the material group's `name`.
- The list response omits `attachments` (it only carries `unit`, `group`, `client`, `creator`, `image`); the create response carries the full detail shape including `attachments`.
- `MaterialResDto.image` and `attachments[].file` are nested `FileResDto` objects — read the displayable URL from `.url`.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Material not found (re-read after create) | `ErrorCode.E035` | 404 |
| Material code already taken | `ErrorCode.E036` | 409 |
| Material group not found | `ErrorCode.E037` | 404 |
| `type = CLIENT` without a client | `ErrorCode.E040` | 400 |
| Unit / client not found | `ErrorCode.E011` / `E009` | 404 |
| The unit exists but isn't usable on materials | `ErrorCode.E043` | 400 |
| `imageFileId` / `attachmentFileIds` references an unknown file | `ErrorCode.E042` | 404 |

`E038` (group code taken), `E039` (group in use) and `E041` (material has transactions) stay **reserved** with their original meanings — the routes that raise them arrive with phase 2.

## Out of scope

- **Phase 2**: `GET /materials/:id`, `PATCH`, `DELETE`, the `material_logs` change history, and material-group CRUD. The `materials:update` / `materials:delete` permission codes are intentionally **not** in the catalogue until those routes exist.
- **Import/Export Excel** — deferred.
- **Inventory / stock quantity** — no stock or transaction module yet.
- Per-record (row-level) authorization.

## Known limitation

`generateMaterialCode()` counts existing rows and adds 1, so two concurrent creates without an explicit `code` can pick the same one. `materials.code` carries a DB unique constraint, so the loser gets a raw unique-violation (500) rather than a duplicate row — it is not currently translated to `E036`.

## Frontend integration notes

- **2026-07-20**: materials is back after being removed earlier the same day, rebuilt as phase 1 with **only** `GET /materials`, `POST /materials` and `GET /material-groups`. Permission codes are `materials:read` and `materials:create` (no `:update` / `:delete` yet — the role editor will not show them).
- **Breaking change (2026-07-20)**: `preferredSupplierId` was removed from `CreateMaterialReqDto`, and `preferredSupplier` from `MaterialResDto` — the suppliers module it referenced was deleted. Sending the field is now silently dropped by the validation pipe (`whitelist: true`); drop the "Nhà cung cấp ưu tiên" input from the material form.
- Images and attachments are **file ids, not URLs**: `POST /files` first, then send `imageFileId` and `attachmentFileIds`. Responses return nested file objects (`image.url`, `attachments[].file.url`), never a flat `imageUrl`.
- `specificWeight` comes back as a **string** (Postgres `numeric`), not a number — parse it client-side before doing math.
- **Breaking change (2026-07-20)**: the ĐVT dropdown must pass `GET /units?scope=MATERIAL`. Without the scope the list also carries product-only units, and submitting one is rejected with **400 `E043`**.
- **Breaking change (2026-07-20)**: `GET /units` no longer paginates — it returns `UnitResDto[]` directly instead of `{ data, pagination }`, ordered alphabetically by name. Read the array straight off the response and drop `?page=`/`?limit=`. `GET /material-groups` is unaffected and still paginated.
- Seed the group dropdown from `GET /material-groups`; the six default groups (`THEP_TAM`, `THEP_CUON`, `ONG_INOX`, `NHOM_TAM`, `BU_LONG`, `SON`) are created by `pnpm db:seed:material-groups`.
