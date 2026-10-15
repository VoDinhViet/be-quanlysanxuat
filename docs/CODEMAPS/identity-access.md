<!-- Generated: 2026-10-15 | Files scanned: 34 | Token estimate: ~2100 -->

# Identity & Access Codemap

Scope: `auth`, `users`, `roles`, `departments`, `positions`, the identity schemas, permission catalogue, decorators and global guards. Route counts verified: auth 3, users 9, roles 6, departments 5, positions 4 (27 total).

## 1 Modules

| Folder (`src/api/`) | Main files (wc -l) |
|---|---|
| auth/ | auth.controller.ts 45, auth.service.ts 282, permissions.service.ts 30, guards/jwt-auth.guard.ts 53, guards/permissions.guard.ts 81, types/jwt-payload.type.ts 9, config/auth.config.ts 35, auth.module.ts 30 |
| users/ | users.controller.ts 153, users.service.ts 730, users.export.ts 55, users.module.ts 14 |
| roles/ | roles.controller.ts 98, roles.service.ts 220, roles.module.ts 13 |
| departments/ | departments.controller.ts 88, departments.service.ts 224, departments.module.ts 11 |
| positions/ | positions.controller.ts 72, positions.service.ts 160, positions.module.ts 11 |

Shared code (wc -l):

- Schemas `src/database/schemas/`: `identity-access/credentials.ts` 73 (JWT subject), `identity-access/roles.ts` 42, `identity-access/users.ts` 112, `departments.ts` 22, `positions.ts` 38.
- `src/constants/permission.constant.ts` 567 (`PERMISSION_CODES` line 12, `SUPER_PERMISSION` line 108); `src/constants/error-code.constant.ts` 714.
- Decorators `src/decorators/`: `permissions.decorator.ts` 8, `public.decorator.ts` 17, `current-user.decorator.ts` 13, `http.decorators.ts` 142 (`ApiPublic` calls `Public()` at line 95).

## 2 Routes

Prefix: `/api` (`src/main.ts:51`), URI versioning on (`main.ts:57`). Permission "-" means JWT only.

**auth** (`auth.controller.ts`, controller path `auth`)

| Method path | Permission | Controller.method -> Service.method | Tables / stores |
|---|---|---|---|
| POST /auth/login | public | login -> AuthService.login (service:53) | credentials, users; Redis SESSION_HASH |
| POST /auth/refresh | public | refresh -> AuthService.refresh (service:96) | credentials, users; Redis SESSION_HASH |
| POST /auth/logout | JWT | logout -> AuthService.logout (service:151) | Redis SESSION_BLACKLIST, SESSION_HASH |

**users** (`users.controller.ts`)

| Method path | Permission | Controller.method -> Service.method | Tables |
|---|---|---|---|
| GET /users/me | JWT | getCurrentUser -> getCurrentUser (svc:212) | credentials, users, roles, files |
| GET /users/me/permissions | JWT | getCurrentPermissions -> getCurrentPermissions (svc:247) | credentials, roles |
| GET /users | users:update | getUsers -> getUsers (svc:73) | users, credentials, operation_assignments |
| GET /users/options | JWT only | getUserOptions -> getUserOptions (svc:193) | users (max 100) |
| GET /users/export | users:update | exportUsers -> exportUsers (svc:144) | users |
| GET /users/:userId | users:update | getUser -> getUser (svc:570) | users |
| POST /users | users:create | createUser -> createUser (svc:265) | users, credentials (tx) |
| PATCH /users/:userId | users:update | updateUser -> updateUser (svc:313) | users, credentials |
| PATCH /users/:userId/role | roles:update | assignRole -> assignRole (svc:429) | users, credentials, roles |

**roles** (`roles.controller.ts`)

| Method path | Permission | Controller.method -> Service.method | Tables |
|---|---|---|---|
| GET /roles | roles:read | getRoles -> getRoles (svc:67) | roles |
| GET /roles/permissions | roles:read | getPermissionCatalogue -> getPermissionCatalogue (svc:63) | none (in-memory catalogue) |
| GET /roles/:roleId | roles:read | getRole -> getRole (svc:89) | roles |
| POST /roles | roles:create | createRole -> createRole (svc:97) | roles |
| PATCH /roles/:roleId | roles:update | updateRole -> updateRole (svc:111) | roles |
| DELETE /roles/:roleId | roles:delete | deleteRole -> deleteRole (svc:134), soft delete | roles, credentials |

**departments** (`departments.controller.ts`)

| Method path | Permission | Controller.method -> Service.method | Tables |
|---|---|---|---|
| GET /departments | public (`@ApiPublic`) | getDepartments -> getDepartments (svc:49) | departments, positions, users (counts) |
| GET /departments/:departmentId | public | getDepartment -> getDepartment (svc:106) | departments, positions, users |
| POST /departments | departments:create | createDepartment -> createDepartment (svc:136) | departments |
| PATCH /departments/:departmentId | departments:update | updateDepartment -> updateDepartment (svc:161) | departments |
| DELETE /departments/:departmentId | departments:delete | deleteDepartment -> deleteDepartment (svc:202) | departments, positions, users |

**positions** (`positions.controller.ts`)

| Method path | Permission | Controller.method -> Service.method | Tables |
|---|---|---|---|
| GET /positions | public | getPositions -> getPositions (svc:32) | positions, users (counts) |
| POST /positions | positions:create | createPosition -> createPosition (svc:98) | positions, departments |
| PATCH /positions/:positionId | positions:update | updatePosition -> updatePosition (svc:110) | positions |
| DELETE /positions/:positionId | positions:delete | deletePosition -> deletePosition (svc:143) | positions, users |

