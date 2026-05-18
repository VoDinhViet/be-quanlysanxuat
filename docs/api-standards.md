# API Standards

## Success Responses

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
    "page": 1,
    "limit": 20,
    "total": 100
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

## Error Responses

Business errors use `AppException`.

Current constructor:

```ts
new AppException(errorCode: ErrorCode, status?: HttpStatus, message?: string)
```

Examples:

```ts
throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);

throw new AppException(
  ErrorCode.E004,
  HttpStatus.UNAUTHORIZED,
  'Invalid email or password',
);
```

Rules:

- Add new values to `src/constants/error-code.constant.ts` before using new business errors.
- Use `AppException` for expected business/API errors.
- Use Nest framework exceptions only for guards, validation pipes, or framework-level errors.
- `GlobalExceptionFilter` normalizes all errors.
- Validation errors return `details`.
- Postgres `23505` maps to `409`.
- Postgres `23503` maps to `400`.
