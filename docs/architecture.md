# Architecture

## Pattern

This project is a NestJS modular monolith.

Business features are grouped as API modules under `src/api/<module>/`. Each module owns its HTTP boundary, DTOs, service logic, and optional repositories. Shared infrastructure lives in top-level `src/` folders such as `database`, `guards`, `decorators`, `filters`, `constants`, `common`, and `redis`.

Default module pattern:

```text
Controller -> Service -> Drizzle Database
```

Use a repository layer only when a module has enough database complexity to justify it:

```text
Controller -> Service -> Repository -> Drizzle Database
```

## Tech Stack

- Runtime: Node.js.
- Package manager: pnpm.
- Framework: NestJS 11.
- Language: TypeScript.
- Database: PostgreSQL.
- ORM: Drizzle ORM.
- Migration tool: Drizzle Kit.
- Database driver: `postgres`.
- Auth: JWT with `@nestjs/jwt`.
- Authorization: RBAC permissions.
- Cache/queue infrastructure: Redis, BullMQ-ready dependencies.
- Validation and serialization: `class-validator`, `class-transformer`.
- API docs: Swagger outside production.
- Tests: Jest and Supertest.

## Runtime Flow

Application bootstrap lives in `src/main.ts`.

- Loads `.env.<NODE_ENV>` first, then falls back to `.env`.
- Creates `AppModule`.
- Enables `helmet`, compression, CORS, static assets under `/uploads`, global `/api` prefix, and URI versioning.
- Registers `GlobalExceptionFilter`.
- Registers global guards: `AuthGuard`, then `RolesGuard`.
- Registers global `ValidationPipe` with transform and whitelist enabled.
- Registers `ClassSerializerInterceptor`.
- Sets up Swagger when not running in production.

Root dependency wiring lives in `src/app.module.ts`.

- `ConfigModule` is global.
- `DatabaseModule` is global and provides the Drizzle client through `DRIZZLE`.
- `RedisModule`, `AuthModule`, and business API modules are imported by `AppModule`.

For end-to-end business flow, keep `docs/system-flow.md` current. For implementation status, keep `docs/module-progress.md` current.

## Folder Structure

Current project structure:

```text
src/
  api/
    auth/
    users/
  common/
    dto/
    types/
  config/
  constants/
  database/
    config/
    schemas/
    seeds/
  decorators/
    validators/
  exceptions/
  filters/
  guards/
  redis/
  utils/
```

Business module structure:

```text
src/api/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
  types/
```

Optional folders for larger modules:

```text
src/api/<module>/
  repositories/
  constants/
  interfaces/
  guards/
  decorators/
```

Do not use `src/modules/` for new business APIs in this project unless the whole project structure is intentionally migrated.

## Module Rules

- `*.module.ts` wires only the providers, controllers, imports, and exports needed by the module.
- Controllers stay thin and handle route decorators, DTO input, current user extraction, params, and service calls.
- Services own business logic, orchestration, Drizzle queries, transactions, and response mapping unless the module introduces repositories.
- Repositories, when introduced, own database reads/writes only. They should not contain HTTP behavior or business decisions.
- DTOs own request validation and response shaping.
- Guards own authentication and permission checks only.
- Do not import controllers from other modules.
- Prefer service-to-service communication between modules.
- Avoid tight cross-module coupling. Export only stable services needed by other modules.
- Every API module must have a `docs/module-specs/<module>.md` file once implementation starts.
- Update the module spec after changing endpoints, DTOs, permissions, schemas, dependencies, or verification.
- Update `docs/module-progress.md` after changing implementation status, done items, pending items, or blockers.

## Layer Responsibilities

> Detailed rules with Good/Bad examples live in [`nestjs-standards.md`](standards/nestjs-standards.md).

| Layer | Responsibility |
|---|---|
| **Controller** | HTTP routes, decorators (`@ApiAuth`, `@Permissions`, DTOs), delegate to one service method. No DB/Redis/business logic. |
| **Service** | Business rules, Drizzle queries, transactions, `AppException`, DTO response mapping via `plainToInstance`. |
| **Repository** | (Optional) Encapsulate complex Drizzle queries. Return raw rows to service. No HTTP errors, no DTO mapping. |
| **DTO** | Request: validate with `field.decorators.ts`. Response: `@Exclude`/`@Expose`, never expose secrets. |
| **Guard** | `AuthGuard` authenticates; `RolesGuard` checks `@Permissions(...)`. No business workflows. |

## Database Architecture

Database infrastructure lives in `src/database/`.

```text
src/database/
  database.module.ts
  database.type.ts
  config/
  schemas/
  seeds/
```

> Detailed rules with Good/Bad examples live in [`database-standards.md`](standards/database-standards.md).

Schema folder pattern:

```text
src/database/schemas/
  index.ts
  users.ts
  rbac/
    index.ts
    relations.ts
    permissions.ts
    role-permissions.ts
    roles.ts
```

## API Architecture

> Detailed rules with Good/Bad examples live in [`api-standards.md`](standards/api-standards.md).

- Public route prefix is `/api`.
- URI versioning is enabled.
- Swagger is generated outside production.

## Auth And RBAC

- APIs require JWT by default unless marked with `@ApiPublic(...)`.
- Protected business endpoints should use `@Permissions('resource:action')`.
- Permission codes are typed by `PermissionCode`.
- Use permission checks instead of hard-coded role checks in controllers.
- `system:manage` is the broad system permission.
- `GET /auth/me` returns the current user, role, and permission codes for frontend authorization.

## Shared Code

Use these shared locations:

```text
src/common/dto/       Shared response, error, and pagination DTOs.
src/common/types/     Shared TypeScript types.
src/config/           App-level config definitions.
src/constants/        Stable constants, error codes, roles, permissions.
src/decorators/       Swagger, auth, params, field validators, transforms.
src/exceptions/       AppException and business exception primitives.
src/filters/          Global exception normalization.
src/guards/           Auth and RBAC guards.
src/redis/            Redis configuration and module wiring.
src/utils/            Small framework utilities.
```
