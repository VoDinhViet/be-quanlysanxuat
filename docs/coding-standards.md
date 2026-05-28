# Coding Standards

## 1. Goals

- Make code easy to read, review, test, and change.
- Prefer explicit business intent over clever implementation.
- Keep APIs predictable for frontend and other consumers.
- Keep NestJS layers separated: controller, service, repository, DTO, guard.
- Use TypeScript strictly so bugs are caught before runtime.
- Follow existing project conventions before adding new patterns.

## 2. Naming

File and folder names:

- Use kebab-case.
- Use feature/business names, not vague technical names.
- DTO files must end with `.req.dto.ts` or `.res.dto.ts`.

Good:

```text
users.service.ts
create-user.req.dto.ts
sales-orders.controller.ts
role-permissions.ts
```

Bad:

```text
UserService.ts
data.dto.ts
handler.ts
common-file.ts
```

Class names:

- Use PascalCase.
- Suffix classes by role when useful: `Controller`, `Service`, `Module`, `Guard`, `ReqDto`, `ResDto`.

Good:

```ts
export class UsersService {}
export class CreateUserReqDto {}
export class UserResDto {}
```

Function and method names:

- Use camelCase.
- Start with a verb that describes the business action.
- Use business terms from the domain.
- Make the name readable as a short action sentence: verb + business object + optional context.
- Include enough meaning so readers know what the method does without opening its body.
- Prefer precise names over short names. Short is good only when it is still clear.
- Avoid filler words such as `handle`, `process`, `execute`, `run`, `do`, `thing`, `data`, and `stuff`.
- Avoid hiding side effects. A method that writes data should use a write verb such as `create`, `update`, `delete`, `assign`, or `approve`.

Good:

```text
createUser
getUserDetail
approveOrder
cancelPurchaseOrder
ensureEmailAvailable
canApproveSalesOrder
```

Bad:

```text
doStuff
handleThing
processData
check
run
execute
```

Name shape:

```text
<verb><BusinessObject><Context?>
```

Examples:

```text
createUser
getUserDetail
findActiveRole
ensureEmailAvailable
assignPermissionToRole
calculateOrderTotal
approvePurchaseOrder
syncInventoryStock
```

Rename unclear names:

```text
handleLogin -> login
processUser -> createUser / updateUser / disableUser
checkEmail -> ensureEmailAvailable / isEmailTaken
getData -> getUsers / getUserDetail
updateStatus -> activateUser / deactivateUser / approveOrder
```

Boolean names:

- Use `is`, `has`, `can`, or `should` prefix.

Good:

```ts
const isActive = user.status === UserStatus.Active;
const hasPermission = permissionCodes.includes('system.manage');
const canApproveOrder = order.status === OrderStatus.Pending;
const shouldHashPassword = Boolean(reqDto.password);
```

Constants:

- Use UPPER_SNAKE_CASE for module-level constants.
- Use `private static readonly` for class constants.

Good:

```ts
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

private static readonly PASSWORD_SALT_ROUNDS = 10;
```

Identifiers:

- Use entity-specific IDs: `userId`, `roleId`, `salesOrderId`.
- Avoid bare `id` outside tiny local scopes.
- Route params must be entity-specific: `:userId`, `:roleId`.
- Use plural names for collections: `users`, `roles`, `permissionCodes`.
- Use `reqDto` for a single request DTO parameter.

## 3. TypeScript

Strictness:

- Keep `strict` mode enabled.
- Do not use `any`.
- Use `unknown` when the type is truly unknown, then narrow it before use.
- Prefer exact domain types, DTOs, and inferred Drizzle types over broad objects.

Return types:

- Add explicit return types for exported functions, controller methods, service methods, repository methods, guards, factories, and public class methods.
- Small private callbacks may rely on inference when the type is obvious.

Good:

```ts
async getUserDetail(userId: string): Promise<UserResDto> {
  return this.usersService.getUserDetail(userId);
}
```

Bad:

```ts
async getUserDetail(userId) {
  return this.usersService.getUserDetail(userId);
}
```

Variables:

- Prefer `const`.
- Use `let` only when the variable is reassigned.
- Never use `var`.
- Mark constructor-injected dependencies as `private readonly`.
- Use `readonly` for properties that should not be reassigned after construction.

Good:

```ts
constructor(@Inject(DRIZZLE) private readonly db: Database) {}

const userStatus = reqDto.status ?? UserStatus.Active;
```

Null and undefined:

