# AGENTS.md

## Project Instructions

- You are a backend coding agent for this NestJS API project.
- Respond in the user's language. Keep code, identifiers, and comments in English.
- Keep changes scoped to the user request.
- Do not revert user changes.
- Automatically create a git commit and push to the remote repository after completing a module or a feature.
- Ask a concise question only when missing information changes behavior, data model, security, or public API.

## Read First

Read these files before non-trivial code changes:

- `docs/architecture.md`
- `docs/system-flow.md`
- `docs/module-progress.md`
- `docs/coding-standards.md`
- `docs/api-standards.md`
- `docs/database-rules.md`

Read the relevant module spec under `docs/module-specs/` before changing an existing API module.

## Codex Workflow

- Question/explanation: answer directly, no file edits.
- Docs/rules change: update the relevant markdown only.
- Small code change: inspect affected files, edit narrowly, run targeted verification.
- New module/feature: read required docs first, inspect nearby patterns, implement, verify.
- After changing an API module, update its `docs/module-specs/<module>.md` with current endpoints, permissions, dependencies, and rules.
- After changing implementation progress, update `docs/module-progress.md`.
- When adding or changing cross-module flow, update `docs/system-flow.md` so AI agents and developers can follow the system behavior.
- Debugging: reproduce or read the exact error, inspect the smallest relevant area, fix root cause, rerun the failing command.
- Use repository skills when they match the task:
  - `$backend`: NestJS API/module/service/controller/DTO/Drizzle implementation.
  - `$debug`: failing build, test, runtime error, API bug, auth/RBAC issue, or database query issue.
  - `$test`: add, update, run, or fix Jest/Supertest tests.
  - `$verify`: prove changes work with build/tests/runtime evidence.

## File Layout

- Always-on project instructions live in this `AGENTS.md`.
- Detailed conventions live in `docs/`.
- System flow, module specs, and module progress live in `docs/system-flow.md`, `docs/module-specs/`, and `docs/module-progress.md`.
- Reusable Codex workflows live in `.codex/skills/<skill>/SKILL.md`.
- Do not put coding convention markdown files under `.codex/rules/`.
- Use `.codex/rules/*.rules` only for Codex command execution policies when needed.

## Backend Rules

- This project is a NestJS modular monolith.
- Business API modules live under `src/api/<module>/`.
- Controllers stay thin: route decorators, DTO input, current user extraction, and service calls only.
- Services own business logic, orchestration, Drizzle queries, and response mapping unless a module introduces a repository.
- DTOs own request validation and response shaping.
- Guards own authentication and permission checks only.
- Prefer service-to-service communication between modules. Do not import controllers from other modules.

## Nest CLI Rules

- Use Nest CLI when starting a new module/controller/service:
  - `pnpm nest generate module api/<module>`
  - `pnpm nest generate controller api/<module> --no-spec`
  - `pnpm nest generate service api/<module> --no-spec`
- Use manual file creation for DTOs, types, schemas, tests, or follow-up files that Nest CLI does not generate cleanly.
- Remove generated boilerplate that does not match the requested business behavior.

## Code Quality Rules

- Keep code simple and direct. Avoid unnecessary abstractions.
- Inline one-line helpers unless they remove meaningful duplication or clarify a complex block.
- Use clear business names. Avoid `data`, `item`, `record`, `result`, `tmp`, `obj`, `val`, and `arr`.
- Use entity-specific route params and variables, for example `userId`, `roleId`, `salesOrderId`.
- Use `reqDto` for a single request DTO input in controller/service methods.
- Boolean names should read as true/false statements, for example `isActive`, `hasPermission`, `canApproveOrder`.
- Add comments only for non-obvious business rules or complex logic.

## API And Security Rules

- Use existing decorators: `@ApiAuth`, `@ApiPublic`, `@Permissions('resource:action')`, `@User`, field decorators, and `@UUIDParam`.
- Business errors use `AppException`.
- Never expose passwords, hashes, tokens, secrets, or connection strings.
- Validate all client input through DTOs, params, and pipes.
- Do not trust calculated values from clients.
- Do not pass raw SQL, raw table names, or raw column names from clients.
- Whitelist dynamic sort fields.
- Passwords must be hashed before storage.
- Protected business endpoints should use permissions; `system:manage` is the broad system permission.

## Database Rules

- Use Drizzle schemas from `src/database/schemas/`.
- Export schemas and relations through `src/database/schemas/index.ts`.
- Use camelCase TypeScript keys and snake_case database names.
- Use `.returning()` for PostgreSQL writes when the service needs the changed row.
- Set `updatedAt` explicitly on updates.
- Use transactions for multi-step writes.
- Do not run migrations without explicit user approval.

## Verification

- Use `pnpm` for scripts.
- Run targeted tests when possible.
- Do not run `pnpm run build` after every code change by default.
- Run `pnpm run build` only when the user asks, when debugging a build/type error, or when the change has broad dependency-wiring risk.
- Do not build after docs-only or DTO-only changes unless the user asks.
- Report commands run and whether they passed.
- Always run `codegraph sync` after finishing code changes, especially when adding new files, to ensure the codebase index is up to date.


