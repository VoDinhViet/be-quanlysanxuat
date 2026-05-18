# Quan Ly San Xuat API

Backend API for the production management system.

This project is a NestJS 11 modular monolith using PostgreSQL, Drizzle ORM, JWT authentication, RBAC permissions, Redis, Swagger, and Jest.

## Tech Stack

- Runtime: Node.js
- Package manager: pnpm
- Framework: NestJS 11
- Language: TypeScript
- Database: PostgreSQL
- ORM: Drizzle ORM
- Migration tool: Drizzle Kit
- Auth: JWT with `@nestjs/jwt`
- Validation: `class-validator`, `class-transformer`
- API docs: Swagger
- Tests: Jest, Supertest

## Requirements

- Node.js
- pnpm
- PostgreSQL
- Redis

## Setup

Install dependencies:

```bash
pnpm install
```

Create environment file:

```bash
cp .env.example .env
```

Update these values in `.env`:

```text
PORT=8003
DATABASE_URL=postgresql://user:password@localhost:5432/db
DATABASE_SSL_MODE=false
FRONTEND_DOMAIN=http://localhost:3000
BACKEND_DOMAIN=http://localhost:8003
AUTH_JWT_SECRET=secret
AUTH_JWT_TOKEN_EXPIRES_IN=7d
AUTH_REFRESH_SECRET=refresh_secret
AUTH_REFRESH_TOKEN_EXPIRES_IN=7d
REDIS_URL=redis://localhost:6379
```

## Run

Development:

```bash
pnpm.cmd run start:dev
```

Production build:

```bash
pnpm.cmd run build
pnpm.cmd run start:prod
```

Default local API:

```text
http://localhost:8003/api
```

Swagger docs are available outside production:

```text
http://localhost:8003/api-docs
```

## Database

Generate migrations:

```bash
pnpm.cmd db:generate
```

Run migrations:

```bash
pnpm.cmd db:migrate
```

Seed default users:

```bash
pnpm.cmd db:seed:default-users
```

Open Drizzle Studio:

```bash
pnpm.cmd db:studio
```

Do not run migrations against shared or production databases without explicit approval.

## Scripts

```bash
pnpm.cmd run build
pnpm.cmd run start:dev
pnpm.cmd run lint
pnpm.cmd run format
pnpm.cmd test
pnpm.cmd test:e2e
pnpm.cmd test:cov
```

Use `pnpm.cmd` on Windows to avoid PowerShell execution policy issues.

## Project Structure

```text
src/
  api/
    auth/
    users/
  common/
  config/
  constants/
  database/
    schemas/
    seeds/
  decorators/
  exceptions/
  filters/
  guards/
  redis/
```

Business modules should follow this structure:

```text
src/api/<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/
```

## Main Modules

- `auth`: login, JWT verification, current user profile.
- `users`: user management, roles, status, password changes.
- `database`: Drizzle connection, schemas, migrations, seeds.
- `redis`: Redis configuration and integration.

## API Conventions

- Controllers stay thin.
- Services own business logic and Drizzle queries.
- DTOs define validation and response shaping.
- Business errors use `AppException`.
- Authenticated endpoints use `@ApiAuth`.
- Public endpoints use `@ApiPublic`.
- Business permission checks use `@Permissions`.
- Response DTOs must not expose passwords, hashes, tokens, secrets, or connection strings.

## Internal Docs

Read these files before non-trivial code changes:

```text
docs/architecture.md
docs/coding-rules.md
docs/api-standards.md
docs/database-rules.md
docs/auth-rbac.md
docs/security.md
docs/testing.md
```

Workflow and module docs:

```text
docs/workflows/auth.md
docs/modules/users.md
```

Agent instructions:

```text
AGENTS.md
```

## Testing

Unit tests:

```bash
pnpm.cmd test
```

E2E tests:

```bash
pnpm.cmd test:e2e
```

Coverage:

```bash
pnpm.cmd test:cov
```
