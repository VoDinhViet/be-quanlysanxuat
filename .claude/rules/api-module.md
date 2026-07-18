# API Module Rules (Controller + Service)

Reference implementation: `src/api/users/users.controller.ts` and `src/api/users/users.service.ts`.

## Controllers

- Decorate the class with `@ApiTags('X')` and `@Controller('x')`.
- Decorate each handler with `@ApiAuth({ type, summary, isPaginated?, statusCode? })` (JWT-authenticated, from `src/decorators/http.decorators.ts`) or `@ApiPublic({...})` for public routes. Both bundle the Swagger response shape — don't hand-roll `@ApiOkResponse`/`@ApiResponse`.
- Use `@UUIDParam('id')` (`src/decorators/param.decorators.ts`) for UUID path params — never a raw `@Param('id')`.
- Handlers must stay **thin**: `return this.xService.method(reqDto);` directly, no branching or business logic in the controller. Type the return as `Promise<XResDto>` or `Promise<OffsetPaginatedDto<XResDto>>`.
- `@Permissions()` / `@Roles()` are inert metadata — no guard currently reads them. Do not rely on them for actual authorization; if a route needs to be protected, use `@UseGuards(JwtAuthGuard)` (see `src/api/auth/guards/jwt-auth.guard.ts`).

## Services

- `@Injectable()`, inject the DB with `constructor(@Inject(DRIZZLE) private readonly db: Database)` (`DRIZZLE` token from `src/database/database.module.ts`, `Database` type from `src/database/database.type.ts`).
- Read with the relational query API: `this.db.query.<table>.findMany({ where, limit, offset, orderBy })` / `.findFirst({ where, columns })`. Write with the builder API: `this.db.insert(table).values({...}).returning()`, `this.db.update(table).set({...}).where(...).returning()`.
- Fetch nested relations for a response DTO with `with: { relation: true }` (full related row) — don't hand-pick `columns` there. The response DTO's `@Exclude()`/`@Expose()` (`.claude/rules/dto.md`) is what actually restricts the serialized shape, so mirroring a column list at the query layer is redundant and drifts out of sync as the DTO changes. This is different from `columns` on a root existence-check query (e.g. `ensureXExists`), which legitimately narrows to `{ id: true }` since there's no DTO involved.
- Always map entities to response DTOs with `plainToInstance(XResDto, entity, { excludeExtraneousValues: true })` — never return a raw Drizzle row from a service method that a controller exposes.
- After create/update, re-fetch the row by id (e.g. a `getXDetail(id)` helper) and map that — don't map the raw `.returning()` result directly.
- Factor existence/uniqueness checks into private helpers, named by which of the two they do — don't mix the two verbs:
  - `ensureXExists(id)` — the row (or a referenced FK row, e.g. `ensureUnitExists(unitId)`) must exist; throws 404 if not found. May return the found row when the caller needs it right after (e.g. to copy its fields), instead of re-fetching.
  - `validateXUniqueness(value, ignoredId?)` — `value` must not already be taken by another row; throws 409 if a conflicting row exists. When excluding the current row on update, filter with `and(eq(table.field, value), ne(table.id, ignoredId))`.
  - See `src/api/products/products.service.ts` for a service using both (`ensureUnitExists`, `ensureProductExists`, `validateCodeUniqueness`).
- Throw business errors with `throw new AppException(ErrorCode.Exxx, HttpStatus.XXX)` — see `.claude/rules/errors-pagination.md`.
- Configuration constants (e.g. bcrypt salt rounds) go on the class as `private static readonly NAME = value`.
