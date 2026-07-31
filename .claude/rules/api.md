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
