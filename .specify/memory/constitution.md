<!--
Sync Impact Report
- Version change: (template, unversioned) → 1.0.0
- Rationale: Initial ratification. All principles derived from the existing codebase and the
  project standards previously maintained under docs/standards/ (nestjs, api, database,
  naming, testing, typescript) and docs/architecture.md.
- Modified principles: n/a (initial adoption)
- Added sections:
  - Core Principles (I–V)
  - Technology Stack & Conventions
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: none
- Templates status:
  - .specify/templates/plan-template.md ✅ compatible (generic "Constitution Check" gate is
    filled per-plan from this file; no structural change required)
  - .specify/templates/spec-template.md ✅ compatible (no constitution-specific sections)
  - .specify/templates/tasks-template.md ✅ compatible (task categories map to Principles
    I–V; testing tasks follow Principle V)
- Follow-up TODOs: none
-->

# QuanLySanXuat Backend Constitution

Constitution for `be-quanlysanxuat`, the production-management backend: a NestJS 11
modular monolith on PostgreSQL with Drizzle ORM.

## Core Principles

### I. Layered Modular Monolith

Business features live as API modules under `src/api/<module>/`; shared infrastructure
lives in top-level `src/` folders (`database`, `common`, `guards`, `decorators`,
`filters`, `exceptions`, `constants`, `redis`, `utils`, `config`).

- The default flow is `Controller → Service → Drizzle Database`. A repository layer
  (`Controller → Service → Repository → Drizzle`) MAY be introduced only when a module's
  database complexity justifies it.
- Controllers MUST stay thin: route decorators, DTO input mapping, auth/permission
  metadata, current-user extraction, and a single call into the service layer. No
  business logic, no direct database/ORM access, no cache manipulation in controllers.
- Services own business logic, Drizzle query execution, transactional orchestration, and
  mapping to response DTOs (`plainToInstance` with `excludeExtraneousValues: true`).
- Repositories, when present, own database reads/writes only — no HTTP behavior, no
  business decisions.
- Modules MUST NOT import controllers from other modules; cross-module communication goes
  service-to-service, exporting only stable services. New business APIs MUST NOT be
  placed under `src/modules/`.

Rationale: strict layer ownership keeps every module independently understandable,
testable, and safely evolvable inside one deployable monolith.

### II. Contract-First API Boundary

Every HTTP boundary is an explicit, validated contract.

- All incoming params, queries, and bodies MUST be validated via request DTOs
  (`class-validator`), relying on the global `ValidationPipe` with transform and
  whitelist enabled. No `any`-typed or unvalidated input reaches a service.
- Route params MUST be entity-specific (`:userId`, `:supplierId`), never generic `:id`;
  UUID params use the `@UUIDParam` decorator.
- Single resources return response DTOs directly; list endpoints MUST return
  `OffsetPaginatedDto<T>` (or the cursor-pagination equivalent) driven by
  `PageOptionsDto` inputs. Raw database entities are never returned.
- Expected business failures MUST be thrown as `AppException` with a registered
  `ErrorCode`; unexpected errors are normalized by `GlobalExceptionFilter`. Raw SQL
  errors, constraint names, and stack traces MUST NOT leak to clients.
- Client-provided sort/filter fields MUST be resolved through an explicit whitelist map —
  never interpolated into queries.
- Swagger documentation is maintained for every endpoint and disabled in production.

Rationale: the frontend and external consumers depend on predictable shapes and safe,
structured errors; validation and whitelisting at the boundary is also the first line of
security.

### III. Type Safety & Naming Discipline

TypeScript strictness and consistent naming are non-negotiable.

- `strict` mode stays enabled. `any` is forbidden; use `unknown` plus narrowing for
  dynamic values.
- Exported functions, controller actions, service methods, and repository operations MUST
  declare explicit return types (typically `Promise<XxxResDto>`), and carry a concise
  JSDoc block when they encode non-obvious business rules.
- Files/folders use `kebab-case`; DTO files end in `.req.dto.ts` / `.res.dto.ts`. Classes
  use `PascalCase` with role suffixes (`Controller`, `Service`, `Module`, `Guard`,
  `ReqDto`, `ResDto`). Methods use `camelCase` verb-first names (`createUser`,
  `ensureEmailAvailable`) — filler verbs (`handle`, `process`, `doStuff`) are forbidden.
  Booleans read as predicates (`is`/`has`/`can`/`should`).

Rationale: the compiler and a searchable, predictable vocabulary prevent whole classes of
runtime bugs and make the codebase navigable without tribal knowledge.

### IV. Database Discipline

All persistence goes through Drizzle ORM against PostgreSQL, with schema as code.