- Use `null` only when it is an intentional API/database value.
- Use `undefined` for omitted optional fields.
- Check nullable values before dereferencing.
- Do not silence nullability errors with non-null assertions unless the invariant is guaranteed nearby.

Types and interfaces:

- Use `type` for unions, mapped types, and function shapes.
- Use `interface` when describing object contracts intended for extension.
- Prefer named types over repeated inline object types when reused.
- Avoid `object`, `{}`, and `Record<string, unknown>` unless the shape is truly dynamic.

Imports:

- Use `import type` for type-only imports.
- Remove unused imports.
- Prefer local project helpers and decorators over reimplementing logic.
- Keep imports consistent with nearby files.

## 4. Methods

Method design:

- One method should do one clear job.
- Keep methods short enough to review comfortably.
- Extract a helper only when it removes meaningful duplication or clarifies complex logic.
- Private helpers should describe intent, not implementation detail.
- Avoid generic names such as `handle`, `process`, `execute`, `run`, `manage`, and `do`.
- Framework callback names are allowed when the framework expects them.
- Method names must reveal intent, not implementation. Prefer `ensureActiveRole` over `queryRoleAndThrow`.
- Use the result shape in the name only when it clarifies behavior, for example `getUserDetail` versus `getUsers`.
- Do not use overloaded vague names for different behaviors. Split them into clear methods such as `approveOrder` and `rejectOrder`.
- If a method name needs `and`, it may be doing too much. Split it unless the two actions are one business operation.

Read methods:

- Use `get`, `find`, `list`, `search`, or `exists`.
- Use `get<ResourcePlural>` for list endpoints.
- Use `get<Resource>Detail` for detail endpoints.

Good:

```text
getUsers
getUserDetail
findActiveRole
existsByEmail
searchSalesOrders
```

Write methods:

- Use `create`, `update`, `delete`, `disable`, `enable`, `approve`, `reject`, `assign`, `unassign`, `calculate`, or `sync`.

Good:

```text
createUser
updateUser
changeUserPassword
assignRoleToUser
approvePurchaseOrder
```

Validation methods:

- Use `ensure`, `validate`, `assert`, `can`, `has`, or `is`.
- `ensure*` methods should throw an expected business error when the rule fails.
- `can*`, `has*`, and `is*` methods should return boolean.

Good:

```ts
private async ensureEmailAvailable(email: string, ignoredUserId?: string): Promise<void> {}
private async canApproveOrder(userId: string, orderId: string): Promise<boolean> {}
```

Bad:

```ts
private async check(email: string): Promise<void> {}
private async processData(data: unknown): Promise<unknown> {}
```

## 5. NestJS Layer Standards

Controller:

- Define routes and Swagger metadata.
- Accept DTOs, params, queries, and authenticated user payloads.
- Call one service method and return the result.
- Do not access Drizzle, Redis, external clients, or files directly.
- Do not contain business logic.
- Use `@ApiPublic(...)` for public endpoints.
- Use `@ApiAuth(...)` for protected endpoints.
- Use `@Permissions('permission.code')` for business permissions.
- Use `@UUIDParam('entityId')` for UUID route params.

Service:

- Own business logic and orchestration.
- Own Drizzle queries until a repository is introduced.
- Use repositories only when database logic becomes complex or reused.
- Use `AppException` for expected business/API errors.
- Hash passwords before storage.
- Never return secrets, tokens, password hashes, or connection strings.
- Map database rows to response DTOs.

Repository:

- Optional.
- Own database reads/writes only.
- Return database rows or persistence-focused models.
- Do not contain route decorators, request validation, response DTO mapping, or authorization rules.
- Do not replace services as the business layer.

DTO:

- Request DTOs validate API input.
- Response DTOs shape public output.
- Use field decorators from `src/decorators/field.decorators.ts`.
- Response DTOs must use `@Exclude()` and `@Expose()`.
- Do not expose password, hash, token, secret, connection string, or internal-only fields.

Guard:

- Own authentication and permission checks.
- Do not implement business workflows.
- Prefer metadata decorators such as `@Permissions(...)` over hard-coded controller logic.

Module:

- Register controllers and providers only for that module.
- Export only stable services needed by other modules.
- Avoid circular dependencies.
- Prefer service-to-service communication; never import controllers from other modules.

## 6. DTO And API Standards

Request DTO example:

```ts
export class LoginReqDto {
  @EmailField({ description: 'Email address' })
  email!: string;

  @PasswordField({ description: 'Password' })
  password!: string;
}
```

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

Rules:

