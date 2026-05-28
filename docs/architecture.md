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

## Layer Responsibilities

Controller:

- Define HTTP routes.
- Apply `@ApiAuth`, `@ApiPublic`, `@Permissions`, params, query DTOs, and body DTOs.
- Read authenticated user data with `@User()` when needed.
- Call one service method and return its result.
- Do not access Drizzle or Redis directly.
- Do not contain business rules.

Service:

- Enforce business rules.
- Coordinate reads/writes and external infrastructure.
- Use `AppException` for expected business/API errors.
- Hash passwords and protect sensitive values before persistence or response mapping.
- Use Drizzle query operators imported from `drizzle-orm`.
- Use transactions for multi-step writes.
- Map database rows to response DTOs with `plainToInstance(..., { excludeExtraneousValues: true })`.

Repository:

- Optional layer for database-heavy modules.
- Encapsulate Drizzle table/query details.
- Return database rows or persistence-focused models to the service.
- Do not throw transport-specific HTTP errors unless the module has an established local pattern.
- Do not map response DTOs.

DTO:

- Request DTOs validate client input with project field decorators from `src/decorators/field.decorators.ts`.
- Response DTOs use `@Exclude()` and `@Expose()` to control output.
- Response DTOs must never expose passwords, hashes, tokens, secrets, or connection strings.

Guard:

- `AuthGuard` authenticates requests unless an endpoint is marked public.
- `RolesGuard` checks `@Permissions(...)` metadata.
- Guards should not implement business workflows.

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

Rules:

- Use Drizzle schemas from `src/database/schemas/`.
- Export schemas and relations through `src/database/schemas/index.ts`.
- Keep table definitions, enums, indexes, and relations in schema files.
- Define `relations()` beside table definitions when relational queries use nested `with:` clauses.
- Use camelCase TypeScript keys and snake_case database names.
- Use `.references()` for stable foreign keys.
- Use indexes for foreign keys and frequent filters.
- Use `uniqueIndex` for business codes.
- Do not run migrations without explicit user approval.
- Never use `drizzle-kit push` in production or shared environments.

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

- Public route prefix is `/api`.
- URI versioning is enabled.
- Swagger is generated outside production.
- Use entity-specific route params such as `:userId` and `:roleId`.
- Use `PageOptionsDto` and `OffsetPaginatedDto` for offset pagination.
- Dynamic sort fields must be whitelisted.
- Business errors use `AppException`.
- Validation errors are normalized by `GlobalExceptionFilter`.
- PostgreSQL constraint errors are normalized by `GlobalExceptionFilter`.

## Auth And RBAC

- APIs require JWT by default unless marked with `@ApiPublic(...)`.
- Protected business endpoints should use `@Permissions('permission.code')`.
- Permission codes are typed by `PermissionCode`.
- Use permission checks instead of hard-coded role checks in controllers.
- `system.manage` is the broad system permission.
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

## Forbidden

- Database access in controllers.
- Business logic in controllers.
- Raw client-provided table names, column names, SQL, or sort fields.
- Response DTOs exposing sensitive fields.
- Cross-module controller imports.
- Circular module dependencies.
- Unnecessary repository layers for simple modules.
- New architecture folders that conflict with the current `src/api/<module>` convention.
