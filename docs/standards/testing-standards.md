# Testing Standards

Rules for writing NestJS API tests in this project.

References:

- NestJS Testing: https://docs.nestjs.com/fundamentals/testing
- Jest Async Testing: https://jestjs.io/docs/asynchronous
- Jest Mock Functions: https://jestjs.io/docs/mock-function-api

## 1. Test File Creation

- Use Nest CLI generated specs as the default starting point when adding new controllers or services:
  - `pnpm nest generate controller api/<module>`
  - `pnpm nest generate service api/<module>`
- Keep the generated `*.spec.ts` file and replace boilerplate with meaningful project tests.
- Create spec files manually only when the controller/service already exists or Nest CLI would overwrite working code.
- Place unit specs next to the class they test, for example `src/api/auth/auth.service.spec.ts`.
- Place end-to-end specs under `test/` with the `.e2e-spec.ts` suffix.

## 2. Test Scope

- Controller specs verify route delegation, decorators that affect behavior, request validation, current user extraction, and returned DTO shape.
- Service specs verify business rules, database query decisions, transactions, mapping to response DTOs, and expected `AppException` or Nest exceptions.
- E2E specs verify request flow through guards, pipes, filters, global prefix/versioning, and real HTTP response shape.
- Do not test Nest framework internals or third-party libraries.
- Do not duplicate every service test in controller specs; cover the layer responsibility only.

## 3. API Behavior Coverage

Every API behavior change should add or update focused cases for:

- Main success path.
- Request validation failure.
- Permission/auth failure when the endpoint is protected.
- Missing entity or invalid state failure.
- Database uniqueness or relation failure when the service handles it explicitly.
- Response DTO does not expose secrets such as passwords, hashes, access tokens where not expected, refresh tokens where not expected, or config values.

## 4. Nest Testing Pattern

- Use `Test.createTestingModule(...)` from `@nestjs/testing` for controller and service specs when DI is involved.
- Use `overrideProvider(...).useValue(...)` or explicit provider mocks to isolate database, Redis, JWT, external services, and cross-module services.
- Use `createNestApplication()` and `await app.init()` only for HTTP/e2e-style specs that need pipes, guards, filters, interceptors, or Supertest.
- Always close created Nest applications in `afterAll` or `afterEach` with `await app.close()`.
- Apply the same global `ValidationPipe` behavior in HTTP specs when validation behavior is under test.

## 5. Mocking Rules

- Type mocks with `jest.Mocked<T>` or `jest.Mocked<Pick<T, 'method'>>` instead of `any`.
- Use `mockResolvedValue`, `mockRejectedValue`, `mockImplementation`, and `jest.spyOn` for async dependencies.
- Reset or recreate mocks between tests so cases do not depend on test order.
- Mock database clients at the service boundary unless the test is intentionally an integration/e2e test.
- Do not connect to the real database, Redis, queues, storage, or network in unit specs.

## 6. Async Rules

- Always `await` async service calls, `expect(...).resolves`, `expect(...).rejects`, and Supertest requests.
- Use `await expect(promise).rejects.toThrow(...)` for expected async failures.
- Do not mix callback-style `done` tests with `async`/`await` unless the library requires callbacks.

## 7. Data Rules

- Use small, explicit fixtures inside the spec or a nearby test helper.
- Use realistic IDs, permission codes, enum values, and timestamps.
- Avoid snapshots for API responses unless the shape is intentionally large and stable.
- Assert important fields directly instead of comparing huge objects that make failures noisy.

## 8. Command Rules

- Run the narrowest relevant test command after adding or changing tests:
  - `pnpm test auth.service.spec.ts`
  - `pnpm test users.controller.spec.ts`
  - `pnpm test:e2e -- auth.e2e-spec.ts`
- Run broader tests only when shared wiring, guards, filters, database helpers, or global app setup changes.
- Report the exact test command and pass/fail result in the final response.
