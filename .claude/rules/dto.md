# DTO Rules

Reference implementation: `src/api/users/dto/create-user.req.dto.ts`, `src/api/users/dto/user.res.dto.ts`, `src/api/users/dto/get-users.req.dto.ts`.

- Only use the composite field decorators from `src/decorators/field.decorators.ts`: `StringField`/`StringFieldOptional`, `NumberField`/`NumberFieldOptional`, `EmailField`/`EmailFieldOptional`, `PasswordField`/`PasswordFieldOptional`, `UUIDField`/`UUIDFieldOptional`, `DateField`/`DateFieldOptional`, `BooleanField`/`BooleanFieldOptional`, `EnumField`/`EnumFieldOptional`, `ClassField`/`ClassFieldOptional`, `TokenField`, `URLField`/`URLFieldOptional`. Never wire up raw `class-validator` + `@ApiProperty` by hand — these decorators already bundle validation, transformation, and Swagger.
- Enum field decorators take a **thunk**: `@EnumField(() => UserStatus)`, not `@EnumField(UserStatus)`.
- For a **`files` relation whose column is renamed on the DTO** (e.g. `avatarFile` → `avatar`, `logoFile` → `logo`, `imageFile` → `image`), use `@Expose() @FileField('<relationKey>', '<description>')` from `src/api/files/dto/file.field.ts` instead of hand-wiring `@Transform(... toFileResDto ...)` + `@ClassFieldOptional(() => FileResDto)`. It bundles the rename+map transform (`toClassOnly`) with the nullable `FileResDto` shape. This one lives under `src/api/files/dto/` (not `field.decorators.ts`) on purpose — `FileResDto` imports from `field.decorators.ts`, so putting it there would be a circular import. List-of-files properties (`attachments`) don't need it: their relation key already matches the property, so a plain `@ClassField(() => FileResDto)` on the wrapper suffices.
- Optional + nullable fields: `@StringFieldOptional({ nullable: true })` with TS type `T | null` and a `?` modifier.
- File naming: `*.req.dto.ts` for request DTOs, `*.res.dto.ts` for response DTOs.
- **Request DTOs**: plain classes, fields use `!` (required) or `?` (optional). No `@Expose()`/`@Exclude()` needed.
- **Response DTOs**: annotate the class with `@Exclude()` and every property with `@Expose()`. Because services map with `plainToInstance(ResDto, entity, { excludeExtraneousValues: true })`, any property missing `@Expose()` silently disappears from the API response.
- Response DTOs must **never** expose password hashes, tokens, refresh secrets, or any other secret field.
- List request DTOs `extends PageOptionsDto` (`src/common/dto/offset-pagination/page-options.dto.ts`) and only add extra filter fields, declared `readonly`.
