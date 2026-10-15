# Project overrides

These rules win over anything in `.claude/rules/ecc/` when they conflict.

- **No tests unless asked.** Do not write or update `*.spec.ts` or test scaffolding unless the user asks in that request. The TDD step in `ecc/common/development-workflow.md` and the 80% coverage target do not apply here.
- **Verify with** `npx tsc --noEmit` and `pnpm lint`. Run existing specs only when they cover the code you touched. A spec that imports `PdfRendererService` must `jest.mock(...)` it (puppeteer is ESM-only).
- **No commit or push** unless the user orders it in that request.
- **Never run destructive scripts or `pnpm db:migrate`** against the remote dev/prod databases without approval. `drizzle-kit` is interactive: ask the user to run it.
- **Immutability** (`ecc/common/coding-style.md`) applies to plain data; do not rewrite Drizzle query builders or Nest providers to fit it.
