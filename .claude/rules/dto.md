# DTO Rules

Reference: `src/api/users/dto/create-user.req.dto.ts`, `user.res.dto.ts`, `get-users.req.dto.ts`.

- MUST use only the composite field decorators from `src/decorators/field.decorators.ts` (`StringField`, `NumberField`, `EmailField`, `PasswordField`, `UUIDField`, `DateField`, `BooleanField`, `EnumField`, `ClassField`, `TokenField`, `URLField`, each with an `*Optional` variant). MUST NOT hand-wire `class-validator` + `@ApiProperty`.
- MUST pass enums as a thunk: `@EnumField(() => UserStatus)`, never `@EnumField(UserStatus)`.
- MUST describe a field via the decorator's `description` option. MUST NOT write a `/** */` comment above a DTO property.
- MUST use `@Expose() @FileField('<relationKey>', '<description>')` (`src/api/files/dto/file.field.ts`) for a `files` relation renamed on the DTO (`imageFile` → `image`). A list-of-files property whose key already matches its relation only needs `@ClassField(() => FileResDto)`.
- MUST declare optional+nullable fields as `@StringFieldOptional({ nullable: true })` with type `T | null` and a `?` modifier.
- MUST name files `*.req.dto.ts` / `*.res.dto.ts`.
- Request DTOs: MUST be plain classes with `!`/`?` fields. MUST NOT carry `@Expose()`/`@Exclude()`.
- Response DTOs: MUST annotate the class `@Exclude()` and **every** exposed property `@Expose()` — a property missing `@Expose()` silently disappears from the API response.
- MUST NOT expose password hashes, tokens, refresh secrets, or any other secret on a response DTO.
- List request DTOs MUST `extends PageOptionsDto` and only add extra filter fields, declared `readonly`. MUST NOT reimplement `limit`/`page`/`q`/`order`/`offset`.
