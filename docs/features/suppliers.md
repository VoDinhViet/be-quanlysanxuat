# Feature: Suppliers

## Goal

Manage the master list of suppliers ("Quản lý nhà cung cấp") shown on the suppliers list screen: search/filter, view stats, view detail, create, edit, and delete suppliers, each linked to a supplier group, an optional country, payment info, a logo, and document attachments.

## Business rules

- `code` is globally unique. If omitted on create, it's auto-generated as `NCC` + a zero-padded sequential number (e.g. `NCC0001`), based on the current total row count.
- `taxCode` (mã số thuế) is globally unique across suppliers.
- `supplierGroupId` is required and must reference an existing `supplier_groups` row (`ErrorCode.E021` if not found).
- `countryId` is optional; when provided it must reference an existing `countries` row (`ErrorCode.E023` if not found), and can be cleared by sending `null` on update.
- `type` (`INDIVIDUAL | COMPANY | HOUSEHOLD`) is required.
- `status` defaults to `ACTIVE` on create (`ACTIVE | PAUSED | STOPPED`). There is no enforced state machine — any status can be set to any other via update.
- `payment` is a nested object holding bank/payment info (`bankName`, `bankAccountNumber`, `bankAccountHolder`, `bankBranch`, `defaultPaymentMethod`, `defaultPaymentTerm`, `creditLimit`, `creditLimitStartDate`), stored in its own `supplier_payment_info` table with a **mandatory 1-1** relation to the supplier — every supplier always has exactly one payment info row (created automatically alongside the supplier, even if `payment` is omitted entirely on create, in which case all its fields are `null`).
  - `defaultPaymentMethod` (`CASH | BANK_TRANSFER`) and `defaultPaymentTerm` (`IMMEDIATE | NET_15 | NET_30 | NET_60`) are fixed enums, not editable master data.
  - `creditLimit` is an optional non-negative integer (VND).
  - On update, `payment` is a **partial merge**: only the sub-fields actually sent are overwritten; omitted sub-fields keep their current value. Omitting `payment` entirely leaves all payment info untouched.
