# Feature: Authorization (Roles & Permissions)

## Goal

Add real authorization on top of the existing authentication (`docs/features/auth.md`). A **Hybrid RBAC** model: the set of permissions is a fixed catalogue defined in code, while **roles** (bundles of permissions) live in the DB and are managed at runtime by an admin. Every route is protected by default; a route declares the permission it needs and the guard enforces it against the logged-in user's role.

## Model & resolution

- **Permission** = a fixed `resource:action` code (e.g. `clients:create`). The full catalogue is `PERMISSION_CODES` in `src/constants/permission.constant.ts` — the only source of truth for what actions exist. Not editable at runtime.
- **Role** = a DB row (`roles` table) with a `code`, `name`, and a `permissions` array of permission codes. Admins create/edit roles and assign permissions to them via API.
- **Assignment** = a role is attached to a **`credentials`** row via `credentials.roleId` (nullable). The JWT `sub` is the credential id, so the guard resolves permissions straight from the token subject — no `users` row is required for a credential to have a role. "Assigning a role to a user" sets `roleId` on that user's linked credential.
- **One role per user.** Effective permissions = that role's `permissions` array.
- **Super permission**: a role holding `system:manage` passes **every** check (god-mode). The seeded **`ADMIN`** role (`isSystem: true`) holds it — seeded, along with 6 other business roles and one default account per role, by `pnpm db:seed:credentials` (see `.claude/rules/database.md` for the seeds convention).
- **Resolution per request** (no permissions baked into the token): `JWT.sub → credentials.roleId → roles.permissions[]`, cached in Redis two levels deep (`credential_role:<credId>`, `role_permissions:<roleId>`, TTL 300s). Editing a role clears `role_permissions:<roleId>`; reassigning a user's role clears `credential_role:<credId>` — so changes take effect within a request, not only on re-login.

## Enforcement (secure by default)

- `JwtAuthGuard` + `PermissionsGuard` are registered **globally** (`APP_GUARD` in `src/app.module.ts`), in that order.
- **Every route requires a valid session by default.** `@Public()` / `@ApiPublic()` (previously inert, now honoured) opts a route out of both auth and permission checks.
- A route with no `@Permissions(...)` only needs authentication. A route with `@Permissions('x:y')` also needs that permission (all listed codes required; `system:manage` bypasses).
- Public routes today: `POST /auth/login`, `POST /auth/refresh`, `GET /health`, `GET /`, and all master-data list endpoints + the `clients`/`products` read (GET) endpoints (still `@ApiPublic`). Everything else needs a token.

## Business rules (roles API)

