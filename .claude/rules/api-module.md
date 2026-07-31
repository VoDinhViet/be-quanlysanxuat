# API Module Rules (Controller + Service)

Reference implementation: `src/api/users/users.controller.ts` and `src/api/users/users.service.ts`.

## Controllers

- Decorate the class with `@ApiTags('X')` and `@Controller('x')`.
- Decorate each handler with `@ApiAuth({ type, summary, isPaginated?, statusCode? })` (JWT-authenticated, from `src/decorators/http.decorators.ts`) or `@ApiPublic({...})` for public routes. Both bundle the Swagger response shape — don't hand-roll `@ApiOkResponse`/`@ApiResponse`.
- Use `@UUIDParam('id')` (`src/decorators/param.decorators.ts`) for UUID path params — never a raw `@Param('id')`.
- Handlers must stay **thin**: `return this.xService.method(reqDto);` directly, no branching or business logic in the controller. Type the return as `Promise<XResDto>` or `Promise<OffsetPaginatedDto<XResDto>>`.
- Every non-`@Public()`/`@ApiPublic()` route should declare the permission it needs with `@Permissions('resource:action')` — see `CLAUDE.md`'s Request pipeline section for how `PermissionsGuard` enforces it.

## Services

- `@Injectable()`, inject the DB with `constructor(@Inject(DRIZZLE) private readonly db: Database)` (`DRIZZLE` token from `src/database/database.module.ts`, `Database` type from `src/database/database.type.ts`).
- Read with the relational query API: `this.db.query.<table>.findMany({ where, limit, offset, orderBy })` / `.findFirst({ where, columns })`. Write with the builder API: `this.db.insert(table).values({...}).returning()`, `this.db.update(table).set({...}).where(...).returning()`.
- Fetch nested relations for a response DTO with `with: { relation: true }` (full related row) — don't hand-pick `columns` there; the response DTO's `@Exclude()`/`@Expose()` (`.claude/rules/dto.md`) is what actually restricts the serialized shape. Exception: `columns` on a root existence-check query (e.g. `ensureXExists`) legitimately narrows to `{ id: true }` since there's no DTO involved.
- **Build write payloads by spreading the DTO** (`{ ...reqDto }`) into `.values()` on create **and** `.set()` on update — don't list columns by hand, and don't hand-roll `if (reqDto.field !== undefined) setValues.field = reqDto.field` per column either. Drizzle already drops `undefined` from `.set()`, and `ValidationPipe`'s `whitelist: true` already stripped anything not on the DTO — a plain spread reproduces a correct partial-update payload on its own. Adding a field to the DTO shouldn't require a second edit elsewhere; forget one and the field is silently never written, no error. `.values()`/`.set()` are strictly typed, so spreading a field that isn't a column is a compile error, not a runtime surprise.

  When the DTO carries child collections that aren't columns on the table (`payment`, `contacts`, `representatives`, `attachmentFileIds`), peel them off first and spread the rest — same shape for a nested child DTO once it's been peeled off the parent (e.g. `UsersService.createCredential`'s `credential: CreateCredentialReqDto`):

  ```ts
  const { payment, representatives, attachmentFileIds, ...supplierFields } =
    reqDto;
  await tx
    .insert(suppliers)
    .values({ ...supplierFields, code, createdBy: userId });
  ```

  A field that needs a **transform, a default, or is computed** (a hashed password, `String(specificWeight)` for a `numeric` column, `status ?? DEFAULT`, an auto-generated `code`, `createdBy`, a computed `totalAmount`) is written by placing that key **after** the spread so it wins — object literal semantics, later key overrides earlier.

  Three cases still need an explicit `!== undefined` (or narrower) check instead of a plain spread:
  - **Replace-all on a child collection where `[]` is a meaningful value** ("clear all") distinct from "field omitted" — spreading can't tell those apart. See `OrdersService.updateOrder`'s `items`.
  - **A field that needs a transform before it can be written** (e.g. a `number` DTO field going into a `numeric`/string column) — peel it off, spread the rest, write the transformed value only `if (field !== undefined)`. See `BomsService.updateBomItem`'s `quantity`.
  - **A business-rule check that must run only when the field was actually sent**, independent of the write itself. A plain truthy check (`if (reqDto.field)`) is fine instead when the valid value range excludes falsy (e.g. a required UUID) — reserve `!== undefined` for when `0`/`''`/`false` must still count as "sent".

- **Don't write `updatedAt: new Date()` by hand in `.set()`.** Every table's `updatedAt` column already carries `$onUpdate(() => new Date())` (`.claude/rules/database.md`), applied automatically to any `UPDATE` that actually runs.

  Caveat: `$onUpdate` only fires once the statement is built. If **every** key in the `.set()` payload is `undefined` — an empty PATCH body, or one that only touches a child table (`{ contacts: [...] }` on a client, `{ payment: {...} }` on a supplier) — drizzle's `mapUpdateSet` throws a bare `Error: No values to set` first, which reaches the client as a **500**. This repo currently accepts that tradeoff (see `OrdersService.updateOrder`, `ClientsService.updateClient`) rather than guarding every call site; if a specific endpoint needs to support that PATCH shape safely, wrap the `.update()` in `if (Object.values(setValues).some((v) => v !== undefined))`.

- Always map entities to response DTOs with `plainToInstance(XResDto, entity, { excludeExtraneousValues: true })` — never return a raw Drizzle row from a service method that a controller exposes.
- After create/update, re-fetch the row by id (e.g. a `getXDetail(id)` helper) and map that — don't map the raw `.returning()` result directly.
- Factor existence/uniqueness checks into private helpers, named by which of the two they do — don't mix the two verbs:
  - `ensureXExists(id)` — the row (or a referenced FK row, e.g. `ensureUnitExists(unitId)`) must exist; throws 404 if not found. May return the found row when the caller needs it right after (e.g. to copy its fields), instead of re-fetching.
  - `validateXUniqueness(value, ignoredId?)` — `value` must not already be taken by another row; throws 409 if a conflicting row exists. When excluding the current row on update, filter with `and(eq(table.field, value), ne(table.id, ignoredId))`.
  - See `src/api/products/products.service.ts` for a service using both (`ensureUnitExists`, `ensureProductExists`, `validateCodeUniqueness`).
- Throw business errors with `throw new AppException(errorCode: ErrorCode, status: HttpStatus = HttpStatus.BAD_REQUEST, message?: string)` (`src/exceptions/app.exception.ts`). Every error code is a member of `ErrorCode` in `src/constants/error-code.constant.ts`, a dotted i18n-style key grouped by prefix (`Vxxx` validation, `Exxx` domain), e.g. `E002 = 'user.error.not_found'` — add new codes there, don't hardcode ad-hoc message strings at the throw site.
- List endpoints return `new OffsetPaginatedDto(mappedItems, new OffsetPaginationDto(total, reqDto))` (`src/common/dto/offset-pagination/`). Fetch the page and the total count together with `Promise.all([db.query.<table>.findMany({...}), db.select({ total: count() }).from(table).where(where)])`. List request DTOs `extends PageOptionsDto` (`.claude/rules/dto.md`) — don't reimplement `limit`/`page`/`q`/`order`/`offset`.
- Configuration constants (e.g. bcrypt salt rounds) go on the class as `private static readonly NAME = value`.
- **Two or more writes that must all land or all roll back** (parent + child rows, replace-all on a child table, a write plus its log row) need a transaction — a single write is already atomic and needs none. Inside the callback use `tx` for every statement, never `this.db` — `this.db` checks out a different connection from the pool, so those statements silently commit outside the transaction with no error or warning. Before writing one, read `.claude/rules/transactions.md` for the shape, the `DbTransaction`-as-first-param rule, and why not `tx.rollback()`.
