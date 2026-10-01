# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (Node >= 24).

```bash
pnpm start:dev                      # watch mode; API at http://localhost:$PORT/api, Swagger at /api-docs (not in production)
pnpm build                          # nest build (output goes to dist/src/main, see start:prod)
pnpm lint                           # eslint --fix over src and test
npx tsc --noEmit                    # type check; run it after coding, together with lint
npx jest path/to/file.spec.ts       # one spec file; add -t "test name" for one test
pnpm test                           # all specs (jest, rootDir is src/, pattern *.spec.ts)
```

The README says tests are "paused", but the few existing `*.spec.ts` files run fine with jest. `test:e2e` is not maintained.

Database (Drizzle, schema in `src/database/schemas/`, migrations in `drizzle/`):

```bash
pnpm db:generate                    # generate a migration from schema changes
pnpm db:migrate                     # apply migrations
pnpm db:check-drift                 # compares drizzle/meta/_journal.json and file hashes with each DB's applied migrations
```

## Environment and database cautions

- `DATABASE_URL` and `REDIS_URL` always point at remote servers, never localhost. Dev and prod are separate databases; check `.env.development` before assuming which host is which. Do not run `db:migrate`, `db:reset*` or seeds against a shared or production database without the user's approval.
- Env files load as `.env.${NODE_ENV}` first, then `.env`. Config is validated at boot (class-validator), so a missing required variable stops the app from starting.
- `drizzle-kit` prompts interactively. Do not try to drive it with a pseudo-terminal; ask the user to run it.

## Architecture

NestJS 11 modular monolith. One folder per domain in `src/api/<domain>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts` and `dto/`. Cross-cutting code lives in `src/decorators`, `src/common`, `src/constants`, `src/filters`, `src/exceptions`, `src/database`, `src/redis` and `src/storage`.

**Request pipeline (wired in `main.ts` and `app.module.ts`)**
- Global prefix `api` (`/` and `/health` excluded). `JwtAuthGuard` then `PermissionsGuard` run as global `APP_GUARD`s, so every route needs a valid JWT unless marked `@Public()`.
- `ValidationPipe` uses `whitelist` and answers invalid input with **422**, not 400. `GlobalExceptionFilter` formats errors; throw `AppException` with an `ErrorCode` from `src/constants/error-code.constant.ts`. `ClassSerializerInterceptor` is global.

**Authorization**
- Permission codes are `resource:action` strings, listed in `src/constants/permission.constant.ts`. A route declares what it needs with `@Permissions(...)`; `system:manage` passes every check.
- **Only controllers check permissions. Services do not.** Anything that calls a service directly from outside a controller (jobs, tools, another module) must check permissions itself through `PermissionsService.getPermissionCodes(credentialId)`.
- The JWT `sub` is a **credential id** (table `credentials`), not a `users.id`. `@CurrentUser()` gives the `JwtPayloadType`.

**Controllers and DTOs**
- Controllers use `@ApiAuth({ type, summary, ... })` / `@ApiPublic(...)` from `src/decorators/http.decorators.ts`; they set the default 200 status, Swagger responses and error responses. Request DTOs use the field decorators in `src/decorators/field.decorators.ts` (`StringField`, `UUIDFieldOptional`, `EnumField`, ...), not raw class-validator.
- Response DTOs are `@Exclude()` classes with `@Expose()` fields, built with `plainToInstance(..., { excludeExtraneousValues: true })`. Narrow DTOs are derived with `PickType` (for example `ClientRefResDto`), which is also the way to keep sensitive columns out of an output.
- List endpoints extend `PageOptionsDto` (`limit`, `page`, `q`, `order`) and return `OffsetPaginatedDto` (`data`, `pagination.totalRecords`). There is **no maximum `limit`**.
- Preferred style for create and update endpoints: return nothing (204) instead of re-fetching and returning a detail DTO, and do not repeat in application code a default the column already has in its schema.

**Config**
- Each config is a `registerAs` factory plus an env validator class and a `*-config.type.ts`, validated with `src/utils/validate-config.ts`. All of them are collected in `AllConfigType` (`src/config/config.type.ts`); read values with `configService.getOrThrow('section.key', { infer: true })`.

**Database**
- Drizzle with `postgres.js`, injected through the `DRIZZLE` token (global `DatabaseModule`). Schemas are grouped by domain under `src/database/schemas/` and re-exported from its `index.ts`.
- Prefer `.select().from(...).limit(1)` over `db.query.*.findFirst` for simple existence or uniqueness checks.
- Soft delete is `deletedAt`; filter on it in queries.
- Enums such as `OrderStatus` or `ProductionJobStatus` are TypeScript enums exported from the schema files and mirrored as `pgEnum`. Changing an enum value also needs a migration, and partial indexes that mention the old value must be rewritten.
- Dates in `date` columns are compared as UTC midnight; "today" for business rules is Vietnam time (`Asia/Ho_Chi_Minh`, see `src/database/vn-date.util.ts` and the `VN_TODAY` constant in `reports.service.ts`).

**Redis**: `RedisModule` provides a global Keyv-backed cache and BullMQ queues from the single `REDIS_URL`.

**Uploads**: files are stored on local disk (`UPLOAD_DRIVER=local`, `uploads/`) and served statically at the domain root by `ServeStaticModule`; the storage key is the public path.

## Gotchas

- `puppeteer` (reached through `PdfRendererService`, which `OrdersService` and `ProductionJobsService` import) is ESM-only and cannot be loaded by jest's CommonJS runtime. A spec that imports a service which pulls it in must `jest.mock(...)` that service or module; the same applies to any other ESM-only dependency.
- Code comments and domain names are in Vietnamese in places (SO = sales order, LSX = production order, JOB = production job, DMH = supplier purchase order, IQC/OQC = incoming/outgoing quality check, NCR = non-conformance report).
- Prettier: single quotes, trailing commas, 2 spaces.
