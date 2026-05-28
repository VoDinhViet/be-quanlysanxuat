# Users Module Spec

## Purpose

The users module owns user administration: listing users, reading user detail, creating users, updating users, and changing user passwords.

Source:

```text
src/api/users/
```

## Public API

All users endpoints are authenticated and require permissions.

### GET /users

Decorator:

- `@ApiAuth(..., isPaginated: true)`
- `@Permissions('employee.update')`

Query DTO:

- `PageOptionsDto`

Response:

- `OffsetPaginatedDto<UserResDto>`

Business rules:

- Supports pagination.
- Supports keyword search by email and full name.
- Sorts by `createdAt` using `pageOptions.order`.
- Loads each user's role.
- Must not expose passwords or password hashes.

### GET /users/:userId

Decorator:

- `@ApiAuth(...)`
- `@Permissions('employee.update')`

Params:

- `userId` through `@UUIDParam('userId')`

Response DTO:

- `UserResDto`

Business rules:

- User must exist.
- Loads user's role.

Errors:

- Missing user: `ErrorCode.E002`, HTTP `404`.

### POST /users

Decorator:

- `@ApiAuth(..., statusCode: HttpStatus.CREATED)`
- `@Permissions('employee.create')`

Request DTO:

- `CreateUserReqDto`

Request fields:

- `email`
- `password`
- `fullName`
- `roleId`
- `status`

Response DTO:

- `UserResDto`

Business rules:

- Email must be unique.
- Password must be hashed before storage.
- Role must exist and be active when `roleId` is provided.
- Default status is `UserStatus.Active`.
- Return the created user detail.

Errors:

- Duplicate email: `ErrorCode.E003`, HTTP `409`.
- Missing or inactive role: `ErrorCode.E002`, HTTP `404`.

### PATCH /users/:userId

Decorator:

- `@ApiAuth(...)`
- `@Permissions('employee.update')`

Params:

- `userId` through `@UUIDParam('userId')`

Request DTO:

- `UpdateUserReqDto`

Business rules:

- User must exist.
- Email must be unique when changed.
- Role must exist and be active when `roleId` is provided.
- Set `updatedAt` explicitly.
- Return the updated user detail.

Errors:

- Missing user: `ErrorCode.E002`, HTTP `404`.
- Duplicate email: `ErrorCode.E003`, HTTP `409`.
- Missing or inactive role: `ErrorCode.E002`, HTTP `404`.

### PATCH /users/:userId/password

Decorator:

- `@ApiAuth(...)`
- `@Permissions('employee.update')`

Params:

- `userId` through `@UUIDParam('userId')`

Request DTO:

- `ChangeUserPasswordReqDto`

Business rules:

- User must exist.
- New password must be validated by DTO rules.
- Password must be hashed before storage.
- Set `updatedAt` explicitly.
- Return the updated user detail.

Errors:

- Missing user: `ErrorCode.E002`, HTTP `404`.

## Permissions

Current permissions:

- `employee.create`
- `employee.update`

Current note:

- `employee.delete` exists in `PermissionCode`, but this module does not currently expose a delete endpoint.

## Dependencies

- Drizzle database client through `DRIZZLE`
- `users` schema
- `roles` schema
- `UserStatus`
- `RoleStatus`
- `bcryptjs` password hashing
- `plainToInstance` response mapping

## Database Rules

- Use Drizzle operators from `drizzle-orm`.
- Use relational `with:` loading for user role.
- Use `.returning()` when insert/update needs the changed row.
- Set `updatedAt` explicitly on updates.
- Do not return password columns in response DTOs.
- Keep email uniqueness enforced in service logic and database constraints.

## Security Rules

- Never expose password hashes.
- Never log passwords.
- Hash passwords with `UsersService.PASSWORD_SALT_ROUNDS`.
- Protected endpoints must keep permission decorators.
- Use `@UUIDParam('userId')` for route param validation.

## Change Checklist

- Update DTOs when request or response shape changes.
- Update `PermissionCode` and seed data when adding new protected actions.
- Update database schema and migrations when adding persisted fields.
- Run build after changing module/controller/service/DTO wiring.
- Add or update tests for list, detail, create, update, password change, duplicate email, missing user, and inactive role.
