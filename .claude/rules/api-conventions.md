---
paths:
  - "src/api/**"
  - "src/decorators/**"
  - "src/common/**"
---

# API conventions

**Authorization**
- Permission codes are `resource:action` strings listed in `src/constants/permission.constant.ts`. A route declares what it needs with `@Permissions(...)`; `system:manage` passes every check.
- **Only controllers check permissions. Services do not.** Any caller that reaches a service from outside a controller (a job, an AI tool, another module) must check permissions itself with `PermissionsService.getPermissionCodes(credentialId)`.
- The JWT `sub` is a **credential id** (table `credentials`), not a `users.id`. `@CurrentUser()` gives the `JwtPayloadType`.

**Controllers**
- Use `@ApiAuth({ type, summary, ... })` or `@ApiPublic(...)` from `src/decorators/http.decorators.ts`; they set the default 200 status plus the Swagger and error responses.
- Throw `AppException` with an `ErrorCode` from `src/constants/error-code.constant.ts`. Validation errors are **422**, not 400.
- Preferred style for create and update endpoints: return nothing (204) instead of re-fetching and returning a detail DTO.

**DTOs**
- Request DTOs use the field decorators in `src/decorators/field.decorators.ts` (`StringField`, `UUIDFieldOptional`, `EnumField`, ...), not raw class-validator.
- Response DTOs are `@Exclude()` classes with `@Expose()` fields, built with `plainToInstance(..., { excludeExtraneousValues: true })`. Derive narrow DTOs with `PickType` (for example `ClientRefResDto`); this is also how sensitive columns are kept out of an output.
- List endpoints extend `PageOptionsDto` (`limit`, `page`, `q`, `order`) and return `OffsetPaginatedDto` (`data`, `pagination.totalRecords`). There is **no maximum `limit`**, so callers that are not an HTTP client must cap it themselves.
