# Products Module Spec

## Purpose

The products module owns production master data: products, revisions, BOM tree, and routing steps.

Source:

```text
src/api/products/
```

## Current Status

Scaffold only.

Implemented in this chunk:

- Nest module/controller/service/spec scaffold.
- AppModule wiring.
- Product permission codes and RBAC seed entries.

Pending implementation:

- Product CRUD and options endpoints.
- Product revision endpoints.
- BOM tree and BOM line endpoints.
- Routing endpoints.
- Product database migration review for `clientId`, unique indexes, and optional `sortOrder`.

## Planned Public API

### Product Endpoints

```text
GET    /products
POST   /products
GET    /products/:productId
PATCH  /products/:productId
PATCH  /products/:productId/lock
POST   /products/:productId/copy
DELETE /products/:productId
```

### Lookup Endpoints

```text
GET /products/options
GET /products/units/options
GET /products/types/options
GET /products/operations/options
```

### Revision Endpoints

```text
GET   /products/:productId/revisions
POST  /products/:productId/revisions
PATCH /products/:productId/revisions/:revisionId
```

### BOM Endpoints

```text
GET    /products/:productId/revisions/:revisionId/bom-tree
POST   /products/:productId/revisions/:revisionId/bom-lines
PATCH  /products/:productId/revisions/:revisionId/bom-lines/:bomLineId
DELETE /products/:productId/revisions/:revisionId/bom-lines/:bomLineId
```

### Routing Endpoints

```text
GET /products/:productId/revisions/:revisionId/items/:itemId/routing
PUT /products/:productId/revisions/:revisionId/items/:itemId/routing
```

## Permissions

Permission codes:

- `products:read`
- `products:create`
- `products:update`
- `products:delete`
- `products:lock`
- `products:copy`
- `products:bom-manage`
- `products:routing-manage`

Planned endpoint mapping:

- List/detail/options: `products:read`.
- Create: `products:create`.
- Update/image: `products:update`.
- Delete: `products:delete`.
- Lock: `products:lock`.
- Copy: `products:copy`.
- BOM: `products:bom-manage`.
- Routing: `products:routing-manage`.

## Dependencies

- Drizzle database client through `DRIZZLE`.
- `products`, `productRevisions`, `bomLines`, `routingSteps`, `operations`, and `units` schemas.
- `clients` schema after `products.clientId` is added.
- `suppliers` schema for outsource routing default supplier.
- RBAC permissions through global `RolesGuard`.

## Database Rules

- Product code must be unique by the final chosen scope.
- Revision number must be unique per product.
- BOM and routing are revision-scoped.
- FG/WIP may have routing.
- RM/Consumable must not have routing.
- FG/WIP may be BOM parent nodes.
- Prevent BOM self-parent and cycles.
- Locking a product or revision prevents product, BOM, and routing mutations.
- Delete should soft-delete product records and reject unsafe deletion once order/job dependencies exist.

## Security Rules

- Never expose internal file paths or storage secrets through image/file responses.
- Enforce permissions per endpoint.
- Validate all route params and request bodies.
- Whitelist list sorting fields.
- Do not trust BOM level or routing order from the client without service validation.

## Change Checklist

- Update this spec when endpoints, DTOs, permissions, database rules, or dependencies change.
- Update `docs/module-progress.md` when products implementation status changes.
- Update `docs/system-flow.md` when products become part of job/material calculation flow.
- Add or update focused Jest/Supertest cases following `docs/standards/testing-standards.md`.
