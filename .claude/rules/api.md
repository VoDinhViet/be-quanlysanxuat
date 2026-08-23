# API Layer Rules (Controller + DTO)

Biên HTTP: cái gì vào, cái gì ra, ai được gọi. Reference: `src/api/users/users.controller.ts`, `src/api/users/dto/`.

## Controllers

- MUST decorate the class with `@ApiTags('X')` + `@Controller('x')`.
- MUST decorate every handler with `@ApiAuth({...})` or `@ApiPublic({...})` (`src/decorators/http.decorators.ts`). MUST NOT hand-roll `@ApiOkResponse`/`@ApiResponse`.
- MUST use `@UUIDParam('id')` for UUID path params. MUST NOT use a raw `@Param('id')`.
- MUST keep handlers thin — `return this.xService.method(reqDto);`. MUST NOT put branching or business logic in a controller.
- MUST follow `.claude/rules/security.md` for `@Permissions`/`@ApiPublic` on every route.

## DTOs

- MUST use only the composite field decorators from `src/decorators/field.decorators.ts` (`StringField`, `NumberField`, `EmailField`, `PasswordField`, `UUIDField`, `DateField`, `BooleanField`, `EnumField`, `ClassField`, `TokenField`, `URLField`, each with an `*Optional` variant). MUST NOT hand-wire `class-validator` + `@ApiProperty`.
- MUST pass enums as a thunk: `@EnumField(() => UserStatus)`, never `@EnumField(UserStatus)`.
- MUST describe a field via the decorator's `description` option. MUST NOT write a `/** */` doc comment on a DTO — neither the class nor a property (`.claude/rules/documentation.md`, Code comments).
- MUST use `@Expose() @FileField('<relationKey>', '<description>')` (`src/api/files/dto/file.field.ts`) for a `files` relation renamed on the DTO (`imageFile` → `image`). A list-of-files property whose key already matches its relation only needs `@ClassField(() => FileResDto)`.
- MUST declare optional+nullable fields as `@StringFieldOptional({ nullable: true })` with type `T | null` and a `?` modifier.
- MUST name files `*.req.dto.ts` / `*.res.dto.ts`.
- Request DTOs: MUST be plain classes with `!`/`?` fields. MUST NOT carry `@Expose()`/`@Exclude()`.
- Response DTOs: MUST annotate the class `@Exclude()` and **every** exposed property `@Expose()` — a property missing `@Expose()` silently disappears from the API response.
- List request DTOs MUST `extends PageOptionsDto` and only add extra filter fields, declared `readonly`. MUST NOT reimplement `limit`/`page`/`q`/`order`/`offset`.
- MUST name a list filter's date range `startDate` / `endDate`. When one list DTO carries two or more ranges, qualify the subject and keep that suffix pair — `neededStartDate`/`neededEndDate`, `createdStartDate`/`createdEndDate` (`GetPurchaseLedgerReqDto`). MUST NOT use `fromDate`/`toDate` or `xDateFrom`/`xDateTo`. A single point-in-time param is not a range and keeps its own name (`asOfDate`, `neededDate`).

### Response DTO layering

- MUST design a resource's response DTO as **two independent classes** once a resource has both a
  list route and a detail route: `XResDto` (the detail shape — every column + every relation the
  detail view needs) and `PageXResDto` (the list shape — every column + every relation the list view
  needs). Neither `extends` the other — declare each class's own fields directly on it, even where
  that duplicates a field declaration between the two (e.g. both need `department`, so both declare
  it). `XResDto` is also what `createX`/`updateX` map to, since those re-fetch and return the full
  entity (`.claude/rules/service.md`, Responses). Reference: `src/api/purchase-requests/dto/`
  (`PurchaseRequestResDto` = detail, `PagePurchaseRequestResDto` = list).
- A separate `XBaseResDto` (only `X`'s own table columns, no relation) is a **different, orthogonal**
  axis from the list/detail split above — keep one only when another module reuses that exact
  bare-column shape (`OrderBaseResDto` read by `production-orders`/`production-jobs`,
  `ClientBaseResDto` read by `production-jobs`). `XResDto` and `PageXResDto` MAY both `extends` the
  same `XBaseResDto` for that reason — that shared ancestor is not the inheritance the bullet above
  forbids; it only forbids `PageXResDto extends XResDto` (or the reverse). MUST NOT add an
  `XBaseResDto` with a single consumer — put the columns directly on `XResDto`/`PageXResDto` instead.
- MUST NOT put a raw FK id (`xFileId`, `xGroupId`) on any response DTO layer — the relation replaces
  it.
- `XRefResDto` (the nested-elsewhere representation, `id` + `code` + `name`/`fullName`) MAY
  `extends PickType(XResDto, [...] as const) {}` — picking from the **detail** shape `XResDto`
  (`@nestjs/swagger`'s `PickType`, not `@nestjs/mapped-types` directly — only the former also
  re-applies `@ApiProperty`) instead of hand-declaring each field — it correctly carries over
  validation, `@Expose()`, and Swagger metadata for the picked keys, regardless of what other
  relations sit on the source class. Redeclare an individual field in the subclass body (`@Expose()`
  + the field decorator) only when its Ref-facing `description` must read differently from the
  source's. Reference: `src/api/users/dto/user-ref.res.dto.ts`.
