# Feature: Clients

## Goal

Manage the master list of clients ("Quản lý khách hàng") shown on the customers list screen: search/filter, view detail, create, edit, and delete clients, each linked to a client group and zero or many contacts. Existing `products.clientId` continues to reference this table unchanged.

## Business rules

- `code` is globally unique. If omitted on create, it's auto-generated as `KH` + a zero-padded sequential number (e.g. `KH0001`), based on the current total row count.
- `clientGroupId` is required and must reference an existing `client_groups` row (`ErrorCode.E026` if not found).
- `taxCode` (mã số thuế) is optional; when provided it must be globally unique across clients (`ErrorCode.E025` if taken).
- `status` (`ACTIVE | PAUSED`) defaults to `ACTIVE` on create. There is no enforced state machine — any status can be set to any other via update.
- Delete is a **soft delete** (`deletedAt` timestamp) — deleted clients are excluded from every read (list/detail).
- `createdBy` is always taken from the bearer token (`sub` claim) on create — never accepted from the request body.
- Search (`q`) is **accent-insensitive**, matching `code`, `name`, `taxCode`, `email`, `phoneNumber`, or any of the client's `contacts[].name`.
- `contacts` (người liên hệ) is a **replace-all** list: sending `contacts` on create/update inserts exactly that set (existing contacts not included are deleted). Omitting `contacts` on update leaves existing contacts untouched. Each contact has `name` (required), `position`, `phoneNumber`, `email`, `note` (all optional), and `isPrimary` (boolean, defaults `false`; the FE decides how to use it — the backend does not enforce exactly one primary).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/clients` | public | `GetClientsReqDto` (`q`, `status`, `clientGroupId`, `page`, `limit`) | `OffsetPaginatedDto<ClientResDto>` |
| GET | `/clients/:id` | public | — | `ClientResDto` |
| POST | `/clients` | jwt (`JwtAuthGuard`) | `CreateClientReqDto` | `201` + `ClientResDto` |
| PATCH | `/clients/:id` | jwt | `UpdateClientReqDto` (all fields optional) | `ClientResDto` |
| DELETE | `/clients/:id` | jwt | — | `204` (soft delete) |
| GET | `/client-groups` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<ClientGroupResDto>` (dropdown data) |

- `ClientResDto` nests: `group { id, code, name }`, `contacts [{ id, name, position, phoneNumber, email, note, isPrimary }]`, `creator { id, username } | null`.
- List/detail read routes are public (consistent with the rest of the module set at this stage of the project). Only write routes (create/update/delete) require a valid bearer access token.
- `GET /client-groups` is a minimal list-only endpoint to populate the "Nhóm khách hàng" dropdown/filter — full CRUD is out of scope (seeded data only, see Out of scope).

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Client not found (detail/update/delete) | `ErrorCode.E009` | 404 Not Found |
| Client `code` already taken (create/update, explicit code only) | `ErrorCode.E024` | 409 Conflict |
| Client `taxCode` already taken (create/update) | `ErrorCode.E025` | 409 Conflict |
| `clientGroupId` does not reference an existing client group | `ErrorCode.E026` | 404 Not Found |

## Out of scope

- No stat cards / counts endpoint (unlike `suppliers`, there's no `GET /clients/stats`).
- No "Khu vực" (region) field or filter — not modeled at this stage; add later once the FE form gains a corresponding field.
- No payment/bank info, logo, or file attachments on clients (unlike `suppliers`).
- No CRUD (create/update/delete) for `client_groups` — only a read-only list endpoint exists; seeded via `pnpm db:seed:client-groups` (3 groups: Chiến lược / Thường / Tiềm năng).
- No approval/workflow around status changes — any authenticated write can set any `status`.
- No versioned/audit history of client edits.
- No permission enforcement — `@Permissions('clients:*')` decorators are metadata only (per `.claude/rules/api-module.md`); actual protection on write routes comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **Breaking change (2026-07-18)**: `GET /clients` previously returned only `{ id, code, name }` (list-only master data). It is now a full CRUD resource — the response DTO gained `taxCode`, `phoneNumber`, `email`, `address`, `note`, `group`, `status`, `contacts`, `creator`, `createdAt`, `updatedAt`. Any existing FE code consuming the old minimal shape keeps working (fields were only added, not removed or renamed).
- **New endpoints (2026-07-18)**: `POST /clients`, `GET /clients/:id`, `PATCH /clients/:id`, `DELETE /clients/:id`, and `GET /client-groups` are brand-new.
- Client group is a dropdown backed by `GET /client-groups` (send the selected row's `id` as `clientGroupId`), populated the same way as "Nhóm NCC" in suppliers (supports `?q=` for search-as-you-type).
- Contacts are replace-all: to keep existing entries on update, you must resend the full set (fetch the current `ClientResDto.contacts` first and merge client-side).
- Write actions (Thêm/Sửa/Xóa) require `Authorization: Bearer <accessToken>` — a logged-out user can still view the list/detail but gets `401` attempting to create/edit/delete.
- The search box can send accent-insensitive Vietnamese text directly; it matches client code, name, tax code, email, phone number, and any contact's name.
- The "Khu vực" filter shown on the list mockup has no backend support yet — hide it or leave it non-functional until a `region` field is added.
