# API Module Rules (Controller + Service)

Reference implementation: `src/api/users/users.controller.ts` and `src/api/users/users.service.ts`.

## Controllers

- Decorate the class with `@ApiTags('X')` and `@Controller('x')`.
- Decorate each handler with `@ApiAuth({ type, summary, isPaginated?, statusCode? })` (JWT-authenticated, from `src/decorators/http.decorators.ts`) or `@ApiPublic({...})` for public routes. Both bundle the Swagger response shape — don't hand-roll `@ApiOkResponse`/`@ApiResponse`.
- Use `@UUIDParam('id')` (`src/decorators/param.decorators.ts`) for UUID path params — never a raw `@Param('id')`.
- Handlers must stay **thin**: `return this.xService.method(reqDto);` directly, no branching or business logic in the controller. Type the return as `Promise<XResDto>` or `Promise<OffsetPaginatedDto<XResDto>>`.
- `@Permissions('resource:action')` is **live and enforced** by `PermissionsGuard` (`src/api/auth/guards/permissions.guard.ts`), registered globally as `APP_GUARD` right after `JwtAuthGuard` — it reads the decorator's metadata and 403s (`ErrorCode.E033`) if the caller's role lacks the permission (a role holding `system:manage` passes everything). Every non-`@Public()`/`@ApiPublic()` route should declare the permission it needs.

## Services

- `@Injectable()`, inject the DB with `constructor(@Inject(DRIZZLE) private readonly db: Database)` (`DRIZZLE` token from `src/database/database.module.ts`, `Database` type from `src/database/database.type.ts`).
- Read with the relational query API: `this.db.query.<table>.findMany({ where, limit, offset, orderBy })` / `.findFirst({ where, columns })`. Write with the builder API: `this.db.insert(table).values({...}).returning()`, `this.db.update(table).set({...}).where(...).returning()`.
- Fetch nested relations for a response DTO with `with: { relation: true }` (full related row) — don't hand-pick `columns` there. The response DTO's `@Exclude()`/`@Expose()` (`.claude/rules/dto.md`) is what actually restricts the serialized shape, so mirroring a column list at the query layer is redundant and drifts out of sync as the DTO changes. This is different from `columns` on a root existence-check query (e.g. `ensureXExists`), which legitimately narrows to `{ id: true }` since there's no DTO involved.
- **Build write payloads by spreading the DTO** (`{ ...reqDto }`), not by listing every column by hand. This applies equally to `insert().values()` on create and `update().set()` on update — a create shouldn't fall back to hand-listing just because there's no `updatedAt` to force the spread. Adding a field to the DTO shouldn't require remembering a second edit — forget it and the field is silently never written, with no error. When the DTO also carries child collections that aren't columns on the table (`payment`, `contacts`, `representatives`, `attachmentFileIds`), peel them off first and spread the rest:

  ```ts
  const { payment, representatives, attachmentFileIds, ...supplierFields } =
    reqDto;
  await tx
    .insert(suppliers)
    .values({ ...supplierFields, code, createdBy: userId });
  ```

  The same peel-then-spread shape applies to a **nested child DTO** once it's been peeled off the parent (e.g. `UsersService.createCredential`'s `credential: CreateCredentialReqDto`), not just the top-level `reqDto`:

  ```ts
  const password = await hash(credential.password, PASSWORD_SALT_ROUNDS);
  await this.db.insert(credentials).values({ ...credential, password });
  ```

  A field that needs a **transform, a default, or is computed** (a hashed password, `String(specificWeight)` for a `numeric` column, `status ?? DEFAULT`, an auto-generated `code`, `createdBy`, a computed `totalAmount`) is written by placing that key **after** the spread so it wins — object literal semantics, later key overrides earlier — instead of re-listing the unchanged sibling fields next to it.

  `.values()`/`.set()` are strictly typed, so spreading a field that isn't a column is a compile error rather than a runtime surprise.

- **Every partial UPDATE writes `updatedAt: new Date()` alongside the spread.** This is not cosmetic: `.set()` throws a bare `Error: No values to set` when every value is `undefined`, which reaches the client as a **500**, and that is the normal shape of an empty PATCH body or one touching only a child table (`{ payment: {...} }` on a supplier). The always-present timestamp keeps the statement valid. It also means a no-op PATCH bumps `updated_at` — accepted, since the row was addressed by a write request.

  ```ts
  await this.db
    .update(clients)
    .set({ ...clientFields, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  ```

  (`$onUpdate` on the column does _not_ cover this — drizzle rejects the empty set before applying it.)

