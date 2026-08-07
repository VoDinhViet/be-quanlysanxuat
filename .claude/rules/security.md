# Security Rules

Gom về một chỗ vì rải rác là cách những rule này bị bỏ sót. Cơ chế guard/permission thực sự hoạt động thế nào: `docs/domains/identity-access.md`.

## Route exposure

- MUST declare `@Permissions('resource:action')` on every non-public route.
- MUST NOT treat `@Permissions()` as enforced on an `@ApiPublic()` route — both guards skip public routes, so the decorator is inert there. ~8 routes across `clients`, `suppliers`, `operations` stack them this way; those endpoints are **fully unauthenticated**. MUST NOT "secure" one by adding a permission — remove `@ApiPublic()` instead, and confirm with the user first since it breaks existing callers. (`items`/`boms`/`bom-operations`/`routings` used to stack this way too — all switched to `@ApiAuth()` when `products`/`materials` merged into `items`, `docs/decisions/items-merge.md`, since the merge exposed material fields like `supplierId`/`minStock` that were previously behind auth.)
- MUST NOT make a new route `@ApiPublic()` unless it is a read-only master-data lookup; anything touching business data or user-specific data stays authenticated.

## Permission wiring

- MUST add any new permission string to `PERMISSION_CODES` (`src/constants/permission.constant.ts`) **and** grant it to the relevant roles in `src/database/seeds/credentials.seed.ts` — a code missing from either fails silently at runtime: the route then rejects everyone except a role holding `system:manage`.
- MUST NOT add a permission check that a role holding `system:manage` could not bypass — that permission is absolute by design, at both the guard and the service layer.

## Data exposure

- MUST NOT expose password hashes, tokens, refresh secrets, or any other secret on a response DTO.
- MUST NOT serve uploaded file bytes outside `GET /files/:id/download`. MUST NOT register `useStaticAssets` for the upload directory — static middleware sits on the raw Express adapter, so the global guards never see those requests (`docs/decisions/files-registry.md`).
- MUST review staged content for secrets before committing or pushing.