## 3 Flows

Login and refresh (`auth.service.ts`):

```
POST /auth/login ── lower(username)=id OR email ── bcrypt compare
   └─ ensureCredentialEnabled (credentialEnabled, users.status RESIGNED -> E018)
   └─ createTokenPair: access JWT {sub=credentials.id, userId, username, email, sessionId}
                       refresh JWT {sessionId, hash}; Redis SESSION_HASH[sessionId]={credentialId, hash}
POST /auth/refresh ── verify refresh JWT (refresh secret)
   └─ Redis SESSION_HASH must match payload.hash, else 401
   └─ new pair with same sessionId and new hash (rotation)
POST /auth/logout ── Redis SESSION_BLACKLIST[sessionId] (TTL = access expiry), delete SESSION_HASH
```

Per-request check (global `APP_GUARD`, `src/app.module.ts:163-164`):

```
request -> JwtAuthGuard: @Public? skip : verifyAccessToken (signature + blacklist) -> request.user
        -> PermissionsGuard: @Public? skip : no @Permissions? pass
              : getPermissionCodes(user.sub) -> system:manage? pass
              : every required code present? else E033 (403)
```

Permission lookup: `PermissionsService.getPermissionCodes` (`src/api/auth/permissions.service.ts:17`) is one join `credentials -> roles` (`roles.deletedAt IS NULL`), returns `roles.permissions`. No cache in this file. Callers: PermissionsGuard, UsersService (lines 251, 482, 529), RolesService (214), FilesService (191), ReportsService (526), OperationAccessService, IntegrationOnBehalfGuard, IntegrationIdentityController.

Token shape: `JwtPayloadType` (`src/api/auth/types/jwt-payload.type.ts`): `sub` = credential id, `userId` = users.id, `username`, `email`, `sessionId`, plus `iat`/`exp`. `@CurrentUser()` returns this payload; use `payload.sub` for permission and credential lookups and `payload.userId` for business rows (as FilesController does).

## 4 Key rules

- **JWT `sub` is `credentials.id`**, not `users.id`. Business rows need `userId`. Permissions attach to the role on the credential (`credentials.roleId`, `credentials.ts:43`), not to the user.
- **Permission code format** `resource:action` (e.g. `roles:update`, `departments:delete`), catalogue in `permission.constant.ts:12`. `system:manage` (`SUPER_PERMISSION`, line 108) passes every check (`permissions.guard.ts:69`).
- Only controllers gate permissions; services that expose data to other callers must call `getPermissionCodes` themselves (see `api-conventions.md`).
- `GET /users` and its export need `users:update`; there is no `users:read` code.
- Role writes: granting `system:manage` requires the actor to hold it (E034; `roles.service.ts:205-218`, `users.service.ts:520-533`). System roles are read-only (E030); roles in use cannot be deleted (E029). Role delete is soft.
- Resigned users or disabled credentials are rejected at login and refresh with E018 (`auth.service.ts:222`).
- Config: `AUTH_JWT_SECRET`, `AUTH_REFRESH_SECRET` required; both TTLs default to `7d` (`auth.config.ts:30,33`).
- Error codes: E004 invalid credentials (401); E002 credential not found; E012 user not found; E001/E003 username/email taken; E005 user code taken; E013 id number taken; E032 user has no credential (400); E014 department not found; E015 position not found; E064 position not in department (400); E027 role not found; E028 role code taken; E029 role in use (409); E030 system role read-only; E031 invalid permission code (400); E033 forbidden; E034 elevation forbidden (403); E018 resigned or disabled.
- Discrepancy: the doc comment at `permissions.guard.ts:25` says permissions are "cached by PermissionsService". `getPermissionCodes` runs a DB query on every call. Unverified whether a cache sits elsewhere.
- Public reads: departments and positions list/detail are `@ApiPublic`, so no JWT is required (`departments.controller.ts:30,42`, `positions.controller.ts:29`). Confirm this is intended.
- Startup check: `RolesService.onModuleInit` (`roles.service.ts:45`) only logs unknown permission codes; it does not fail.
- Catalogue changes need a data migration: `PERMISSION_CODES` has 87 codes and role grants live in `roles.permissions` (jsonb), so a new or retired code does nothing until a migration edits the roles. `drizzle/0232_ncr_permissions_and_retire_codes.sql` grants `ncr:read` to `oqc:read` holders and `ncr:create/update` to `oqc:update` holders only (`oqc:create` is the production side's request-OQC permission, and `ncr:update` can create approved production orders; `ncr:approve`/`ncr:delete` are ticked by hand) and strips `qc-aql:*` and `inventory-requisitions:issue` from every role, soft-deleted ones included. The web app no longer validates codes against a hardcoded enum; `validatePermissionCodes` (E031) is the only gate.

## 5 Cross-domain links

- Files: avatar via `users.avatarFileId` (`users.service.ts` getCurrentUser); files uploads and deletes check `system:manage` in `src/api/files/files.service.ts:182`. See `integration.md`.
- Integration: `IntegrationOnBehalfGuard` (`src/api/integration/guards/integration-on-behalf.guard.ts`) reuses `PermissionsService` for the `X-On-Behalf-Of` credential id.
- Operations: `OperationAccessService` calls `getPermissionCodes` (`src/api/operations/operation-access.service.ts:32`).
- Production jobs: `UsersService.getUserDepartmentId` (`users.service.ts:593`) is used by `production-jobs.service.ts:849`.
- Redis: session keys `session_hash:%s`, `session_blacklist:%s` (`src/constants/cache.constant.ts`).