- `code` is a stable identifier, unique among non-deleted roles, **uppercased** on input, and **not editable** after creation.
- `permissions[]` must be a subset of `PERMISSION_CODES` (validated server-side, `E031`).
- `isSystem` roles (e.g. Super Admin) are **read-only**: update and delete are refused (`E030`).
- **Escalation guard**: only a caller who already holds `system:manage` may create/update a role containing `system:manage`, or assign a role that grants `system:manage` (e.g. Super Admin) to a user — otherwise `E403`/`E034`. This stops a `roles:update`/`roles:create` holder from self-granting full control.
- Delete is a **soft delete** and is refused if any credential still references the role (`E029`) — reassign those users first.
- Roles list `q` matches `code`/`name`; results exclude soft-deleted rows.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/roles` | `roles:read` | `GetRolesReqDto` (paginated, `q`) | `200` + paginated `RoleResDto` |
| GET | `/roles/permissions` | `roles:read` | — | `200` + `PermissionGroupResDto[]` (catalogue grouped by resource) |
| GET | `/roles/:id` | `roles:read` | — | `200` + `RoleResDto` |
| POST | `/roles` | `roles:create` | `CreateRoleReqDto` (`code`, `name`, `description?`, `permissions[]`) | `201` + `RoleResDto` |
| PATCH | `/roles/:id` | `roles:update` | `UpdateRoleReqDto` (`name?`, `description?`, `permissions?`) | `200` + `RoleResDto` |
| DELETE | `/roles/:id` | `roles:delete` | — | `204 No Content` |
| PATCH | `/users/:userId/role` | `roles:update` | `AssignRoleReqDto` (`roleId`) | `200` + `UserResDto` |

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Role not found | `ErrorCode.E027` | 404 |
| Role code already taken | `ErrorCode.E028` | 409 |
| Delete a role still assigned to a credential | `ErrorCode.E029` | 409 |
| Modify/delete a system (`isSystem`) role | `ErrorCode.E030` | 403 |
| Permission code outside the catalogue | `ErrorCode.E031` | 400 |
| Assign a role to a user with no linked credential | `ErrorCode.E032` | 400 |
| Authenticated but missing the required permission | `ErrorCode.E033` | 403 |
| Non-super caller grants/assigns `system:manage` | `ErrorCode.E034` | 403 |
| No/invalid bearer token on a protected route | `UnauthorizedException` | 401 |

## Out of scope

- **Multiple roles per user** — one role per credential for now (no `user_roles` join).
- **Runtime-created permissions** — permission codes are code-defined; only roles are managed at runtime.
- **Per-record / row-level authorization** (e.g. "only your own clients") — checks are per-route only.
- Re-scoping which permission each existing route requires (the current `@Permissions` annotations are kept as-is; some reads still carry write-ish codes like `users:update`).

## Frontend integration notes

- **New (2026-07-21)**: `products:revisions-manage` was added to the catalogue (covers both "create a revision" and "activate/switch revision" — see `docs/features/product-revisions.md`) — `GET /roles/permissions` now returns this resource/action row. It is a fresh, distinct code from the still-dormant `products:bom-manage`/`products:routing-manage` named in the 2026-07-19 note below (those remain reserved for the not-yet-built BOM/routing feature). Reads on `/products/:productId/revisions*` reuse the existing `products:read`.
- **Breaking change (2026-07-20)**: the suppliers domain was removed. `GET|POST /suppliers`, `GET /suppliers/stats`, `PATCH|DELETE /suppliers/:id` and `GET /supplier-groups` are **gone** (404), and `suppliers:read`/`:create`/`:update`/`:delete` no longer appear in `GET /roles/permissions` — the role editor drops that resource row. A role still holding a `suppliers:*` code keeps it as dead data. The seeded `PURCHASING` (Mua hàng) role is now `['materials:read', 'products:read']`. Error codes `E019`–`E023` are retired (including `E023 country.error.not_found`, whose only throw site was in suppliers). `GET /countries` is deliberately **kept** as master data even though nothing references it now.
- **2026-07-20 (supersedes the removal note below)**: materials was rebuilt as a phase-1 module. `GET /materials`, `POST /materials` and `GET /material-groups` are live again, and `GET /roles/permissions` returns **`materials:read` and `materials:create`** — but **not** `materials:update` / `materials:delete`, which stay out of the catalogue until those routes exist. A role that still holds `materials:update`/`:delete` from before the removal keeps it as dead data. The seeded `WAREHOUSE` (Kho) role is back to `['materials:read', 'materials:create']`. Error codes `E035`, `E036`, `E037`, `E040` are live again with their original meanings; `E038`, `E039`, `E041` remain reserved. See `docs/features/materials.md`.
- ~~**Breaking change (2026-07-20)**: the materials domain was removed; all `/materials` and `/material-groups` endpoints returned 404 and the `materials:*` codes left the catalogue.~~ Reverted the same day by the note above — kept only so the intermediate state isn't a mystery.
- **Breaking change (2026-07-19)**: `roles:manage` was split into granular codes — `roles:read` (GET `/roles`, GET `/roles/permissions`, GET `/roles/:id`), `roles:create` (POST `/roles`), `roles:update` (PATCH `/roles/:id`, PATCH `/users/:userId/role`), `roles:delete` (DELETE `/roles/:id`). Any existing role in the DB holding `roles:manage` loses access to these routes until re-granted the matching new code(s) via the role editor. Several permission codes that were declared in the catalogue but never wired to a route were also removed entirely: `quotations:manage`, `clients:manage`, `suppliers:manage`, `purchase-orders:manage`, `purchase-orders:approve`, `warehouse-inventory:manage`, `warehouse-receipts:create`/`:approve`, `warehouse-issues:create`/`:approve`, `warehouse-returns:create`/`:approve`, `qc-stock-in-quality:approve`, `orders:create`/`:read`/`:read-production`/`:update`/`:delete`/`:approve`, `material-requests:create`/`:read`/`:approve`, `supplier-shortlists:create`, `products:lock`, `products:bom-manage`, `products:routing-manage`, `users:delete` — `GET /roles/permissions` no longer returns them, so the role editor UI will stop showing these resource/action rows. `system:manage` (superadmin) is unchanged.
- **Breaking change (2026-07-18)**: authorization is now enforced. Previously many routes were open (no guard); now **every route is protected by default** and the client must send `Authorization: Bearer <accessToken>`. Notably `GET /users` and `GET /users/:id` — which were reachable without a token — now require auth **and** the `users:update` permission. Public routes that stay open: auth login/refresh, health, root, and the master-data / `clients`/`products` GET reads.
- A `403` with `errorCode: "auth.error.forbidden"` (`E033`) means the user is authenticated but their role lacks the permission the route needs — render an "không đủ quyền" state, distinct from the `401` (not logged in) case.
- New admin surface: `GET /roles/permissions` returns the permission catalogue grouped by resource (`{ resource, permissions: [{ code, action }] }`) to build a role editor; CRUD roles at `/roles`; assign a role to a user with `PATCH /users/:userId/role` (`{ roleId }`).
- Permission/role changes take effect on the **next request** (cache is invalidated on edit/assign) — no forced re-login needed.
