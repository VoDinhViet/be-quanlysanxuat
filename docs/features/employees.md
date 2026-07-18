# Feature: Employees (user profiles)

## Goal

Let an admin add a new user ("nhân sự") from the "Thêm nhân sự" screen: personal info, work info (department/position), and — optionally — an ERP login credential for that user, in a single submit.

## Business rules

- `code` is server-generated on create, `NV` + a zero-padded sequential number (e.g. `NV0001`), based on the current total row count. It cannot be supplied by the client.
- `fullName`, `gender`, `departmentId`, `positionId`, and `hireDate` are required. `gender` defaults to `MALE` at the DB level but must be sent explicitly by the create DTO (matches the form's default-checked "Nam" radio).
- `departmentId` must reference an existing `departments` row (`ErrorCode.E014` if not found); `positionId` must reference an existing `positions` row (`ErrorCode.E015` if not found).
- `idNumber` (CCCD/CMND) is optional but globally unique when provided (`ErrorCode.E013` on conflict).
- `status` defaults to `WORKING` (`WORKING | RESIGNED`), matching the form's "Tình trạng nhân sự" radio (Đang làm việc / Đã nghỉ việc). Setting it to `RESIGNED` also blocks the linked ERP credential (if any) from logging in or refreshing — see `docs/features/auth.md`.
- **Optional ERP credential**: sending `user { username, email, password }` (a `CreateCredentialReqDto`) inserts a row in `credentials` directly from `UsersService.createUser` (the same service/module that hosts this endpoint — there is no separate employees module/service anymore, see API contract) and links it as `users.credentialId`. This means:
  - The credential's password is bcrypt-hashed (10 salt rounds) and never stored or returned in plaintext.
  - `credentials` has no code of its own (see `docs/features/users.md`) — only the user gets the auto-generated `NVxxxx` code; the linked credential has no equivalent.
  - Username/email uniqueness is checked before insert (`ErrorCode.E001` / `E003`).
  - If `user` is omitted, no `credentials` row is created and `users.credentialId` stays `null`.
  - `credentials` has no name/gender/DOB/phone fields, and no active/inactive flag either (it's a login-credentials table only, see `docs/features/users.md`) — the user's `fullName` is **not** copied onto the created credential, and there is no separate "is this account active" toggle to set. A user's credential is only ever as "active" as `users.status` (`WORKING`/`RESIGNED`) — there is no independent credential-level status.
  - Credential creation runs **before** the user insert, so a failing credential (e.g. duplicate username) never leaves an orphan user row. This is not wrapped in a DB transaction — a failure between credential creation and user insert (rare, DB-error only) can leave an orphaned `credentials` row; acceptable at this stage per `.claude/rules/api-module.md`'s current lack of transaction usage across the codebase.
- `createdBy` is always taken from the bearer token (`sub` claim) — never accepted from the request body.
- `avatarUrl` is a plain string URL on `users`. At create time (no user row yet), it must be populated via the generic `POST /uploads` endpoint first (see `docs/features/uploads.md`): upload the image, then send the returned `url` as `avatarUrl` on `POST /users`.
- **Avatar upload for an existing user**: `POST /users/:userId/avatar` (multipart, field `file`, image ≤5MB — same constraints as `POST /uploads`, see `docs/features/uploads.md`) uploads the file **and** updates `users.avatarUrl` in one call, returning the refreshed `UserResDto`. `userId` must reference an existing user (`ErrorCode.E012` if not found). Unlike the generic upload endpoint, this one is not usable before the user exists.
- **Update**: `PATCH /users/:userId` (`UpdateUserReqDto`) updates profile fields on an existing user — every field is optional, only the fields sent in the request body change. `userId` must reference an existing user (`ErrorCode.E012` if not found). `departmentId`/`positionId`, if sent, must reference existing rows (same `E014`/`E015` as create). `idNumber`, if sent, must be globally unique, excluding the user's own current row (`ErrorCode.E013` on conflict with a *different* user). This endpoint does **not** touch the linked ERP credential (username/email/password) or `avatarUrl` — use `POST /users/:userId/avatar` for the avatar, and there is currently no endpoint to edit an existing credential (see `docs/features/users.md`).

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| POST | `/users` | jwt (`JwtAuthGuard`) | `CreateUserReqDto` (optional nested `user: CreateCredentialReqDto`) | `201` + `UserResDto` |
| PATCH | `/users/:userId` | jwt (`JwtAuthGuard`) | `UpdateUserReqDto` (all fields optional) | `UserResDto` |
| POST | `/users/:userId/avatar` | jwt (`JwtAuthGuard`) | `multipart/form-data`, field `file` (image ≤5MB) | `UserResDto` (with updated `avatarUrl`) |
| GET | `/departments` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<DepartmentResDto>` (dropdown data) |
| GET | `/positions` | public | `q`, `page`, `limit` | `OffsetPaginatedDto<PositionResDto>` (dropdown data) |

- `POST /users`, `PATCH /users/:userId`, and `POST /users/:userId/avatar` are all implemented as `UsersController`/`UsersService` methods (`createUser` / `updateUser` / `uploadUserAvatar`) — there is no dedicated `employees` NestJS module (controller/service/module); the `users`/`departments`/`positions` **database tables** still exist and are exactly what this feature reads/writes, but the API code lives under `src/api/users/`. See `docs/features/users.md` for the `credentials`-side framing of `POST /users`.
- `UserResDto` nests lightweight refs: `department { id, code, name }`, `position { id, code, name }`, and `account { id, username, email } | null` (only present when an ERP credential was provisioned; never includes the password or a status — see Business rules).
- `GET /departments` and `GET /positions` are minimal list-only endpoints to populate the "Phòng ban" / "Chức vụ" dropdowns on the form — full CRUD for these master-data entities is a separate, future task.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| `departmentId` does not reference an existing department (create or update) | `ErrorCode.E014` | 404 Not Found |
| `positionId` does not reference an existing position (create or update) | `ErrorCode.E015` | 404 Not Found |
| `idNumber` already taken by another user (create or update) | `ErrorCode.E013` | 409 Conflict |
| `user.username` already taken (create only) | `ErrorCode.E001` | 409 Conflict |
| `user.email` already taken (create only) | `ErrorCode.E003` | 409 Conflict |
| `userId` does not reference an existing user (`PATCH /users/:userId`, `POST /users/:userId/avatar`) | `ErrorCode.E012` | 404 Not Found |
| No file sent, or file is not an allowed image type (`POST /users/:userId/avatar`) | `ErrorCode.E016` | 400 Bad Request |
| File exceeds 5MB (`POST /users/:userId/avatar`) | `ErrorCode.E017` | 413 Payload Too Large |

## Out of scope

- No delete/soft-delete endpoint for users yet. `PATCH /users/:userId` covers profile edits, but there is still no endpoint to edit an existing user's linked ERP credential (username/email/password) — only creation via `POST /users`.
- No CRUD (create/update/delete) for `departments` / `positions` — only read-only list endpoints exist so far; rows must be seeded/inserted directly for now.
- No "Lưu nháp" (save draft) support — the form's draft button is frontend-only at this stage.
- `POST /users` (create) itself has no image upload wired in — `avatarUrl` there is still a plain string, populated by calling `POST /uploads` beforehand. Only `POST /users/:userId/avatar` (for an *existing* user) uploads and attaches the avatar in one call.
- No permission enforcement — `@Permissions('users:create')` is metadata only (per `.claude/rules/api-module.md`); actual protection comes solely from `@UseGuards(JwtAuthGuard)`.

## Frontend integration notes

- **New (2026-07-16)**: `PATCH /users/:userId` (`UpdateUserReqDto`) is now available to edit an existing user's profile fields (name, gender, DOB, ID number, phone, personal email, address, department, position, hire date, note, status) — every field optional, only the ones sent are changed. It does not accept the ERP credential or `avatarUrl`; use the existing avatar endpoint for the latter.
- **Breaking change (2026-07-16)**: the `errorCode` string values changed for the user-related error codes, to match the `users` table name:
  - `E012`: `employee.error.not_found` → `user.error.not_found`
  - `E013`: `employee.error.id_number_exists` → `user.error.id_number_exists`
  - Any FE code matching on the literal `errorCode` string (not just the HTTP status) must update.
- **New (2026-07-16)**: setting a user's `status` to `RESIGNED` now blocks their linked ERP credential from logging in or refreshing (`403`, `errorCode: "user.error.resigned"`) — see `docs/features/auth.md`.
- **Internal rename only (2026-07-16)**: this is a pure backend renaming — no API contract change. `POST /users` / `POST /users/:userId/avatar` keep the same paths, request/response JSON shapes, enum values, error codes, and status codes. What changed is purely internal: the DB table + Drizzle schema formerly called `employees` is now called `users`, and the table formerly called `users` (login) is now called `credentials` (see `docs/features/users.md`). `UserResDto`/`CreateUserReqDto`/`CreateCredentialReqDto` are the corresponding new class names — no frontend action needed. The avatar route's path param was renamed `:employeeId` → `:userId` at the code level only; the URL segment itself is unaffected (still `/users/{id}/avatar`).
- **Breaking change (2026-07-15)**: the create-employee endpoint moved from `POST /employees` to `POST /users` (Swagger tag is now `Users`, not `Employees`) — same request/response shape (`CreateUserReqDto` in, `UserResDto` out), only the path and Swagger grouping changed. `departments`/`positions` list endpoints are unaffected.
- **Breaking change (2026-07-15)**: the request's optional ERP-credential object was renamed from `account` to `user` (still the same 3 fields: `username`, `email`, `password`; DTO class is now `CreateCredentialReqDto`). Any FE payload sending `account: {...}` must switch to `user: {...}`. The **response** shape is unaffected — `UserResDto.account` (the created credential summary) keeps its name.
- Populate the "Phòng ban" / "Chức vụ" dropdowns from `GET /departments` / `GET /positions` (each supports `?q=` for search-as-you-type). These tables currently have no seed data or admin UI to populate them — coordinate with backend to insert rows before wiring up the dropdowns.
- `POST /users` requires `Authorization: Bearer <accessToken>`.
- To grant an ERP credential at creation time, send the `user` object (`username`, `email`, `password`); omit it entirely (or send `null`) when the "Cấp tài khoản ERP cho nhân viên này" checkbox is unchecked. There is no separate `confirmPassword` field on the backend — validate password confirmation client-side before submitting. There is also no "Trạng thái hoạt động" field on the backend — the credential has no independent active/inactive state, so that toggle (if kept in the UI) has nothing to submit; use the user's own "Tình trạng nhân sự" (`status: WORKING/RESIGNED`) as the single source of truth for whether the person/account is active.
- The response's `account` field is `null` when no credential was created; when present it never includes a password.
- Provisioning a credential via `POST /users` (this feature) is the only way to create a `credentials` row through the API — see `docs/features/users.md` for the `credentials`-side framing.
- **New feature (2026-07-15)**: to set an avatar while **creating** a user ("Thêm nhân sự" screen), first upload the image via `POST /api/uploads` (multipart, field `file`, image ≤5MB — see `docs/features/uploads.md`), then send the response's `url` as `avatarUrl` on `POST /users`. It's a separate call, not part of this endpoint's request body.
- **New feature (2026-07-15)**: to change the avatar of an **existing** user (e.g. an edit screen), call `POST /users/:userId/avatar` directly with the multipart file — no separate `POST /uploads` call needed for this case, the endpoint uploads and updates `users.avatarUrl` in one step and returns the updated `UserResDto`.
