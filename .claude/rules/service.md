# Service Layer Rules

Nơi mọi business logic sống. Reference: `src/api/users/users.service.ts`.

## Wiring & queries

- MUST be `@Injectable()` and inject the DB as `constructor(@Inject(DRIZZLE) private readonly db: Database)`.
- MUST default to `.select({...})` + explicit joins for reads — more explicit about the exact shape read, easier to debug (visible column list and join graph, no hidden `with:` traversal). MUST fall back to the relational query API (`db.query.<table>.findMany/findFirst`) only when the read genuinely benefits from nested `with: { relation: true }` — fetching multiple relation levels in one call is the one thing `.select()` can't match without manual joins + mapping. MUST write with the builder API (`db.insert/update/delete`).
- When using the relational query API (nested relations), MUST fetch them with `with: { relation: true }`. MUST NOT hand-pick `columns` there — the response DTO's `@Expose()` is what restricts the shape. Exception: an existence-check query may narrow to `{ id: true }`.
- MUST put config constants on the class as `private static readonly NAME = value`.
- MUST NOT cast a relational query result to a hand-written type on suspicion of a type-inference collapse. A 2026-08-18 audit re-tested every such cast in the repo (relational reads nested 1-5 `with:` levels deep) by assigning the raw result to a deliberately wrong literal type and checking whether `tsc` still rejected it — it did, every time; the inferred type was never `{ [x: string]: any }`. None of the casts were doing anything, so all were removed along with their `types/*.type.ts` files. MUST NOT trust `eslint`'s `no-unsafe-*` rules to catch a real collapse either — they're OFF for `*.service.ts`/`types/*.type.ts`/schema/seed files repo-wide (`eslint.config.mjs`, an unrelated `users.id` FK-fanout issue), so a genuinely wrong cast would pass both `tsc` and `eslint` silently.
- If a query result's inferred type looks genuinely wrong (`.map()`/`.flatMap()` losing field names, hovering shows `any`), verify with the same probe before reaching for a cast: `const __probe: { bogusField: 1 } = row;` — if `tsc` accepts it without complaint, the real type already collapsed and a cast is warranted; if `tsc` rejects it (as above), the type is fine and no cast is needed. Only once verified, cast to an explicit local type built from the table's `XSelect` (`.claude/rules/database.md`) plus the extra relation fields actually used, one `type` per shape in `types/*.type.ts`, named for the shape it describes — MUST NOT suffix `Row`/`Type`. Suffix `WithX` only to distinguish two shapes of the **same** table in one file (`OutsourcingOrderItemWithOrder`).
- A plain type annotation on a `.select()` result (`const rows: BomItem[] = await this.db.select(...)`) is a different, legitimate pattern — declaring the expected shape of a flat multi-table `.select()` for readability, not defensively overriding a suspected bad inference. Reference: `BomsService.getBomTree` (`src/api/boms/boms.service.ts`).

## Writes

- MUST build write payloads by spreading the DTO into `.values()` and `.set()`. MUST NOT list columns by hand, and MUST NOT hand-roll `if (reqDto.x !== undefined) setValues.x = reqDto.x` — Drizzle drops `undefined` and `ValidationPipe` already stripped unknown keys.
  - MUST peel off child collections that aren't columns (`contacts`, `fileIds`, ...) before spreading:
    ```ts
    const { fileIds, ...supplierFields } = reqDto;
    await tx.insert(suppliers).values({ ...supplierFields, code, createdBy: userId });
    ```
  - MUST place transformed/computed/defaulted keys **after** the spread so they win.
  - MUST use an explicit `!== undefined` check only when: `[]` is meaningful ("clear all") vs omitted; a value needs transforming before write; or a business check must run only when the field was sent.
- MUST NOT write `updatedAt: new Date()` by hand — every table's `updatedAt` has `$onUpdate` (`.claude/rules/database.md`).
- MUST use a transaction when two or more writes must all land or all roll back; a single write is already atomic. Inside the callback MUST use `tx` for every statement — `this.db` takes a different pooled connection and silently commits outside the transaction. Read `.claude/rules/transactions.md` before writing one.
- MUST name a helper that reads a row with `SELECT … FOR UPDATE` inside a transaction `getXForUpdate(tx, id)` — returns the locked row, throws 404 when missing. MUST NOT prefix `lockX`. Reference: `InventoryIssuesService.getInventoryIssueForUpdate`.
- MUST name the variable holding an entity row after the entity, not a placeholder (`row`, `locked`, `entity`) — `getInventoryReceiptForUpdate` returns `inventoryReceipt`, not `row`.
- MUST name a variable/parameter holding document lines after what the call site does with them (`itemsToCreate`, `itemsToValidate`, `itemsToIssue`, `itemsToPost`, `insertedItems`), and a private child-write helper after the document (`createRequisitionItems`, not `createItems`). MUST NOT use a bare `lineItems`, `row`, or `items` — `items` is the master-data table (vật tư), so the bare word reads as the wrong entity.

## Responses

- MUST map to a response DTO with `plainToInstance(XResDto, entity, { excludeExtraneousValues: true })`. MUST NOT return a raw Drizzle row from a service method a controller exposes.
- MUST NOT map the raw `.returning()` result. A create/update that returns a body MUST re-fetch by id and map that; a create/update MAY instead return `void` with `statusCode: HttpStatus.NO_CONTENT` on the controller and skip the re-fetch entirely. Both are live in this repo — MUST NOT mix the two within one module.
- MUST return lists as `new OffsetPaginatedDto(items, new OffsetPaginationDto(total, reqDto))`, fetching page + count together via `Promise.all`.

## Checks & errors

- MUST factor checks into helpers named for what they do, and MUST NOT mix the two verbs:
  - `ensureXExists(id)` — throws 404 if missing; may return the row.
  - `validateXUniqueness(value, ignoredId?)` — throws 409 on conflict; on update filter with `and(eq(table.field, value), ne(table.id, ignoredId))`.
- MUST throw business errors as `new AppException(ErrorCode.Exxx, HttpStatus.XXX)`. MUST add every new code to `ErrorCode` (`src/constants/error-code.constant.ts`, `Vxxx` validation / `Exxx` domain). MUST NOT hardcode message strings at the throw site.
- MUST wire a new permission per `.claude/rules/security.md` — both `PERMISSION_CODES` and the role seed.
