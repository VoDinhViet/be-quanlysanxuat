# Feature: Operations

## Goal

Master data for **công đoạn** (production operations/steps), e.g. Cắt laser, Hàn, Sơn tĩnh điện. This is the source data for **Routing** (Phase 2 — sequencing which operations a product/part's structure node goes through) and the "Gia công ngoài" (outsourcing) screen, which is simply this catalog filtered to `type=OUTSOURCE`.

## Business rules

- `code` is globally unique. If omitted on create, it's auto-generated as `CD` + a zero-padded sequential number (e.g. `CD0001`), based on the current total row count.
- `type` is required on create: `INHOUSE` (nội bộ, done on the factory floor) or `OUTSOURCE` (gia công ngoài, sent to a supplier). This is the flag the "Gia công ngoài" screen filters on.
- `status` defaults to `ACTIVE` (`ACTIVE | INACTIVE`).
- Delete is a **soft delete** (`deletedAt` timestamp) — deleted operations are excluded from every read (list/detail). Soft delete (not hard) because routing (Phase 2) will hold a foreign key to a row here.
- `createdBy` is always taken from the bearer token (`sub` claim) on create — it is never accepted from the request body.
- Search (`q`) is **accent-insensitive** (e.g. "cat laser" matches "Cắt laser"), matching `name` only.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/operations` | public | `GetOperationsReqDto` (`q`, `type`, `status`, `page`, `limit`) | `OffsetPaginatedDto<OperationResDto>` |
| GET | `/operations/:id` | public | — | `OperationResDto` |
| POST | `/operations` | jwt (`JwtAuthGuard`) | `CreateOperationReqDto` | `201` + `OperationResDto` |
| PATCH | `/operations/:id` | jwt | `UpdateOperationReqDto` (all fields optional) | `OperationResDto` |
| DELETE | `/operations/:id` | jwt | — | `204` (soft delete) |

- `OperationResDto` nests a lightweight `creator { id, username } | null`.
- List/detail read routes are public, consistent with `products`/`clients`/`suppliers`. Only write routes (create/update/delete) require a valid bearer access token.
- The "Gia công ngoài" (outsourcing) menu is `GET /operations?type=OUTSOURCE` — there is no separate outsourcing entity in this phase.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Operation not found (detail/update/delete) | `ErrorCode.E046` | 404 Not Found |
| Operation `code` already taken (create/update, explicit code only) | `ErrorCode.E047` | 409 Conflict |

## Out of scope

- No routing/sequencing yet — this is pure master data. Assigning operations to a product's structure nodes in order (`node_operations`, "STT = thứ tự chạy") is Phase 2.
- No `default_supplier_id` on an `OUTSOURCE` operation yet — which supplier a gia-công step goes to is decided per routing step, not on the operation master record (may be added in a later phase).
- No permission enforcement — `@Permissions('operations:*')` decorators are metadata only (per `.claude/rules/api-module.md`); actual protection on write routes comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **New feature (2026-07-21)**: `operations` is a brand-new endpoint — nothing existed before this. Non-breaking (nothing to migrate from). Seed data available via `pnpm db:seed:operations` (Cắt laser, Chấn, Hàn, Mài, Lắp ráp tổng, Đóng gói = `INHOUSE`; Sơn tĩnh điện = `OUTSOURCE`).
- Populate any "Công đoạn" dropdown/filter from `GET /operations` (supports `?q=` for search-as-you-type, `?type=` to split Inhouse vs Gia công ngoài).
- Write actions (Thêm/Sửa/Xóa) require `Authorization: Bearer <accessToken>` — a logged-out user can still view the list/detail but gets `401` attempting to create/edit/delete.
