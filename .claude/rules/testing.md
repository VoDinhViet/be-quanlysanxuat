# Testing Rules

Reference implementation: `src/api/clients/clients.service.spec.ts` (fullest example: CRUD + child table + partial-update guard) and `src/api/clients/clients.controller.spec.ts`.

## File naming & location

- `*.service.spec.ts` / `*.controller.spec.ts`, colocated next to the file under test (standard Nest CLI convention). Unit tests only — this repo has no e2e test suite beyond the default `test/app.e2e-spec.ts` scaffold; don't add to `test/` unless explicitly asked.
- Every new module needs both a service spec and a controller spec.
- Start from the Nest CLI's own skeleton (what `nest g service`/`nest g controller` generates) rather than inventing a different shape:

  ```ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { XService } from './x.service';

  describe('XService', () => {
    let service: XService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [XService /* + provider overrides, see below */],
      }).compile();

      service = module.get<XService>(XService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    // ... real test cases below
  });
  ```

## Running tests

```bash
pnpm test                  # all unit tests
pnpm test -- users.service # single file (matches path/name)
pnpm test:cov               # with coverage report
```

No `coverageThreshold` is enforced in `package.json` at this stage — don't add one without being asked.

## Testing a Service

- Provide the `DRIZZLE` token directly in the test module — don't import `DatabaseModule` (it's `@Global()`, importing it would hit the real DB):
  ```ts
  Test.createTestingModule({
    providers: [XService, { provide: DRIZZLE, useValue: mockDb }],
  });
  ```
- Mock Drizzle's fluent builder chains (`db.select().from().where()`, `db.insert().values().returning()`, `db.update().set().where()`, `db.delete().where()`, `.groupBy()`, `.orderBy()`, ...) with `chainableMock()` from `src/test-utils/chainable-mock.util.ts` — it wraps `chainable()` (a proxy where every chained call keeps returning itself, and `await`-ing it at any point resolves to the value you pass in) as a properly-typed `jest.Mock`, so call sites don't have to deal with `chainable()`'s inherent `any`:
  ```ts
  const mockDb = {
    select: chainableMock([{ total: 0 }]),
    insert: chainableMock([insertedRow]),
    update: chainableMock(undefined),
    delete: chainableMock(undefined),
    query: {
      clients: { findMany: jest.fn<any, [QueryMockArgs]>().mockResolvedValue([]), findFirst: jest.fn() },
      clientGroups: { findFirst: jest.fn() },
    },
  };
  ```
  For `db.query.<table>.findMany`/`findFirst`, mock directly with `jest.fn<any, [QueryMockArgs]>().mockResolvedValue(...)` per test case — don't route these through `chainableMock()`, they're not chained further. Typing `findMany`'s mock with the `[QueryMockArgs]` args tuple (also exported from `chainable-mock.util.ts`) means `mockFn.mock.calls[0][0]` comes back as `QueryMockArgs`, not `any`, so asserting on `callArgs.where`/`.limit`/`.offset`/`.with` needs no cast.
- **`db.transaction` needs its own explicit mock** — `chainable()` can't model it (every property access returns a fresh `jest.fn`, so the callback never runs and the test silently asserts nothing). Add the key by hand and hand the callback `mockDb` itself, so `tx.insert(...)` resolves to the same jest mock and every `toHaveBeenCalledWith`/`toHaveBeenCalledTimes` assertion keeps working:
  ```ts
  transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)),
  ```
  `chainable()` also can't report what `.values()` received, for the same reason. When a test needs to assert on the written row, use a capturing insert mock instead — see `buildInsertMock` + `insertedValues` in `src/api/materials/materials.service.spec.ts`.
- A service that opens a transaction **must** have a rollback test: `mockDb.transaction.mockRejectedValue(...)`, then assert the error propagates *and* that the post-commit re-fetch never ran.
- `jest.clearAllMocks()` in `afterEach` so call-count/argument assertions don't leak between test cases.
- Cover, for every public method:
  - The happy path.
  - **Every** `AppException` branch the method can throw (not-found, conflict, ...) — assert it carries the right `ErrorCode`. `AppException` passes `{ errorCode, message }` to `HttpException` as the *response body*, so the code sits under `response`, not on the error itself: `await expect(promise).rejects.toMatchObject({ response: { errorCode: ErrorCode.E036 } })`. Asserting `{ errorCode: ... }` at the top level always fails.
  - Module-specific edge cases where they exist: the "no values to set" partial-update guard — per `.claude/rules/api-module.md`, a partial update always spreads the DTO + `updatedAt`, so `.update()` is called on *every* PATCH, even one that only touches a child table (assert it resolves without throwing and that `mockDb.update` was called with `updatedAt` alongside whatever fields were actually sent — see `clients.service.spec.ts`'s `'issues a safe updated_at-only UPDATE when only contacts are sent'`); replace-all child-table logic (old rows deleted, new rows inserted only when the array is non-empty, existing rows left untouched when the field is omitted entirely); auto-generated vs explicit `code`; uniqueness checks excluding the current row on update (`ne(id, ignoredId)`).
- Prefer asserting `mockDb.X` was called with the expected arguments (`toHaveBeenCalledWith`) over asserting on `chainable()` internals — the chain mock only exists to make the call succeed, not to be inspected.

## Testing a Controller

- Controllers are always "thin" per `.claude/rules/api-module.md` (they just call the service) — don't re-test business logic here, only that the controller wires up correctly.
- Mock the whole service, no DB involved:
  ```ts
  const mockService = { getClients: jest.fn(), createClient: jest.fn(), ... };
  Test.createTestingModule({
    controllers: [XController],
    providers: [{ provide: XService, useValue: mockService }],
  });
  ```
- One test per route: call the controller method, assert it delegates to the right service method with the right arguments (including `@CurrentUser()` payload mapping, e.g. `payload.sub` passed as `userId`), and returns whatever the mocked service returned.
- If any route on the controller carries `@UseGuards(JwtAuthGuard)`, `Test.createTestingModule({...}).compile()` will still try to instantiate the real `JwtAuthGuard` (and transitively `AuthService`) while wiring up the module's enhancers, even though the test never goes through HTTP and never triggers the guard — this fails with "Nest can't resolve dependencies of the JwtAuthGuard". Fix by overriding the guard before `.compile()`:
  ```ts
  const module: TestingModule = await Test.createTestingModule({
    controllers: [XController],
    providers: [{ provide: XService, useValue: mockService }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  ```
  Controllers with only `@ApiPublic()` routes (no `@UseGuards`) don't need this.

## Typing mocks

`eslint.config.mjs` turns `@typescript-eslint/no-explicit-any` **off** project-wide, so mock objects (especially anything built with `chainable()`) may use `any`/loose typing freely. Prefer a real type (`Partial<Database>`, the actual service's public interface) when it's easy, but don't fight the type system for test-only scaffolding.
