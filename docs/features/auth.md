# Feature: Auth

## Goal

Issue and manage JWT session tokens for a `users` account: login, refresh an expired access token without re-entering credentials, and logout by revoking the session.

## Business rules

- Login accepts **username or email** in the same `identifier` field — the backend tries both against `users.username` and `users.email`, matched **case-insensitively** (`lower(username)` comparison; `email` is already stored lowercase). The DTO also lowercases the input on the way in (`toLowerCase: true`).
- Wrong username/email and wrong password return the **same** error (`E004`, 401) — don't leak which part was wrong.
- A successful login creates a `sessionId` (random UUID) shared by the access token and refresh token, plus a random `hash` embedded in the refresh token.
- The pair `{ userId, hash }` for a `sessionId` is cached in Redis (`session_hash:%s`) with TTL = the refresh token's expiry. This is the source of truth for whether a refresh token is still valid — a refresh token that verifies cryptographically but whose `hash` doesn't match (or whose session entry is gone) is rejected.
- Refresh **reuses the same `sessionId`** but rotates the `hash` and re-signs both tokens — so a refresh token can only be used to mint one new pair before its old `hash` stops matching (implicit single-use rotation, no explicit revocation of the old access token though).
- Logout blacklists the **access token's** `sessionId` (`session_blacklist:%s`, TTL = access token's remaining lifetime) and deletes the `session_hash:%s` entry — this both stops the current access token from passing `JwtAuthGuard` and stops the paired refresh token from refreshing (no session to check hash against).
- Access and refresh tokens are signed with **separate secrets** (`auth.jwtSecret` vs `auth.refreshSecret`) and separate default TTLs (`auth.jwtTokenExpiresIn` / `auth.refreshTokenExpiresIn`, both default to `7d` via env `AUTH_JWT_TOKEN_EXPIRES_IN` / `AUTH_REFRESH_TOKEN_EXPIRES_IN` if unset — despite the "short-lived access / long-lived refresh" framing, the actual default TTLs are currently equal; only per-environment env config makes them differ).
- **No global guard** — every route except `auth/logout` is public. `JwtAuthGuard` is opt-in per route via `@UseGuards`; it does not read the inert `@Public()`/`@ApiPublic()` metadata to decide anything, those decorators only affect Swagger docs.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| POST | `/auth/login` | public | `LoginReqDto` (`identifier`, `password`) | `200` + `LoginResDto` |
| POST | `/auth/refresh` | public | `RefreshTokenReqDto` (`refreshToken`) | `200` + `LoginResDto` |
| POST | `/auth/logout` | jwt (`JwtAuthGuard`) | — (bearer access token) | `204 No Content` |

`LoginResDto` = `{ accessToken, refreshToken, tokenType: 'Bearer' }` for both login and refresh.

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

## Out of scope

- No registration endpoint — users are created via `POST /users` (see `docs/features/users.md`), not through `auth`.
- No "logout from all sessions" / multi-device session listing — logout only revokes the single session tied to the presented access token.
- No password-reset/forgot-password flow.
- No enforcement of `users.status` (e.g. `INACTIVE`) at login — a login only checks credentials.

## Frontend integration notes

- **Breaking change (2026-07-13)**: the login body field was renamed **`email` → `identifier`**. The old field required a valid email; `identifier` now accepts a username **or** an email (matched case-insensitively, no client-side formatting needed). A request still sending `email` is rejected with `422` — update the login payload to send `identifier`.
- **Breaking change (2026-07-13)**: the refresh endpoint path was renamed **`POST /auth/refresh-token` → `POST /auth/refresh`**. The body (`refreshToken`) and response are unchanged — only the path moved. Requests to the old path now `404`.
- **Breaking change (2026-07-13)**: **`GET /auth/me` was removed.** There is no current-user endpoint anymore — fetch the profile via `GET /users/:userId` (see `docs/features/users.md`) using the id from the decoded token.
- New endpoint: **`POST /auth/logout`** (requires the bearer access token, returns `204`). Call it on logout to revoke the current session — it blacklists the access token and invalidates the paired refresh token.
- Unchanged: `password` field name and the response shape (`accessToken`/`refreshToken`/`tokenType`) for both login and refresh.
