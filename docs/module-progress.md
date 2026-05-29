# Module Progress

## Purpose

Track implementation status separately from module specs so AI agents and developers can quickly see what is done, pending, and blocked.

Update this file whenever an API module changes implementation progress.

## Status Values

- `Pending`: not started.
- `Partial`: usable slice exists, but module spec or core endpoints are missing.
- `In progress`: implementation is actively underway and has a module spec.
- `Implemented`: requested scope is complete; tests may still be expanded if noted.
- `Deprecated`: module or flow should no longer be used.

## Overview

| Module    | Source               | Spec                             | Status      | Summary                                                      |
| --------- | -------------------- | -------------------------------- | ----------- | ------------------------------------------------------------ |
| Auth      | `src/api/auth/`      | `docs/module-specs/auth.md`      | Implemented | Login, refresh, profile, JWT flow.                           |
| Users     | `src/api/users/`     | `docs/module-specs/users.md`     | Implemented | List/detail/create/update/change password.                   |
| Roles     | `src/api/roles/`     | Pending                          | Partial     | Role option list only. Create spec before expanding.         |
| Clients   | `src/api/clients/`   | Pending                          | Partial     | CRUD exists. Create spec before expanding.                   |
| Suppliers | `src/api/suppliers/` | `docs/module-specs/suppliers.md` | In progress | List/create/update/delete implemented. Detail/tests pending. |

## Auth

Status: `Implemented`

Done:

- Login endpoint.
- Refresh token endpoint.
- Current user endpoint.
- JWT auth integration.

Pending:

- Keep spec current when auth behavior changes.

## Users

Status: `Implemented`

Done:

- `GET /users` list endpoint.
- `GET /users/:userId` detail endpoint.
- `POST /users` create endpoint.
- `PATCH /users/:userId` update endpoint.
- `PATCH /users/:userId/password` change password endpoint.
- Role loading, email uniqueness checks, password hashing, and response DTO mapping.

Pending:

- `DELETE /users/:userId` endpoint, if user deletion is needed.
- Tests for list/detail/create/update/password change/duplicate email/missing user/inactive role.

## Roles

Status: `Partial`

Done:

- Role option list endpoint.
- Permission key migrated to `roles:manage`.

Pending:

- Create `docs/module-specs/roles.md` before expanding.
- Role create/update/delete endpoints, if needed.
- Role permission management endpoints, if needed.

## Clients

Status: `Partial`

Done:

- Client list/create/update/delete endpoints.
- Soft delete.
- Permission key migrated to `clients:manage`.

Pending:

- Create `docs/module-specs/clients.md` before expanding.
- Tests for client workflows.

## Suppliers

Status: `In progress`

Done:

- `GET /suppliers` list endpoint.
- `POST /suppliers` create endpoint.
- `PATCH /suppliers/:supplierId` update endpoint.
- `DELETE /suppliers/:supplierId` soft-delete endpoint.
- Pagination, keyword search, ordering, and soft-delete exclusion.
- Response DTO for supplier list rows.
- Permission guards using `suppliers:read`, `suppliers:create`, `suppliers:update`, and `suppliers:delete`.
- Module wired into `AppModule`.
- Frontend `/manage/suppliers` page with list/search/pagination/create/update/delete.

Pending:

- `GET /suppliers/:supplierId` detail endpoint.
- Tests for list/detail/create/update/delete.
