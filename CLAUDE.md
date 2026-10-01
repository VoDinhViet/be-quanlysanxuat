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

- `DATABASE_URL` and `REDIS_URL` always point at remote servers, never localhost. Dev and prod are separate databases; check `.env.development` before assuming which host is which. Do not run `db:migrate`, `db:reset*` (wipes data) or `db:seed:*` against a shared or production database without the user's approval.
- Env files load as `.env.${NODE_ENV}` first, then `.env`.
- `drizzle-kit` prompts interactively. Do not try to drive it with a pseudo-terminal; ask the user to run it.

## Architecture

NestJS 11 modular monolith. One folder per domain in `src/api/<domain>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts` and `dto/`. Cross-cutting code lives in `src/decorators`, `src/common`, `src/constants`, `src/filters`, `src/exceptions`, `src/database`, `src/redis` and `src/storage`.

Request pipeline (wired in `main.ts` and `app.module.ts`): global prefix `api` (`/` and `/health` excluded); `JwtAuthGuard` then `PermissionsGuard` as global `APP_GUARD`s, so every route needs a valid JWT unless marked `@Public()`; `ValidationPipe` with `whitelist`; `GlobalExceptionFilter`; `ClassSerializerInterceptor`.

## Rules

Detailed rules live in `.claude/rules/` and load by topic:

- `testing.md`: do not write tests unless asked (always loaded).
- `api-conventions.md`: authorization, controllers, DTOs, pagination (when working in `src/api`, `src/decorators`, `src/common`).
- `database.md`: Drizzle, soft delete, enums, dates, migrations (when working in `src/database`, `drizzle`, services and `*.query.ts`).
- `config.md`: config validation, Redis, uploads.

## Gotchas

- Code comments and domain names are in Vietnamese in places (SO = sales order, LSX = production order, JOB = production job, DMH = supplier purchase order, IQC/OQC = incoming/outgoing quality check, NCR = non-conformance report).
- Prettier: single quotes, trailing commas, 2 spaces.
- `docs/` is being rewritten from the current code, one part per area (see `docs/README.md` for which parts exist). Older comments in `src` that point at `docs/domains/*.md` or `docs/decisions/*.md` refer to the deleted pre-2026-09-25 docs; those that have no file yet are not dangling mistakes, they are still to be written.
