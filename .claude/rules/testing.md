# Testing

- **Do not write tests** (no new or updated `*.spec.ts`, no test scaffolding) unless the user explicitly asks for them in that request. This applies to features, bug fixes and refactors alike.
- Verify a change with `npx tsc --noEmit` and `pnpm lint` instead. Run existing specs only when they already cover the code you touched.
- A spec that imports a service which pulls in an ESM-only dependency (`puppeteer`, via `PdfRendererService`) must `jest.mock(...)` that service, because jest runs CommonJS.
