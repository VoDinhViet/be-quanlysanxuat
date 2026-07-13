# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NestJS 11 modular monolith for a production management system ("quản lý sản xuất"). PostgreSQL + Drizzle ORM, Redis, Swagger. Package manager is pnpm.

Current state: minimal scaffold with three API modules — `auth`, `users`, and `health`. Other business modules (clients, suppliers, products, orders, roles) and the whole RBAC schema/permission system have been removed; don't look for them. `package.json` is still named `be-giasu-ai` — it hasn't been renamed for this project.

## Rules

Detailed, enforceable conventions live in `.claude/rules/` and are imported below:

@.claude/rules/workflow.md
@.claude/rules/api-module.md
@.claude/rules/dto.md
@.claude/rules/database.md
@.claude/rules/errors-pagination.md

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
pnpm db:seed:superadmin           # create default superadmin user (idempotent, skips if exists)
```

Env is loaded from `.env.${NODE_ENV}` first, then `.env` as fallback (see `src/main.ts` and seed scripts). Requires PostgreSQL and Redis running. Swagger UI at `/api-docs` outside production.

## Architecture

### Request pipeline (configured in `src/main.ts`)

- Global prefix `api` + URI versioning (routes look like `/api/v1/...` when a version is set on the controller). `GET /` and `GET health` are explicitly excluded from the `api` prefix in `main.ts` (`app.setGlobalPrefix('api', { exclude: [...] })`) — so the health check lives at `GET /health`, not `GET /api/health`.
- Global `ValidationPipe` with `whitelist: true`, `transform: true`; validation errors return 422.
- Global `ClassSerializerInterceptor` + `GlobalExceptionFilter`.
- `main.ts` exports a serverless-style handler (cached Express instance) and also listens on `PORT` when run directly.

### Modules (`src/api/<module>/`)

Three modules exist: `auth`, `users`, `health`. `users` is the reference example for new modules — coding conventions (controller/service shape, DTOs, errors, pagination) live in `.claude/rules/` (imported above), not repeated here. Business rules and API contracts per module live in `docs/features/`: [`auth.md`](docs/features/auth.md), [`users.md`](docs/features/users.md), [`health.md`](docs/features/health.md).

Register new modules in `src/app.module.ts`.

**No global guard**: every route is public by default. Auth is opt-in per route via `@UseGuards(JwtAuthGuard)` (`src/api/auth/guards/jwt-auth.guard.ts`) — currently only on `auth/logout` and none of `health`'s routes. Read the authenticated user with `@User()` (`src/decorators/user.decorator.ts`); on unguarded routes it resolves to `undefined`. `@Public()`/`@ApiPublic()` are inert metadata unless the route also carries `JwtAuthGuard`.

### Database (Drizzle)

- `DatabaseModule` is `@Global()`, token `DRIZZLE`, type `Database` (`src/database/database.type.ts`). Conventions (schema shape, re-export requirement, soft-delete reality): `.claude/rules/database.md`.

## Notes

- README references an older doc layout (`docs/architecture.md`, `coding-standards.md`, `api-standards.md`, `database-rules.md`, `module-specs/*`) and `AGENTS.md` — none of those exist, don't look for them. The current `docs/features/` folder (feature specs, see `.claude/rules/workflow.md`) is a fresh convention, not a restoration of the old one.
- `uploads/` is served statically at `/uploads/` and is git-ignored.
- `src/common/` has some DTOs duplicated at both `common/*` and `common/dto/*` (e.g. pagination, error DTOs) — prefer the versions under `common/dto/`.
