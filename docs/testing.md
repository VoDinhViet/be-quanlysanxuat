# Testing Rules

Use `pnpm.cmd` on Windows to avoid PowerShell execution policy issues.

Unit tests:

```text
pnpm.cmd test
```

E2E tests:

```text
pnpm.cmd test:e2e
```

Build check:

```text
pnpm.cmd run build
```

Rules:

- Do not build after small docs-only or DTO-only changes unless the user asks.
- Run build when changing shared types, constructors, schemas, guards, modules, or dependency wiring.
- Run targeted tests when possible.
