# Service Layer Rules

Nơi mọi business logic sống. Reference: `src/api/users/users.service.ts`.

## Wiring & queries

- MUST be `@Injectable()` and inject the DB as `constructor(@Inject(DRIZZLE) private readonly db: Database)`.
- MUST default to the relational query API for reads (`db.query.<table>.findMany/findFirst`), and MUST fall back to `.select({...})` + explicit joins only when the read needs something the relational API can't express — a computed SQL column, an aggregate, or filtering/sorting on a joined table. MUST write with the builder API (`db.insert/update/delete`).
- MUST fetch nested relations with `with: { relation: true }`. MUST NOT hand-pick `columns` there — the response DTO's `@Expose()` is what restricts the shape. Exception: an existence-check query may narrow to `{ id: true }`.
- MUST put config constants on the class as `private static readonly NAME = value`.

## Writes

- MUST build write payloads by spreading the DTO into `.values()` and `.set()`. MUST NOT list columns by hand, and MUST NOT hand-roll `if (reqDto.x !== undefined) setValues.x = reqDto.x` — Drizzle drops `undefined` and `ValidationPipe` already stripped unknown keys.
  - MUST peel off nested objects/child collections that aren't columns before spreading:
    ```ts
    const { credential, ...userFields } = reqDto;
    await this.db
      .insert(users)
      .values({ ...userFields, code, credentialId, createdBy: actorCredentialId });
    ```
  - MUST place transformed/computed/defaulted keys **after** the spread so they win.
  - MUST use an explicit `!== undefined` check only when: `[]` is meaningful ("clear all") vs omitted; a value needs transforming before write; or a business check must run only when the field was sent.
- MUST NOT write `updatedAt: new Date()` by hand — every table's `updatedAt` has `$onUpdate` (`.claude/rules/database.md`).
- MUST use a transaction when two or more writes must all land or all roll back; a single write is already atomic. Inside the callback MUST use `tx` for every statement — `this.db` takes a different pooled connection and silently commits outside the transaction. Read `.claude/rules/transactions.md` before writing one.

## Responses

- MUST map to a response DTO with `plainToInstance(XResDto, entity, { excludeExtraneousValues: true })`. MUST NOT return a raw Drizzle row from a service method a controller exposes.
- MUST re-fetch by id after create/update and map that. MUST NOT map the raw `.returning()` result.
- MUST return lists as `new OffsetPaginatedDto(items, new OffsetPaginationDto(total, reqDto))`, fetching page + count together via `Promise.all`.

## Checks & errors

- MUST factor checks into helpers named for what they do, and MUST NOT mix the two verbs:
  - `ensureXExists(id)` — throws 404 if missing; may return the row.
  - `validateXUniqueness(value, ignoredId?)` — throws 409 on conflict; on update filter with `and(eq(table.field, value), ne(table.id, ignoredId))`.
- MUST throw business errors as `new AppException(ErrorCode.Exxx, HttpStatus.XXX)`. MUST add every new code to `ErrorCode` (`src/constants/error-code.constant.ts`, `Vxxx` validation / `Exxx` domain). MUST NOT hardcode message strings at the throw site.
- MUST wire a new permission per `.claude/rules/security.md` — both `PERMISSION_CODES` and the role seed.
