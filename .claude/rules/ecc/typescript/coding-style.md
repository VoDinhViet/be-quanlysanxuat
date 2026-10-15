---
paths:
  - "**/*.ts"
---
# TypeScript Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md).

## Types

- Add parameter and return types to exported functions, shared utilities and public class methods; let TypeScript infer obvious locals.
- Extract repeated inline object shapes into a named `type` or `interface`.
- `interface` for object shapes that may be extended or implemented; `type` for unions, intersections, tuples and mapped types.
- Prefer string literal unions over `enum`, except for the domain enums mirrored as `pgEnum` (see `database.md`).
- Avoid `any` in application code. Use `unknown` for external or untrusted input and narrow it.

## Immutability

Use spread for plain data updates; never mutate a parameter in place.

```typescript
// WRONG
function rename(user: User, name: string): User {
  user.name = name;
  return user;
}

// CORRECT
function rename(user: Readonly<User>, name: string): User {
  return { ...user, name };
}
```

## Errors

- Narrow `catch (error: unknown)` before reading `error.message`.
- Services throw `AppException` with an `ErrorCode`; see `api-conventions.md`. Do not throw a bare `Error` for a business failure.
- Never swallow an error silently; log it with the Nest `Logger`.

## Input validation

Request DTOs use the field decorators in `src/decorators/field.decorators.ts`. Do not add Zod or raw class-validator decorators.

## Logging

No `console.log` in `src/`; use the Nest `Logger`.
