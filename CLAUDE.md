# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NestJS 11 modular monolith for a production management system ("quản lý sản xuất"). PostgreSQL + Drizzle ORM, Redis, Swagger. Package manager is pnpm.

Current state: 17 API modules under `src/api/` — `auth`, `users`, `roles`, `health`, `files`, `clients`, `client-groups`, `products`, `product-groups`, `materials`, `material-groups`, `suppliers`, `supplier-groups`, `units`, `departments`, `positions`, `countries`. RBAC (roles + granular permission codes) is live, see `docs/features/authorization.md`. `package.json` is still named `be-giasu-ai` — it hasn't been renamed for this project.

Removed on purpose (don't recreate unless asked): `orders`, `uploads` (replaced by `files`).

`suppliers`/`supplier-groups` were removed on 2026-07-20 and **rolled back the same day** — they exist and are current. They were restored on the `files` registry (`logoFileId` / `attachmentFileIds`), not the plain-URL model they originally shipped with. `countries` exists because suppliers reference it.

## Rules

Detailed, enforceable conventions live in `.claude/rules/` and are imported below:

@.claude/rules/workflow.md
@.claude/rules/api-module.md
@.claude/rules/dto.md
@.claude/rules/database.md
@.claude/rules/errors-pagination.md
@.claude/rules/testing.md

## Commands

```bash
pnpm start:dev                    # dev server with watch (default port 3000, api at /api)
pnpm build                        # nest build
pnpm lint                         # eslint with --fix
pnpm format                       # prettier --write on src/ and test/

pnpm test                         # all unit tests (*.spec.ts under src/)
pnpm test -- users.service        # single test file (matches path/name)
pnpm test:e2e                     # e2e tests (test/jest-e2e.json)

pnpm db:generate                  # generate Drizzle migration from schema changes
pnpm db:migrate                   # apply migrations (never against shared/prod DBs without approval)
pnpm db:studio                    # Drizzle Studio
pnpm db:seed:credentials          # seed 7 default accounts (roles + departments + positions + credentials + users), idempotent
```

Env is loaded from `.env.${NODE_ENV}` first, then `.env` as fallback (see `src/main.ts` and seed scripts). Requires PostgreSQL and Redis running. Swagger UI at `/api-docs` outside production.

## Architecture

### Request pipeline (configured in `src/main.ts`)

- Global prefix `api` + URI versioning (routes look like `/api/v1/...` when a version is set on the controller). `GET /` and `GET health` are explicitly excluded from the `api` prefix in `main.ts` (`app.setGlobalPrefix('api', { exclude: [...] })`) — so the health check lives at `GET /health`, not `GET /api/health`.
- Global `ValidationPipe` with `whitelist: true`, `transform: true`; validation errors return 422.
- Global `ClassSerializerInterceptor` + `GlobalExceptionFilter`.
- `main.ts` exports a serverless-style handler (cached Express instance) and also listens on `PORT` when run directly.

### Modules (`src/api/<module>/`)

`users` is the reference example for new modules — coding conventions (controller/service shape, DTOs, errors, pagination) live in `.claude/rules/` (imported above), not repeated here. Business rules and API contracts per module live in `docs/features/`: [`auth.md`](docs/features/auth.md), [`users.md`](docs/features/users.md), [`health.md`](docs/features/health.md).

Register new modules in `src/app.module.ts`.

**Global secure-by-default guards**: `JwtAuthGuard` + `PermissionsGuard` are registered as `APP_GUARD` in `src/app.module.ts` (in that order). Every route requires a valid bearer token by default; mark a route `@Public()` / `@ApiPublic()` (`src/decorators/public.decorator.ts`) to opt out of both auth and permission checks. A route declares the permission it needs with `@Permissions('resource:action')`; `PermissionsGuard` enforces it (a role holding `system:manage` passes everything). Roles live in the DB and are resolved per-request from the token's credential id (Redis-cached). Read the authenticated user with `@CurrentUser()` (`src/decorators/current-user.decorator.ts`) — on `@Public()` routes it resolves to `undefined`. Full model: `docs/features/authorization.md`.

### Database (Drizzle)

- `DatabaseModule` is `@Global()`, token `DRIZZLE`, type `Database` (`src/database/database.type.ts`). Conventions (schema shape, re-export requirement, soft-delete reality): `.claude/rules/database.md`.

## Notes

- README references an older doc layout (`docs/architecture.md`, `coding-standards.md`, `api-standards.md`, `database-rules.md`, `module-specs/*`) and `AGENTS.md` — none of those exist, don't look for them. The current `docs/features/` folder (feature specs, see `.claude/rules/workflow.md`) is a fresh convention, not a restoration of the old one.
- `uploads/` is served statically at `/uploads/` and is git-ignored.
- `src/common/` has some DTOs duplicated at both `common/*` and `common/dto/*` (e.g. pagination, error DTOs) — prefer the versions under `common/dto/`.
