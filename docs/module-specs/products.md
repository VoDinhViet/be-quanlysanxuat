# Products Module Spec

## Purpose

The products module owns production master data: products, revisions, BOM tree, and routing steps.

Source:

```text
src/api/products/
```

## Current Status

Product CRUD and option endpoints are implemented. Revision, BOM, and routing endpoints are pending.

Implemented in this chunk:

- Nest module/controller/service/spec scaffold.
- AppModule wiring.
- Product permission codes and RBAC seed entries for read/create/update/delete.
- Product CRUD endpoints.
- Product/unit/type/operation option endpoints.
- Product `clientId` schema link.
- Unique indexes for product code and product revision number per product.

Pending implementation:

- Product revision endpoints.
- BOM tree and BOM line endpoints.
- Routing endpoints.
- Product database migration review for optional `bomLines.sortOrder`.

## Planned Public API

### Product Endpoints

```text
GET    /products
POST   /products
GET    /products/:productId
PATCH  /products/:productId
DELETE /products/:productId
```

Pending:

```text
PATCH  /products/:productId/lock
POST   /products/:productId/copy
```

### GET /products

Permission: `products:read`.

Query DTO: `GetProductsReqDto`.

Query fields: `q`, `clientId`, `itemType`, `status`, `page`, `limit`, `order`.

Response DTO: `OffsetPaginatedDto<ProductResDto>`.

Business rules:

- Soft-deleted products are excluded.
- Keyword searches product code and name.
- Sort order currently applies to `createdAt`.

### POST /products

Permission: `products:create`.

Request DTO: `CreateProductReqDto`.

Request fields: `clientId`, `code`, `name`, `itemType`, `unitId`, `revisionNo`, `imageUrl`, `note`.

Response DTO: `ProductResDto`.

Business rules:

- Product code must be unique globally.
- Unit must exist and not be deleted.
- Client must exist and not be deleted when provided.
- Product and initial revision are created in one transaction.

### GET /products/:productId

Permission: `products:read`.

Response DTO: `ProductResDto`.

Business rules:

- Product must exist and not be deleted.

### PATCH /products/:productId

Permission: `products:update`.

Request DTO: `UpdateProductReqDto`.

Business rules:

- Product must exist and not be deleted.
- New code must be unique globally.
- Unit must exist and not be deleted when provided.
- Client must exist and not be deleted when provided.

### DELETE /products/:productId

Permission: `products:delete`.

Response DTO: `ProductResDto`.

Business rules:

- Product must exist and not be deleted.
- Endpoint soft-deletes the product.

### Lookup Endpoints

```text
GET /products/options
GET /products/units/options
GET /products/types/options
GET /products/operations/options
```

Permission: `products:read`.

Response DTO: `ProductOptionResDto[]`.

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

Planned permission codes:

- `products:read`
- `products:create`
- `products:update`
- `products:delete`

Planned later:

- `products:lock`
- `products:copy`
- `products:bom-manage`
- `products:routing-manage`

Planned endpoint mapping:

- List/detail/options: `products:read`.
- Create: `products:create`.
- Update/image: `products:update`.
- Delete: `products:delete`.

Planned later:

- Lock: `products:lock`.
- Copy: `products:copy`.
- BOM: `products:bom-manage`.
- Routing: `products:routing-manage`.

Implementation note:

- Lock/copy/BOM/routing permissions are not seeded yet.
- Add remaining permission codes and RBAC seed entries only when the matching endpoints are implemented.

## Dependencies

- Drizzle database client through `DRIZZLE`.
- `products`, `productRevisions`, `bomLines`, `routingSteps`, `operations`, and `units` schemas.
- `clients` schema through nullable `products.clientId`.
- `suppliers` schema for outsource routing default supplier.
- RBAC permissions through global `RolesGuard`.

## Database Rules

- Product code is unique globally.
- Revision number is unique per product.
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
- Keep this module spec current when products implementation behavior changes.
- Update `docs/system-flow.md` when products become part of job/material calculation flow.
- Add or update focused Jest/Supertest cases following `docs/standards/testing-standards.md`.
