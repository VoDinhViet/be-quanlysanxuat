# Auth Module Spec

## Purpose

The auth module owns login, JWT token creation/verification, and the current account profile endpoint.

Source:

```text
src/api/auth/
```

## Public API

### POST /auth/login

Decorator:

- `@ApiPublic(...)`

Request DTO:

- `LoginReqDto`

Request fields:

- `email`
- `password`

Response DTO:

- `LoginResDto`

Response fields:

- `userId`
- `roleCode`
- `permissions`
- `accessToken`
- `refreshToken`
- `tokenExpires`

Business rules:

- Email and password are required.
- User must exist.
- User status must be active.
- Password must match the stored password hash.
- User role must not be inactive.
- Invalid login attempts return the same invalid credentials error.
- Do not reveal whether the email or password was wrong.

Errors:

- Invalid credentials: `ErrorCode.E004`, HTTP `401`.

### POST /auth/refresh-token

Decorator:

- `@ApiPublic(...)`

Request DTO:

- `RefreshTokenReqDto`

Request fields:

- `refreshToken`

Response DTO:

- `LoginResDto`

Response fields:

- `userId`
- `roleCode`
- `permissions`
- `accessToken`
- `refreshToken`
- `tokenExpires`

Business rules:

- Refresh token must be a valid JWT signed by `auth.refreshSecret`.
- User from refresh token payload must exist.
- User status must be active.
- User role must not be inactive.
- Endpoint issues a new access token and a new refresh token.
- Response permissions are loaded from the current database role permissions.

Errors:

- Invalid refresh token: HTTP `401`.
- Inactive or missing user/role: `ErrorCode.E004`, HTTP `401`.

### GET /auth/me

Decorator:

- `@ApiAuth(...)`

Request:

- Current authenticated user from `@User()`.

Response DTO:

- `CurrentUserResDto`

Response fields:

- user profile fields
- role
- permission codes
- timestamps

Business rules:

- User must exist.
- Return active permission codes from the user's role.
- Do not return password, password hash, refresh token, JWT secret, or internal auth config.

Errors:

- Missing user: `ErrorCode.E002`, HTTP `404`.

## Dependencies

- `JwtService`
- `ConfigService<AllConfigType>`
- Drizzle database client through `DRIZZLE`
- `users`, `roles`, `rolePermissions`, and `permissions` schemas through relational queries

## Token Rules

- Access tokens use `auth.secret`.
- Refresh tokens use `auth.refreshSecret`.
- Token payload type is `JwtPayloadType`.
- Token payload contains:
  - `sub`
  - `email`
  - `role`
- Token verification failures throw `UnauthorizedException`.

## Security Rules

- Never expose password hashes.
- Never log passwords or tokens.
- Keep invalid credential responses generic.
- Do not hard-code role checks in controllers.
- Frontend authorization should use permission codes from `GET /auth/me`.

## Database Rules

- Load user with role for login.
- Load user with role, role permissions, and permissions for `GET /auth/me`.
- Use Drizzle operators from `drizzle-orm`.
- Avoid N+1 queries by using relational `with:` loading.

## Change Checklist

- Update DTOs when response shape changes.
- Update token payload type when JWT claims change.
- Update Swagger decorators when endpoint response type changes.
- Run build after changing auth service/controller/module/DTO wiring.
- Add or update tests for login success, invalid credentials, inactive user, and `GET /auth/me`.