- Schema files live in `src/database/schemas/` and are exported via its `index.ts`.
  TypeScript keys are `camelCase` mapped explicitly to `snake_case` column names.
- Numeric primary keys use `generatedAlwaysAsIdentity()` — `serial()` is forbidden.
- Foreign keys MUST be explicit `.references()` with an intentional `onDelete` behavior,
  and relations centralized in `relations()` blocks next to the table definition.
- Queries use typed operators imported from `drizzle-orm` (`eq`, `and`, `inArray`,
  `count`, …). String-concatenated SQL is forbidden.
- Schema changes ship as Drizzle Kit migrations (`pnpm db:generate` → migration file in
  `drizzle/` → `pnpm db:migrate`). Hand-editing applied migrations is forbidden. Seed
  scripts live in `src/database/seeds/` with a `db:seed:*` script entry.

Rationale: typed schema + generated migrations keep the database, the code, and every
environment provably in sync, and eliminate SQL injection by construction.

### V. Layer-Scoped Testing

Every API behavior change ships with focused tests at the layer that owns the behavior.

- Unit specs sit next to the class they test (`*.spec.ts`); e2e specs live under `test/`
  with the `.e2e-spec.ts` suffix.
- Controller specs cover route delegation, behavior-affecting decorators, and returned
  DTO shape. Service specs cover business rules, query decisions, transactions, DTO
  mapping, and expected `AppException`s. E2E specs cover guards, pipes, filters,
  prefix/versioning, and real HTTP shapes. Framework internals are not tested, and layers
  do not duplicate each other's coverage.
- Each behavior change MUST cover: the success path, request-validation failure,
  auth/permission failure (when protected), missing-entity/invalid-state failure,
  explicitly handled uniqueness/relation failures, and that response DTOs expose no
  secrets (passwords, hashes, tokens, config values).
- Use `Test.createTestingModule` with typed mocks (`jest.Mocked<T>`), reset mocks between
  tests, and never touch real databases, Redis, queues, or network in unit specs. Always
  `await` async assertions and `app.close()` created applications.

Rationale: layer-scoped tests document behavior where it lives and fail precisely where a
regression occurs, keeping the suite fast and trustworthy.

## Technology Stack & Conventions

The stack is fixed unless amended here: Node.js runtime, pnpm package manager, NestJS 11,
TypeScript, PostgreSQL via Drizzle ORM (`postgres` driver, Drizzle Kit migrations), JWT
auth (`@nestjs/jwt` + Passport) with RBAC permission guards, Redis (ioredis/BullMQ-ready)
for cache/queue, `class-validator`/`class-transformer` for validation and serialization,
Swagger for API docs outside production, Jest + Supertest for tests.

Cross-cutting constraints:

- Bootstrap concerns (helmet, compression, CORS, `/api` global prefix, URI versioning,
  global guards `AuthGuard` → `RolesGuard`, global `ValidationPipe`,
  `ClassSerializerInterceptor`, `GlobalExceptionFilter`) are configured once in
  `src/main.ts` / `src/app.module.ts` — modules MUST NOT re-implement them locally.
- Environment config loads `.env.<NODE_ENV>` first, then `.env`; access goes through
  `@nestjs/config` typed config, never raw `process.env` in business code.
- Protected endpoints declare permissions via decorators (`@ApiAuth`, `@Permissions`);
  new endpoints are protected by default and opt out explicitly.
- Logs MUST NOT contain passwords, tokens, API keys, or full request DTOs — log safe
  identifiers only.

## Development Workflow & Quality Gates

- Work is spec-driven: features flow through `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, and every plan's Constitution Check gate is
  evaluated against this document.
- Before a change is considered done: `pnpm lint` and `pnpm format` are clean, the build
  compiles, and `pnpm test` (plus `pnpm test:e2e` when HTTP behavior changed) passes.
- Schema changes and their generated migration ship in the same change; a migration is
  reviewed like code.
- Code review verifies compliance with Principles I–V; any deviation MUST be justified in
  the PR description or the plan's Complexity Tracking section.
- Commits follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
  as established in the repository history.

## Governance

This constitution supersedes ad-hoc practices and prior scattered standards documents.
Where day-to-day guidance (README, module specs, agent guidance files) conflicts with
this document, this document wins until amended.

- Amendments are proposed as a PR editing this file, stating the change, rationale, and
  migration impact. On approval, bump the version per semantic versioning: MAJOR for
  removing/redefining a principle, MINOR for adding a principle or materially expanding
  guidance, PATCH for clarifications and wording.
- Every amendment updates the Sync Impact Report comment and propagates changes to the
  `.specify/templates/` files that depend on it.
- Compliance is reviewed at two gates: the plan-phase Constitution Check and code review.
  Unjustified violations block merge; justified ones are recorded in the plan's
  Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-12