- `rating` is an optional integer 0–5.
- Delete is a **soft delete** (`deletedAt` timestamp) — deleted suppliers are excluded from every read (list/detail/stats).
- `createdBy` is always taken from the bearer token (`sub` claim) on create — never accepted from the request body.
- Search (`q`) is **accent-insensitive**, matching `code`, `name`, `taxCode`, or any of the supplier's `representatives[].name`.
- `attachments` (tài liệu đính kèm) is a **replace-all** list: sending `attachments` on create/update inserts exactly that set (existing attachments not included are deleted). Omitting `attachments` on update leaves existing attachments untouched.
- `representatives` (người đại diện) is a **replace-all** list (same semantics as `attachments`), stored in its own `supplier_representatives` table — a supplier can have zero or many representatives, each with `name` (required), `phoneNumber` (optional), and `isPrimary` (boolean, defaults `false`; the FE decides how to use it — e.g. show the primary one on the list screen — the backend does not enforce exactly one primary).
- `logoUrl` and each attachment's `url` are plain strings populated by first calling the upload endpoints (see below) — there's no direct file upload on the supplier endpoints themselves.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/suppliers` | public | `GetSuppliersReqDto` (`q`, `status`, `supplierGroupId`, `countryId`, `page`, `limit`) | `OffsetPaginatedDto<SupplierResDto>` |
| GET | `/suppliers/stats` | public | — | `SupplierStatsResDto` (`total`, `active`, `paused`, `stopped`) |
| GET | `/suppliers/:id` | public | — | `SupplierResDto` |
| POST | `/suppliers` | jwt (`JwtAuthGuard`) | `CreateSupplierReqDto` | `201` + `SupplierResDto` |
| PATCH | `/suppliers/:id` | jwt | `UpdateSupplierReqDto` (all fields optional) | `SupplierResDto` |
| DELETE | `/suppliers/:id` | jwt | — | `204` (soft delete) |
| GET | `/supplier-groups` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<SupplierGroupResDto>` (dropdown data) |
| GET | `/countries` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<CountryResDto>` (dropdown data) |
| POST | `/uploads` | jwt | multipart `file` (image, ≤5MB) | `201` + `UploadResDto` — use for `logoUrl` |
| POST | `/uploads/document` | jwt | multipart `file` (pdf/doc/docx/xls/xlsx, ≤10MB) | `201` + `UploadResDto` — use for each attachment |

- `SupplierResDto` nests: `group { id, code, name }`, `country { id, code, name, logoUrl } | null` (`logoUrl` is a flag icon, seeded from a public flag CDN — see Business rules), `payment { bankName, bankAccountNumber, bankAccountHolder, bankBranch, defaultPaymentMethod, defaultPaymentTerm, creditLimit, creditLimitStartDate }` (never `null` — always present, its fields may individually be `null`), `attachments [{ id, url, filename, mimetype, size }]`, `representatives [{ id, name, phoneNumber, isPrimary }]`, `creator { id, username } | null`.
- List/detail/stats read routes are public (consistent with the rest of the module set at this stage of the project). Only write routes (create/update/delete) require a valid bearer access token.
- `GET /supplier-groups` and `GET /countries` are minimal list-only endpoints to populate the "Nhóm NCC" and "Quốc gia" dropdowns/filters — full CRUD for either is out of scope (seeded data only, see Out of scope).
- `GET /suppliers/stats` counts non-deleted suppliers grouped by `status`; `total` is the sum of all three.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Supplier not found (detail/update/delete) | `ErrorCode.E019` | 404 Not Found |
| Supplier `code` already taken (create/update, explicit code only) | `ErrorCode.E020` | 409 Conflict |
| `supplierGroupId` does not reference an existing supplier group | `ErrorCode.E021` | 404 Not Found |
| Supplier `taxCode` already taken (create/update) | `ErrorCode.E022` | 409 Conflict |
| `countryId` does not reference an existing country | `ErrorCode.E023` | 404 Not Found |
| Upload: missing/invalid file type | `ErrorCode.E016` | 400 Bad Request |
| Upload: file exceeds size limit (5MB image / 10MB document) | `ErrorCode.E017` | 400 Bad Request |

## Out of scope

- No CRUD (create/update/delete) for `supplier_groups` or `countries` — only read-only list endpoints exist; both are seeded via `pnpm db:seed:supplier-groups` / `pnpm db:seed:countries`. `countries` ships with a shortlist (~20 common trading-partner countries), not the full ISO 3166 list. Each seeded country's `logoUrl` points to a public flag CDN (flagcdn.com) by ISO code — not our own uploads storage, and not settable via any endpoint (seed-only).
- No approval/workflow around status changes — any authenticated write can set any `status`.
- No versioned/audit history of supplier edits, including payment info changes.
- No support for multiple bank accounts per supplier — `payment` is a single 1-1 record, not a list.
- No enforcement that exactly one `representatives[]` entry has `isPrimary: true` — the backend stores whatever the client sends as-is.
- No backend Excel export — the frontend is expected to export from the already-fetched list data.
- No permission enforcement — `@Permissions('suppliers:*')` decorators are metadata only (per `.claude/rules/api-module.md`); actual protection on write routes comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **New feature (2026-07-18)**: `suppliers`, `supplier-groups`, `countries`, and the `POST /uploads/document` endpoint are brand-new — nothing existed before this. Non-breaking (nothing to migrate from).
- **Internal restructuring (2026-07-18)**: the single "Người đại diện" / "Điện thoại người đại diện" fields (`representativeName`/`representativePhone`) were replaced same-day, before any real consumer, by a `representatives[]` array (`{ name, phoneNumber, isPrimary }`) supporting multiple representatives per supplier — same replace-all semantics as `attachments`.
- Country is now a dropdown backed by `GET /countries` (send the selected row's `id` as `countryId`), not free-text — populate it the same way as "Nhóm NCC" (supports `?q=` for search-as-you-type).
- Payment/bank fields are sent and received as a nested `payment { ... }` object, not flat top-level fields. On update, `payment` is a partial merge (only send the sub-fields you're changing); omit `payment` entirely to leave all payment info untouched.
- Upload the logo via `POST /uploads` (existing image endpoint, unchanged) and send the returned `url` as `logoUrl`. Upload each document attachment via the new `POST /uploads/document` endpoint and collect `{ url, filename, mimetype, size }` from each response into the `attachments` array sent on create/update.
- `attachments` and `representatives` are both replace-all: to keep existing entries on update, you must resend the full set (fetch the current `SupplierResDto.attachments`/`representatives` first and merge client-side).
- Populate the 4 stat cards (Tổng NCC / Đang hoạt động / Tạm ngưng / Đã ngừng hợp tác) from `GET /suppliers/stats`.
- Write actions (Thêm/Sửa/Xóa) require `Authorization: Bearer <accessToken>` — a logged-out user can still view the list/detail/stats but gets `401` attempting to create/edit/delete.
- The search box can send accent-insensitive Vietnamese text directly; it matches supplier code, name, tax code, and any representative's name.
