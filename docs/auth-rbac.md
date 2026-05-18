# Auth And RBAC Rules

- All APIs require JWT by default unless marked public.
- Public endpoints must use `@ApiPublic(...)`.
- Business endpoints should use `@Permissions(...)`.
- Do not hard-code role checks in controllers when permissions can express the rule.
- Admin/system access should be represented by `system.manage`.
- `GET /auth/me` should return the current user, role, and permission codes for frontend authorization.

## Permission Naming

Permission code format:

```text
<domain>.<resource>.<action>
```

Examples:

```text
system.manage
employee.create
employee.update
employee.delete
sales.order.manage
sales.order.approve
warehouse.receipt.create
warehouse.receipt.approve
```

Rules:

- Use lowercase permission codes.
- Separate segments with dots.
- Use snake_case only inside a segment when needed, for example `purchase_order`.
- Do not use spaces, camelCase, PascalCase, or hyphens.
- Keep permission codes stable after release.
- Do not rename a permission code if FE may already depend on it; add a new code and deprecate the old one instead.

Recommended actions:

```text
list
view
create
update
delete
manage
approve
export
import
```

Action meaning:

- `list`: can list/search resources.
- `view`: can view detail.
- `create`: can create resources.
- `update`: can update resources.
- `delete`: can delete or disable resources.
- `manage`: broad create/update/list permission for a resource.
- `approve`: can approve/reject workflow documents.
- `export`: can export data.
- `import`: can import data.

Type definition:

```text
Permission codes are string literals typed by `PermissionCode`.
```

Examples:

```ts
@Permissions('employee.create')
@Permissions('sales.order.approve')
@Permissions('procurement.purchase_order.manage')
```

When adding a permission:

1. Add the string literal to `PermissionCode` in `src/constants/permission.constant.ts`.
2. Add seed data in `src/database/seeds/rbac.ts`.
3. Assign it to default roles.
4. Use it with `@Permissions('domain.resource.action')`.
5. Return it through `GET /auth/me` as a string code.

Never return or log:

- password hashes
- JWT secrets
- refresh secrets
- user tokens
- database connection strings
