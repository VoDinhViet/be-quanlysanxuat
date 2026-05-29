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
- `docs/standards/naming-standards.md`
- `docs/standards/typescript-standards.md`
- `docs/standards/nestjs-standards.md`
- `docs/standards/api-standards.md`
- `docs/standards/database-standards.md`

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

## Nest CLI Rules

- Use Nest CLI when starting a new module/controller/service:
  - `pnpm nest generate module api/<module>`
  - `pnpm nest generate controller api/<module> --no-spec`
  - `pnpm nest generate service api/<module> --no-spec`
- Use manual file creation for DTOs, types, schemas, tests, or follow-up files that Nest CLI does not generate cleanly.
- Remove generated boilerplate that does not match the requested business behavior.

## Verification

- Use `pnpm` for scripts.
- Run targeted tests when possible.
- Do not run `pnpm run build` after every code change by default.
- Run `pnpm run build` only when the user asks, when debugging a build/type error, or when the change has broad dependency-wiring risk.
- Do not build after docs-only or DTO-only changes unless the user asks.
- Report commands run and whether they passed.
- Always run `codegraph sync` after finishing code changes, especially when adding new files, to ensure the codebase index is up to date.