- Use `PageOptionsDto` for offset pagination input.
- Use `OffsetPaginatedDto<T>` for paginated responses.
- Single-resource endpoints return response DTO objects directly.
- Dynamic sorting must use a whitelist of allowed fields.
- Do not pass raw client-provided table names, column names, SQL, or sort fields into Drizzle.

## 7. Error Handling

- Use `AppException` for expected business/API errors.
- Add new values to `src/constants/error-code.constant.ts` before using new business errors.
- Let `GlobalExceptionFilter` normalize unexpected errors.
- Do not leak internal error details to clients.
- Do not catch errors only to rethrow the same error.
- Catch errors only when adding meaningful business handling, cleanup, or normalization.

Good:

```ts
if (!user) {
  throw new AppException(ErrorCode.E002, HttpStatus.NOT_FOUND);
}
```

Bad:

```ts
throw new Error('User not found');
```

## 8. Database And Drizzle

- Use Drizzle schemas from `src/database/schemas/`.
- Export schemas and relations through `src/database/schemas/index.ts`.
- Import query operators from `drizzle-orm`.
- Use `eq`, `and`, `or`, `ilike`, `inArray`, `asc`, `desc`, and other typed operators instead of raw predicates.
- Use `.returning()` for PostgreSQL inserts/updates when the changed row is needed.
- Set `updatedAt` explicitly on updates.
- Use `db.transaction(...)` for multi-step writes.
- Use relational queries only when `relations()` are declared for the involved tables.
- Do not run migrations without explicit user approval.
- Never use `drizzle-kit push` in production or shared environments.

Good:

```ts
const [entities, count] = await Promise.all([
  this.db.query.users.findMany({
    where,
    with: {
      role: true,
    },
    limit: pageOptions.limit,
    offset: pageOptions.offset,
    orderBy,
  }),
  this.db.select({ total: count() }).from(users).where(where),
]);
```

Bad:

```ts
const sortColumn = req.query.sort as string;
await db.execute(`select * from users order by ${sortColumn}`);
```

## 9. Security-Sensitive Code

- Never log or return secrets, tokens, passwords, password hashes, private keys, or connection strings.
- Validate all client input through DTOs, params, and pipes.
- Do not trust calculated values from clients.
- Hash passwords before storage.
- Keep permission checks in guards/decorators/services, not scattered controller conditionals.
- Prefer whitelisted values over free-form client input.

## 10. Comments

- Prefer clear names and simple code over comments.
- Add comments only for non-obvious business rules, edge cases, or complex technical constraints.
- Do not add comments that repeat the code.

Good:

```ts
// System roles cannot be disabled because seeded permissions depend on them.
if (role.isSystem) {
  throw new AppException(ErrorCode.E005, HttpStatus.BAD_REQUEST);
}
```

Bad:

```ts
// Set user status
user.status = UserStatus.Active;
```

## 11. Verification

- Run the smallest useful verification after code changes.
- Run targeted tests when logic changes or tests are added.
- Run `pnpm.cmd run build` when changing modules, controllers, services, guards, decorators, schemas, shared constants, or dependency wiring.
- Do not build after docs-only changes unless asked.
- Report exact commands run and whether they passed.

## 12. Review Checklist

Before finishing a code change, check:

- Names express business meaning.
- Public methods have explicit return types.
- No `any` was added.
- Nullable values are handled.
- Controllers have no business/database logic.
- Services own business decisions.
- DTOs validate input and hide sensitive output.
- Dynamic sort/filter fields are whitelisted.
- Drizzle operators come from `drizzle-orm`.
- Multi-step writes use transactions.
- Expected business errors use `AppException`.
- Tests or build were run when the change requires them.

## References

- TypeScript Handbook: strict mode, `noImplicitAny`, and `strictNullChecks`: https://www.typescriptlang.org/docs/handbook/2/basic-types.html
- TypeScript Handbook: `const` declarations and `readonly`: https://www.typescriptlang.org/docs/handbook/variable-declarations.html
- typescript-eslint `no-explicit-any`: https://typescript-eslint.io/rules/no-explicit-any/
- typescript-eslint `explicit-function-return-type`: https://typescript-eslint.io/rules/explicit-function-return-type/
- ESLint `prefer-const`: https://eslint.org/docs/latest/rules/prefer-const
- NestJS Controllers: https://docs.nestjs.com/controllers
- NestJS Providers: https://docs.nestjs.com/components
- NestJS Modules: https://docs.nestjs.com/modules
- NestJS Pipes and ValidationPipe: https://docs.nestjs.com/pipes
