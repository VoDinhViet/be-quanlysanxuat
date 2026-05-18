# Coding Rules

## Naming Rules

- Files and folders: kebab-case.
- Classes: PascalCase.
- Variables/functions/properties: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Database tables/columns: snake_case.
- Request DTO files: `.req.dto.ts`.
- Response DTO files: `.res.dto.ts`.

Examples:

```text
sales-orders
CreateUserReqDto
UserResDto
userId
MAX_FILE_SIZE
sales_orders
approved_by_id
```

## Business Naming Rules

- Use business terms from the domain, not generic technical names when business meaning exists.
- Function names should start with a clear verb that describes the business action.
- Query/read functions should use `find`, `get`, `list`, `search`, or `exists`.
- Command/write functions should use `create`, `update`, `delete`, `disable`, `enable`, `approve`, `reject`, `assign`, `unassign`, `calculate`, or `sync`.
- Validation/check helper functions should use `ensure`, `validate`, `assert`, `can`, `has`, or `is`.
- Boolean variables and functions should read like true/false statements, for example `isActive`, `hasPermission`, `canApproveOrder`.
- Use entity identifiers with the entity name, for example `userId`, `roleId`, `salesOrderId`; avoid bare names like `id` outside route params or very small local scopes.
- Use collection names in plural form, for example `users`, `roles`, `permissionCodes`.
- Use `reqDto` for a single request DTO input in controller/service methods, for example `createUser(reqDto: CreateUserReqDto)`.
- Use specific DTO names only when a method receives multiple DTO-like inputs and `reqDto` would be ambiguous.
- Use business names for derived data, for example `userStatus`, `assignedRole`, `permissionCodes`.
- Avoid unclear abbreviations such as `usr`, `cfg`, `tmp`, `res`, `obj`, `val`, `arr`; common domain abbreviations are allowed only when established in the project, for example `dto`, `id`, `jwt`, `rbac`.
- Avoid names that only describe type or storage, for example `data`, `item`, `record`, `payload`, `result`; prefer `user`, `role`, `createdUser`, `updatedOrder`.
- Private helpers should describe intent, not implementation detail, for example `ensureEmailAvailable` instead of `checkEmail`.
- Do not include transport/framework terms in service method names unless they are the business concept; prefer `findOne` in controllers and `findUserById` or `findOne` in services depending on local module style.

Examples:

```ts
const userId = user.sub;
const permissionCodes = role.rolePermissions.map((item) => item.permission.code);

async function ensureEmailAvailable(email: string): Promise<void> {}
async function assignRoleToUser(userId: string, roleId: string): Promise<UserResDto> {}
async function canApproveSalesOrder(userId: string, salesOrderId: string): Promise<boolean> {}
```

## Nest CLI Generation Rules

- Use Nest CLI to create new modules, controllers, and services when starting a new API module.
- Prefer `pnpm.cmd nest generate module api/<module>` for modules.
- Prefer `pnpm.cmd nest generate controller api/<module> --no-spec` for controllers.
- Prefer `pnpm.cmd nest generate service api/<module> --no-spec` for services.
- Use kebab-case for generated module paths, for example `api/sales-orders`.
- After generation, adjust imports, DTO folders, decorators, and service logic to match project conventions.
- Do not keep generated boilerplate that does not fit the requested business behavior.
- Manual file creation is allowed for DTOs, types, schemas, tests, or small follow-up files that Nest CLI does not generate cleanly.

Example:

```bash
pnpm.cmd nest generate module api/users
pnpm.cmd nest generate controller api/users --no-spec
pnpm.cmd nest generate service api/users --no-spec
```

## Controller Rules

Use existing API decorators:

- `@ApiPublic(...)` for public endpoints.
- `@ApiAuth(...)` for authenticated endpoints.
- `@Permissions('permission.code')` for business permission checks.
- `@User()` for authenticated user payload.

Do not manually add `@ApiOkResponse`, `@ApiBearerAuth`, or `@HttpCode` when `ApiAuth`/`ApiPublic` already covers the endpoint.

Use permission string literals directly. They are type-checked by `PermissionCode`.

Example:

```ts
@Get('me')
@ApiAuth({
  type: MeResDto,
  summary: 'Get current account detail',
})
getMe(@User() user: JwtPayloadType): Promise<MeResDto> {
  return this.authService.getMe(user.sub);
}
```

## DTO Rules

Use field decorators from:

```text
src/decorators/field.decorators.ts
```

Common decorators:

```text
StringField / StringFieldOptional
EmailField / EmailFieldOptional
PasswordField / PasswordFieldOptional
NumberField / NumberFieldOptional
BooleanField / BooleanFieldOptional
UUIDField / UUIDFieldOptional
DateField / DateFieldOptional
EnumField / EnumFieldOptional
ClassField / ClassFieldOptional
TokenField
```

Request DTO example:

```ts
export class LoginReqDto {
  @EmailField({ description: 'Email address' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;
}
```

Response DTO rules:

- Use `@Exclude()` on response DTO classes.
- Use `@Expose()` on every returned field.
- Use `plainToInstance(..., { excludeExtraneousValues: true })` for mapping.
- Never expose passwords, hashes, secrets, or internal-only fields.

Response DTO example:

```ts
@Exclude()
export class UserResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @EmailField()
  email!: string;
}
```

Nullable fields:

```ts
@Expose()
@StringFieldOptional({ nullable: true })
description!: string | null;
```

Arrays:

```ts
@Expose()
@StringField({ each: true })
permissions!: string[];
```

Nested DTO:

```ts
@Expose()
@Type(() => RoleResDto)
@ClassFieldOptional(() => RoleResDto, { nullable: true })
role!: RoleResDto | null;
```
