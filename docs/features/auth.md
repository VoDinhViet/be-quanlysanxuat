# Feature: Auth

## Goal

Issue and manage JWT session tokens for a `credentials` login: login, refresh an expired access token without re-entering credentials, and logout by revoking the session. A credential may optionally be linked to a `users` (profile/HR) row — see `docs/features/employees.md`.

## Business rules

- Login accepts **username or email** in the same `identifier` field — the backend tries both against `credentials.username` and `credentials.email`, matched **case-insensitively** (`lower(username)` comparison; `email` is already stored lowercase). The DTO also lowercases the input on the way in (`toLowerCase: true`).
- Wrong username/email and wrong password return the **same** error (`E004`, 401) — don't leak which part was wrong.
- **A credential linked to a `users` row whose `status` is `RESIGNED` cannot log in or refresh** — both `POST /auth/login` and `POST /auth/refresh` return `ErrorCode.E018` / `403 Forbidden` in that case. Checked right after the credential itself is validated (correct username/email + password for login, valid session for refresh), so a resigned employee's already-issued refresh token also stops working on its next use. A credential with **no** linked `users` row is unaffected — see `docs/features/employees.md`.
- A successful login creates a `sessionId` (random UUID) shared by the access token and refresh token, plus a random `hash` embedded in the refresh token.
- The pair `{ userId, hash }` for a `sessionId` is cached in Redis (`session_hash:%s`) with TTL = the refresh token's expiry. This is the source of truth for whether a refresh token is still valid — a refresh token that verifies cryptographically but whose `hash` doesn't match (or whose session entry is gone) is rejected.
- Refresh **reuses the same `sessionId`** but rotates the `hash` and re-signs both tokens — so a refresh token can only be used to mint one new pair before its old `hash` stops matching (implicit single-use rotation, no explicit revocation of the old access token though).
- Logout blacklists the **access token's** `sessionId` (`session_blacklist:%s`, TTL = access token's remaining lifetime) and deletes the `session_hash:%s` entry — this both stops the current access token from passing `JwtAuthGuard` and stops the paired refresh token from refreshing (no session to check hash against).
- Access and refresh tokens are signed with **separate secrets** (`auth.jwtSecret` vs `auth.refreshSecret`) and separate default TTLs (`auth.jwtTokenExpiresIn` / `auth.refreshTokenExpiresIn`, both default to `7d` via env `AUTH_JWT_TOKEN_EXPIRES_IN` / `AUTH_REFRESH_TOKEN_EXPIRES_IN` if unset — despite the "short-lived access / long-lived refresh" framing, the actual default TTLs are currently equal; only per-environment env config makes them differ).
- **Global guards (as of 2026-07-18)** — `JwtAuthGuard` + `PermissionsGuard` run globally (`APP_GUARD`), secure-by-default: every route needs a valid bearer token unless marked `@Public()`/`@ApiPublic()` (now honoured, not just Swagger). `JwtAuthGuard` sets `request.user` to the decoded `JwtPayloadType`; `PermissionsGuard` then enforces any `@Permissions(...)` the route declares. See `docs/features/authorization.md` for the full model.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| POST | `/auth/login` | public | `LoginReqDto` (`identifier`, `password`) | `200` + `LoginResDto` |
| POST | `/auth/refresh` | public | `RefreshTokenReqDto` (`refreshToken`) | `200` + `LoginResDto` |
| POST | `/auth/logout` | jwt (`JwtAuthGuard`) | — (bearer access token) | `204 No Content` |

`LoginResDto` = `{ userId, accessToken, refreshToken, tokenType: 'Bearer' }` for both login and refresh.

## Error cases

| Case | ErrorCode / Exception | HTTP status |
| ---- | ---------------------- | ----------- |
| Username/email not found | `ErrorCode.E004` | 401 Unauthorized |
| Password mismatch | `ErrorCode.E004` | 401 Unauthorized |
| Refresh token invalid/expired (signature/verify failure) | `UnauthorizedException` | 401 Unauthorized |
| Refresh token's `hash` doesn't match cached session, or session missing (already used/logged out) | `UnauthorizedException` | 401 Unauthorized |
| User behind a valid refresh token no longer exists | `UnauthorizedException` | 401 Unauthorized |
| Logout / any `JwtAuthGuard` route without/invalid bearer token | `UnauthorizedException` | 401 Unauthorized |
| Logout / any `JwtAuthGuard` route with a blacklisted (logged-out) access token | `UnauthorizedException` | 401 Unauthorized |
| Linked `users` row has `status = RESIGNED` (login or refresh) | `ErrorCode.E018` | 403 Forbidden |

## Out of scope

- No registration endpoint — users are created via `POST /users` (see `docs/features/users.md`), not through `auth`.
- No "logout from all sessions" / multi-device session listing — logout only revokes the single session tied to the presented access token.
- No password-reset/forgot-password flow.

## Frontend integration notes

- **Breaking change (2026-07-13)**: the login body field was renamed **`email` → `identifier`**. The old field required a valid email; `identifier` now accepts a username **or** an email (matched case-insensitively, no client-side formatting needed). A request still sending `email` is rejected with `422` — update the login payload to send `identifier`.
- **Breaking change (2026-07-13)**: the refresh endpoint path was renamed **`POST /auth/refresh-token` → `POST /auth/refresh`**. The body (`refreshToken`) and response are unchanged — only the path moved. Requests to the old path now `404`.
- **Breaking change (2026-07-13)**: **`GET /auth/me` was removed.** There is no current-user endpoint anymore — fetch the profile via `GET /users/:userId` (see `docs/features/users.md`) using the id from the decoded token.
- New endpoint: **`POST /auth/logout`** (requires the bearer access token, returns `204`). Call it on logout to revoke the current session — it blacklists the access token and invalidates the paired refresh token.
- Unchanged: `password` field name and the response shape (`accessToken`/`refreshToken`/`tokenType`) for both login and refresh.
- **New field (2026-07-14)**: login and refresh responses now also include **`userId`** (the logged-in user's id), alongside the existing `accessToken`/`refreshToken`/`tokenType` fields. Non-breaking, additive only.
- **Clarification (2026-07-16)**: `LoginResDto.userId` is actually the **credential id** (`credentials.id`, the `sub` claim), not a `users` (profile) row id — the naming predates this session's table rename and was not changed to avoid a breaking response-shape change. There is currently no endpoint to fetch a profile by credential id directly; if the FE needs the linked user's profile, that lookup (`users.credentialId = credentials.id`) isn't exposed yet.
- **Breaking change (2026-07-16)**: the `errorCode` string values for `E001`–`E004` changed from the `user.error.*` namespace to `credential.error.*` (e.g. `user.error.invalid_credentials` → `credential.error.invalid_credentials`), to match the `credentials` table these errors actually come from. Any FE code matching on the literal `errorCode` string (not just the HTTP status) must update. See `docs/features/users.md` for the full list.
- **New (2026-07-16)**: login and refresh can now return `403 Forbidden` with `errorCode: "user.error.resigned"` when the credential's linked `users` row has `status: "RESIGNED"`. Show an appropriate "tài khoản đã nghỉ việc" message rather than the generic invalid-credentials one.
- **Breaking change (2026-07-18)**: authorization is now enforced globally. Most routes that used to be reachable without a token now require `Authorization: Bearer <accessToken>` (and possibly a specific permission → `403` `auth.error.forbidden`). See `docs/features/authorization.md` for which routes stay public and the full roles/permissions model.
