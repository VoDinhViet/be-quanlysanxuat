# Feature: Users

## Goal

Manage user accounts (create, list, view detail, update profile, change password) that back the `auth` login flow.

## Business rules

- `username`, `email`, and `code` are each globally unique. `username`/`email` conflicts both raise the same error (`E001`); a `code` conflict is separate (`E005`).
- `code` is optional on create: if omitted, it's auto-generated as `US` + a zero-padded sequential number (e.g. `US0001`), based on the current total row count. It is never regenerated on update.
- `password` is always stored bcrypt-hashed (10 salt rounds) — a plaintext password never reaches the DB or a response.
- New users default to `status = ACTIVE` if not specified.
- On update, uniqueness is re-checked only for fields actually present in the request, and the current user's own row is excluded from the conflict check (a user can keep their own username/email/code).
- Changing password is a separate endpoint from profile update — it does not require re-supplying other profile fields.
- `fullName`, `phoneNumber`, `dateOfBirth`, `gender` are optional/nullable — no validation beyond type/length.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/users` | jwt | `GetUsersReqDto` (extends `PageOptionsDto`: `limit`, `page`, `q`, `order`, `status?`) | `OffsetPaginatedDto<UserResDto>` |
| GET | `/users/:userId` | jwt | — | `UserResDto` |
| POST | `/users` | jwt | `CreateUserReqDto` | `201` + `UserResDto` |
| PATCH | `/users/:userId` | jwt | `UpdateUserReqDto` (all fields optional) | `UserResDto` |
| PATCH | `/users/:userId/password` | jwt | `ChangeUserPasswordReqDto` (`password`) | `UserResDto` |

- List search (`q`) matches `email`, `username`, or `fullName` (case-insensitive substring, `ilike`).
- List can additionally filter by exact `status`.
- Note: routes carry `@Permissions('users:*')` as metadata only — it is **not enforced**; every route above is actually reachable by anyone (see `.claude/rules/api-module.md`).

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| `username` already taken (create/update) | `ErrorCode.E001` | 409 Conflict |
| `email` already taken (create/update) | `ErrorCode.E003` | 409 Conflict |
| `code` already taken (create/update, explicit code only) | `ErrorCode.E005` | 409 Conflict |
| User not found (detail/update/change-password) | `ErrorCode.E002` | 404 Not Found |

## Out of scope

- No soft delete / delete endpoint exists.
- No role/permission enforcement — `status` is just a stored field, it does not block login or any action.
- No password-reset/forgot-password flow — only an authenticated change-password.

## Frontend integration notes

- **Breaking change (2026-07-13)**: added a new **required** `username` field.
  - `POST /users` now requires `username` (string, max 100, globally unique) — a request without it is rejected with `422`.
  - `PATCH /users/:userId` accepts an optional `username` (same uniqueness rule, excludes the current row).
  - `UserResDto` now includes `username` — display/store it where the user is shown.
  - A duplicate `username` (create or update) returns `409` with `ErrorCode.E001` — same error as a duplicate email.
- **Breaking change (2026-07-13)**: the role/RBAC concept was removed from users.
  - `roleId` is **no longer accepted** on `POST /users` / `PATCH /users/:userId` (sending it is ignored/stripped) and is **no longer a filter** on `GET /users`.
  - `UserResDto` no longer returns `roleId` nor the nested `role` object — remove any FE code reading `user.roleId` / `user.role`.
- List search (`q`) now also matches `username` (in addition to `email` and `fullName`).
- A default seeded superadmin account exists (`username: superadmin`, `email: superadmin@tienhuy.com`) for initial login — see `pnpm db:seed:superadmin` in the repo README/CLAUDE.md if credentials need to be regenerated.
