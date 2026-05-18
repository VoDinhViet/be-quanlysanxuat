# Architecture

## Project Instructions

This project is a NestJS API using a Modular Monolith style.

## Tech Stack

- Runtime: Node.js.
- Framework: NestJS 11.
- Language: TypeScript.
- Database: PostgreSQL.
- ORM: Drizzle ORM `^0.45.2`.
- Migration tool: Drizzle Kit `^0.31.10`.
- Database driver: `postgres`.
- Auth: JWT via `@nestjs/jwt`.
- Validation/serialization: `class-validator`, `class-transformer`.
- API docs: `@nestjs/swagger`.
- Tests: Jest, ts-jest, Supertest.
- Package manager: pnpm.

## Layers

- Controller
- Service
- DTO
- Drizzle Schema
- Guard

## Layer Rules

- Controllers are thin. They handle HTTP, decorators, DTO input, and service calls only.
- Services contain business logic, orchestration, and Drizzle queries unless a module explicitly introduces a repository later.
- DTOs define request validation and response shaping.
- Drizzle schemas define database tables, enums, indexes, and relations.
- Guards handle authentication and permission checks only.
- Do not import controllers from other modules.
- Prefer service-to-service communication between modules.

## Folder Rules

Business API modules live under:

```text
src/api/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
```

Database schemas live under:

```text
src/database/schemas/
```

Large schema domains may use folders:

```text
src/database/schemas/<domain>/
  index.ts
  relations.ts
  *.ts
```

Shared code locations:

```text
src/decorators/
src/guards/
src/constants/
src/exceptions/
src/filters/
src/common/
```