- **Don't hand-roll `if (reqDto.field !== undefined) setValues.field = reqDto.field` per column to build a partial-update payload.** It's redundant: Drizzle already drops `undefined` values from `.set()`, `ValidationPipe`'s `whitelist: true` already stripped anything not on the DTO, and the always-present `updatedAt` (above) already keeps the statement non-empty. Spread the DTO straight into `.set()`, same as a create — see `RoutingService.updateStep`/`BomsService.updateBomItem`. Three cases still need an explicit `!== undefined` (or an equivalent narrower check) instead of a plain spread:
  - **Replace-all on a child collection where `[]` is a meaningful value** ("clear all") distinct from "field omitted" — spreading can't tell those apart. See `OrdersService.updateOrder`'s `items`.
  - **A field that needs a transform before it can be written** (e.g. a `number` DTO field going into a `numeric`/string column) — peel it off, spread the rest, and write the transformed value only `if (field !== undefined)`. See `BomsService.updateBomItem`'s `quantity`.
  - **A business-rule check that must run only when the field was actually sent**, independent of the write itself (e.g. an integer-only constraint that shouldn't fire on an update that doesn't touch the field). A plain truthy check (`if (reqDto.field)`) is fine here instead when the valid value range excludes falsy (e.g. a required UUID) — reserve `!== undefined` for when `0`/`''`/`false` must still count as "sent".
- Always map entities to response DTOs with `plainToInstance(XResDto, entity, { excludeExtraneousValues: true })` — never return a raw Drizzle row from a service method that a controller exposes.
- After create/update, re-fetch the row by id (e.g. a `getXDetail(id)` helper) and map that — don't map the raw `.returning()` result directly.
- Factor existence/uniqueness checks into private helpers, named by which of the two they do — don't mix the two verbs:
  - `ensureXExists(id)` — the row (or a referenced FK row, e.g. `ensureUnitExists(unitId)`) must exist; throws 404 if not found. May return the found row when the caller needs it right after (e.g. to copy its fields), instead of re-fetching.
  - `validateXUniqueness(value, ignoredId?)` — `value` must not already be taken by another row; throws 409 if a conflicting row exists. When excluding the current row on update, filter with `and(eq(table.field, value), ne(table.id, ignoredId))`.
  - See `src/api/products/products.service.ts` for a service using both (`ensureUnitExists`, `ensureProductExists`, `validateCodeUniqueness`).
- Throw business errors with `throw new AppException(ErrorCode.Exxx, HttpStatus.XXX)` — see `.claude/rules/errors-pagination.md`.
- Configuration constants (e.g. bcrypt salt rounds) go on the class as `private static readonly NAME = value`.

## Transactions

Reference implementation: `MaterialsService.createMaterial` (`src/api/materials/materials.service.ts`) — the only transaction in the repo so far.

- **When you need one**: two or more write statements that must all land or all roll back (parent row + child rows, replace-all on a child table, a write plus its audit-log row). A single write needs no transaction — Postgres already makes it atomic.
- **Shape**: run every read-only check _first_ (`ensureXExists`, `validateXUniqueness`, `FilesService.ensureFilesExist`), then wrap only the writes. Return the id from the callback and re-fetch the detail **after** the transaction commits — don't build a response DTO inside it.

  ```ts
  const { attachmentFileIds, ...materialFields } = reqDto;

  const materialId = await this.db.transaction(async (tx) => {
    const [material] = await tx
      .insert(materials)
      .values({ ...materialFields, code, createdBy: userId })
      .returning();
    if (attachmentFileIds?.length) {
      await this.insertAttachments(tx, material.id, attachmentFileIds);
    }
    return material.id;
  });

  return this.getMaterialDetail(materialId);
  ```

- **Inside the callback use `tx` for every statement — never `this.db`.** `this.db` checks out a _different_ connection from the pool, so those statements run outside the transaction and commit on their own. There is no error and no warning when this happens; it is the easiest way to silently lose atomicity.
- **A write helper called from a transaction takes `tx: DbTransaction` as its first, required parameter** (`DbTransaction` from `src/database/database.type.ts`) — not a `Database | DbTransaction` union and never a `= this.db` default. `Database` is not assignable to `DbTransaction`, so this turns the mistake above into a compile error instead of a convention to remember.
- **Abort with `throw new AppException(...)`, not `tx.rollback()`.** Any throw inside the callback rolls the transaction back, and `AppException` keeps the right error code and HTTP status through `GlobalExceptionFilter`. `tx.rollback()` throws drizzle's `TransactionRollbackError`, which propagates out of `db.transaction()` untouched and surfaces to the client as a bare **500**.
- **A transaction gives atomicity, not isolation from concurrent writers.** Uniqueness checks run before it opens, so a TOCTOU window remains (see `generateMaterialCode()`, which counts rows and adds 1). The only real defence is a DB unique constraint.
- **Don't reach for these until a feature actually needs them**: nested `tx.transaction()` (real `SAVEPOINT`s) and the config argument (`isolationLevel` / `accessMode` / `deferrable`, emitted as `SET TRANSACTION ...`). The default `read committed` is fine; if you change it, write down why.
