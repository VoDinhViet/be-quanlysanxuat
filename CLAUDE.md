# CLAUDE.md

NestJS 11 modular monolith (Drizzle + Postgres, Redis, BullMQ). Package manager **pnpm**, Node >= 24. Reply to the user in Vietnamese; code and commits in English.

## Commands

```bash
pnpm start:dev          # API at http://localhost:$PORT/api, Swagger at /api-docs
pnpm build              # nest build (output in dist/src/main)
pnpm lint               # eslint --fix
npx tsc --noEmit        # type check; run with lint after coding
npx jest path/to/file.spec.ts
pnpm db:generate | db:migrate | db:check-drift
```

## Architecture

One folder per domain in `src/api/<domain>/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`). Cross-cutting code: `src/decorators`, `src/common`, `src/constants`, `src/filters`, `src/exceptions`, `src/database`, `src/redis`, `src/storage`.
Global pipeline: prefix `api`; `JwtAuthGuard` then `PermissionsGuard` (every route needs a JWT unless `@Public()`); `ValidationPipe` with `whitelist`; `GlobalExceptionFilter`; `ClassSerializerInterceptor`.

## Docs

`docs/CODEMAPS/INDEX.md` is the entry point for tracing a domain: route, controller, service, table and state flow, one file per domain group (`sales`, `purchasing`, `inventory`, `product-structure`, `production`, `quality`, `identity-access`, `integration`) plus `architecture` and `data`. Read it before opening a domain's code. A codemap is a map and the code is the source of truth: when they disagree, trust the code and fix the codemap.
For a chain that crosses UI and API (button, server function, endpoint, status), start at `../web-qlsx-start/docs/CODEMAPS/system-flow.md`.

## Cautions

- The app runs against the local Docker DB by default (`.env`, `localhost:5433`, Redis `6380`). Remote DBs are in `.env.development` / `.env.production`.
- Prettier: single quotes, trailing commas, 2 spaces.
- Domain terms: SO sales order, LSX production order, JOB production job, DMH supplier purchase order, IQC/OQC incoming/outgoing quality check, NCR non-conformance report.

## Rules

`.claude/rules/` holds the rules: `project-overrides.md` (wins on conflict), `api-conventions.md`, `database.md`, `config.md`, `naming.md`, `comments.md` (how to write and clean code comments), `model-routing.md` (which model for plan mode and subagents), and the ECC base in `ecc/common` and `ecc/typescript`.

## Compact Instructions

When compacting, keep:

- the files changed or being edited, and the task they belong to;
- the last `npx tsc --noEmit` and `pnpm lint` result;
- open decisions and questions waiting on the user;
- the standing prohibitions: no commit or push without an explicit order, no `pnpm db:migrate` or destructive script against remote dev/prod databases, no tests unless asked.

Drop tool output and file dumps that are already summarized.
