# Feature: Users (login credentials)

## Goal

Manage ERP login credentials: list/view credentials, "my profile", and `POST /users` — which creates a new user ("nhân sự") record and, optionally, links a freshly-provisioned login credential to it. Full business rules for the profile side (department/position, personal info, etc.) live in `docs/features/employees.md`; this doc covers the `credentials` (login) angle.

## Business rules

- `username` and `email` are each globally unique. `username`/`email` conflicts both raise the same error (`E001`); email conflicts specifically raise `E003` — see Error cases.
- `username`, `email`, and `password` are all **required** (`NOT NULL`) at the DB level — every creation path (the optional `user` object on `POST /users`, `pnpm db:seed:superadmin`) always supplies all three.
- `password` is always stored bcrypt-hashed (10 salt rounds) — a plaintext password never reaches the DB or a response.
- `credentials` is a **login credential only** — it has no name/gender/DOB/phone fields of its own. Personal/HR info for a user lives on the `users` table (see `docs/features/employees.md`); a `credentials` row is just the login secrets a user's ERP account logs in with.
- `credentials` has no active/inactive flag of its own either. A user's ERP credential is only ever as "active" as `users.status` (`WORKING`/`RESIGNED`) says it is; a credential with no linked user (e.g. the seeded superadmin) is always considered active. Nothing currently gates login on this either way (see Out of scope).
- A `credentials` row can only ever be created as a side effect of `POST /users` (which always creates a `users` row too, and optionally a linked credential — see `docs/features/employees.md` for the full request/response shape), or via the `pnpm db:seed:superadmin` script. There is no bare "create just a login credential with no user" endpoint.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/users/me` | jwt (`JwtAuthGuard`) | — (bearer access token) | `CredentialResDto` |
| GET | `/users` | jwt | `GetUsersReqDto` (extends `PageOptionsDto`: `limit`, `page`, `q`, `order`) | `OffsetPaginatedDto<CredentialResDto>` |
| GET | `/users/:userId` | jwt | — | `CredentialResDto` |
| POST | `/users` | jwt + `users:create` | `CreateUserReqDto` (optional nested `user: CreateCredentialReqDto`) | `201` + `UserResDto` |
| PATCH | `/users/:userId/role` | jwt + `roles:manage` | `AssignRoleReqDto` (`roleId`) | `200` + `UserResDto` |

- List search (`q`) matches `email` or `username` (case-insensitive substring, `ilike`).
- `POST /users` creates a **user**, optionally with a linked ERP credential — it does not return a plain `CredentialResDto`. See `docs/features/employees.md` for the full field-by-field business rules and request/response shape (`CreateUserReqDto` / `UserResDto`); this endpoint is documented there in detail since the entity being created is primarily a user (profile) record.
- **Auth (as of 2026-07-18)**: authorization is now enforced globally (see `docs/features/authorization.md`). `GET /users` and `GET /users/:userId` now require a valid token **and** the `users:update` permission (previously their `@Permissions` was inert and both were reachable by anyone). `GET /users/me` needs only a valid, non-blacklisted bearer token — the caller's identity comes from the token's `sub` claim, not a path/query param.
- `PATCH /users/:userId/role` sets the given role on the user's linked login **credential** (that's where `roleId` lives). Fails if the user has no linked credential (`E032`) or the role doesn't exist (`E027`). Takes effect on the next request (permission cache invalidated).

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Credential not found (`GET /users/:userId`) | `ErrorCode.E002` | 404 Not Found |
| `user.username` already taken (`POST /users`, only when `user` is sent) | `ErrorCode.E001` | 409 Conflict |
| `user.email` already taken (`POST /users`, only when `user` is sent) | `ErrorCode.E003` | 409 Conflict |

`POST /users` can also fail with user-specific errors (department/position not found, duplicate CCCD/CMND) — see `docs/features/employees.md`.

## Out of scope

- No update/delete/password-change endpoint exists on `/users` — a credential can only be created via `POST /users` (always alongside a user) or `pnpm db:seed:superadmin`. There is currently no way to edit an existing credential's username/email or reset its password through any API.
- No soft delete.
- No active/inactive gate on login — `credentials` has no status field at all; only `users.status` exists, and nothing currently reads it to block login. (Role/permission enforcement now **does** exist — see `docs/features/authorization.md`.)

## Frontend integration notes

- **Internal rename only (2026-07-16)**: this is a pure backend renaming — no API contract change. Route paths, JSON field names, enum values, error codes, and status codes are all unchanged. What changed is purely internal: the DB table + Drizzle schema formerly called `users` (login) is now called `credentials`, and the table formerly called `employees` is now called `users` (see `docs/features/employees.md`). `CredentialResDto`/`UserResDto`/`CreateUserReqDto`/`CreateCredentialReqDto` are the corresponding new class names — no frontend action needed.
- **Breaking change (2026-07-16)**: `username`/`email`/`password` on the `credentials` table are now `NOT NULL` at the DB level (previously nullable to allow a hypothetical placeholder credential). No current endpoint ever produced a row with any of them null, so this has no observable effect on any response shape.
- **Breaking change (2026-07-16)**: the `errorCode` string values changed for the credential-related error codes, to match the `credentials` table name:
  - `E001`: `user.error.username_or_email_exists` → `credential.error.username_or_email_exists`
  - `E002`: `user.error.not_found` → `credential.error.not_found`
  - `E003`: `user.error.email_exists` → `credential.error.email_exists`
  - `E004`: `user.error.invalid_credentials` → `credential.error.invalid_credentials`
  - Any FE code matching on the literal `errorCode` string (not just the HTTP status) must update. See `docs/features/auth.md` for the related login/refresh `E018` addition.
- **Breaking change (2026-07-15)**: the "Thêm nhân sự" create endpoint moved from `POST /employees` to `POST /users` (same request/response shape — `CreateUserReqDto` in, `UserResDto` out; see `docs/features/employees.md`). The standalone `employees` API module/tag no longer exists; the route is now hosted under `Users`/`/users` in Swagger.
- **Breaking change (2026-07-15)**: the old `POST /users` / `PATCH /users/:userId` / `PATCH /users/:userId/password` (plain account create/update/password-change) were removed entirely earlier in the same day and never shipped to consumers — `POST /users` today means "create a user (+ optional credential)", not "create a bare login credential". Note the class name `CreateUserReqDto` has since been **repurposed**: it used to be the small `{ username, email, password }` shape; that shape is now `CreateCredentialReqDto`, nested under `CreateUserReqDto.user`.
- **Breaking change (2026-07-15)**: the optional ERP-credential field on `CreateUserReqDto` was renamed from `account` to `user` (still `{ username, email, password }`). Any payload sending `account: {...}` must switch to `user: {...}`. The **response** field `UserResDto.account` is unaffected.
- **Breaking change (2026-07-15)**: `status` was removed from `credentials` entirely (in addition to the personal-info fields below).
  - `CredentialResDto` no longer returns `status`.
  - `GET /users` no longer supports a `status` filter.
  - There is no more account-level `UserStatus` (`ACTIVE`/`INACTIVE`) enum in the API at all. If the FE needs an "is this person active" signal for someone with a user record, use `UserResDto.status` (`WORKING`/`RESIGNED`) instead — credentials without a linked user (e.g. superadmin) have no such concept and should be treated as always active.
- **Breaking change (2026-07-15)**: `fullName`, `phoneNumber`, `dateOfBirth`, `gender` were removed from `credentials` entirely.
  - `CredentialResDto` no longer returns `fullName`, `phoneNumber`, `dateOfBirth`, or `gender` — remove any FE code reading them off a credential object.
  - List search (`q`) no longer matches `fullName` (only `email`/`username` now).
  - This info now lives on the `users` table (see `docs/features/employees.md`) — a user's name/gender/DOB/phone/etc. comes from `UserResDto`, not from the linked `credentials` row.
  - `products.creator` (nested in `ProductResDto`) changed shape: `{ id, fullName }` → `{ id, username }`, since `credentials.fullName` no longer exists (see `docs/features/products.md`).
- **Breaking change (2026-07-15)**: `code` was removed from `credentials` entirely. `CredentialResDto` no longer returns `code`; there is no more `USxxxx` account code anywhere in the API. (The user's own `NVxxxx` code on `UserResDto` is unaffected — see `docs/features/employees.md`.)
- A default seeded superadmin credential exists (`username: superadmin`, `email: superadmin@tienhuy.com`) for initial login — see `pnpm db:seed:superadmin` in the repo README/CLAUDE.md if credentials need to be regenerated.
- `GET /users/me` returns the logged-in credential's own `CredentialResDto`, resolved from the bearer access token — no path/query param needed. Requires `Authorization: Bearer <accessToken>`. Prefer this over decoding the token yourself and calling `GET /users/:userId`.
- **Breaking change (2026-07-18)**: `GET /users` and `GET /users/:userId` now require a bearer token **and** the `users:update` permission (were previously open). New endpoint `PATCH /users/:userId/role` (`{ roleId }`, needs `roles:manage`) assigns a role to a user. See `docs/features/authorization.md` for the roles/permissions model and the permission catalogue endpoint.
