# API Standards

## 1. General Rules

- Use DTOs for request validation and response shaping.
- Validate route params, query params, and request bodies at the API boundary.
- Route params should be entity-specific.

```text
GET /users/:userId
GET /roles/:roleId
```

- Avoid generic `:id` in public API contracts when the entity is known.
- Dynamic sorting must use a whitelist of allowed fields. Do not pass raw column names from clients into Drizzle or SQL.

## 2. Success Responses

Single-resource endpoints currently return DTO objects directly.

```json
{
  "id": "uuid",
  "email": "admin@example.com"
}
```

Paginated endpoints use `OffsetPaginatedDto` shape:

```json
{
  "data": [],
  "pagination": {
    "currentPage": 1,
    "limit": 20,
    "nextPage": 2,
    "previousPage": null,
    "totalRecords": 100,
    "totalPages": 5
  }
}
```

Use `PageOptionsDto` for offset pagination fields:

```text
page
limit
q
order
```

## 3. Error Responses

Business errors use `AppException`.

Current constructor:

```ts
new AppException(errorCode: ErrorCode, status?: HttpStatus, message?: string)
```

Examples:

```ts
throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);

throw new AppException(ErrorCode.E004, HttpStatus.UNAUTHORIZED, 'Invalid email or password');
```

Rules:

- Add new values to `src/constants/error-code.constant.ts` before using new business errors.
- Use `AppException` for expected business/API errors.
- Use Nest framework exceptions only for guards, validation pipes, or framework-level errors.
- `GlobalExceptionFilter` normalizes all errors.
- Validation errors return `details`.
- Postgres `23505` maps to `409`.
- Postgres `23503` maps to `400`.

## 4. Security Rules

### Authentication

- JWT/session is required by default.
- Private APIs must use the auth guard.
- Public APIs must be explicitly marked with `@ApiPublic(...)`.

### Authorization

- Protected business APIs must use `@Permissions('resource:action')`.
- Ownership validation is required when a user can access only their own resource.
- Do not rely only on frontend permission checks.

### Validation

- Validate input through DTOs, params, and pipes.
- Sanitize input before using it in search, filtering, export, or display workflows.
- Validate enum values with enum DTO decorators or pipes.
- Whitelist dynamic sort and filter fields.

### Secrets

Never expose:

- password
- token
- secret
- internal stack trace
- password hash
- connection string

### Logging

Never log:

- password
- token
- credentials
- password hash
- authorization header
- connection string

### Dangerous Operations

Require validation and permission checks:

- approve
- reject
- cancel
- delete
- import/export warehouse
- permission changes
