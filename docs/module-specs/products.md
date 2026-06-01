# Products Module Spec

## Purpose

The products module owns production master data: products, revisions, BOM tree, and routing steps.

Source:

```text
src/api/products/
```

## Current Status

Product CRUD, option, revision, and BOM tree/line endpoints are implemented. Routing endpoints are pending.

Implemented in this chunk:

- Nest module/controller/service/spec scaffold.
- AppModule wiring.
- Product permission codes and RBAC seed entries for read/create/update/delete.
- Product CRUD endpoints.
- Product/unit/type/operation option endpoints.
- Product revision list/create/update endpoints.
- BOM tree endpoint.
- BOM line create/update/delete endpoints.
- Product `clientId` schema link.
- Unique indexes for product code and product revision number per product.

Pending implementation:

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

Revision endpoint rules:

- `GET /products/:productId/revisions` uses `products:read` and returns `ProductRevisionResDto[]`.
- `POST /products/:productId/revisions` uses `products:update` and accepts `CreateProductRevisionReqDto`.
- `PATCH /products/:productId/revisions/:revisionId` uses `products:update` and accepts `UpdateProductRevisionReqDto`.
- Product must exist and not be deleted.
- Revision must belong to the product and not be deleted for update.
- Revision number must be unique for the product.
- Creating a revision does not copy BOM/routing yet.

### BOM Endpoints

```text
GET    /products/:productId/revisions/:revisionId/bom-tree
POST   /products/:productId/revisions/:revisionId/bom-lines
PATCH  /products/:productId/revisions/:revisionId/bom-lines/:bomLineId
DELETE /products/:productId/revisions/:revisionId/bom-lines/:bomLineId
```

BOM endpoint rules:

- `GET /products/:productId/revisions/:revisionId/bom-tree` uses `products:read` and returns `BomTreeNodeResDto`.
- `POST /products/:productId/revisions/:revisionId/bom-lines` uses `products:bom-manage` and accepts `CreateBomLineReqDto`.
- `PATCH /products/:productId/revisions/:revisionId/bom-lines/:bomLineId` uses `products:bom-manage` and accepts `UpdateBomLineReqDto`.
- `DELETE /products/:productId/revisions/:revisionId/bom-lines/:bomLineId` uses `products:bom-manage` and soft-deletes the BOM line plus its descendant BOM lines.
- Product and revision must exist, and revision must belong to product.
- Parent item must exist and be FG/WIP.
- Parent item must be the root product or already attached in the same revision tree.
- Child item must exist and must not be the same item as parent.
- Unit must exist when creating or updating a BOM line.
- Service computes BOM `level`; clients must not send or trust it.
- Service rejects cycles before creating a BOM line.
- BOM tree root is the product. Child nodes are built from active `bomLines` for the selected revision.
- `hasRouting` is calculated from active `routingSteps` for the selected revision.

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
- `products:bom-manage`

Planned later:

- `products:lock`
- `products:copy`
- `products:routing-manage`

Planned endpoint mapping:

- List/detail/options: `products:read`.
- Create: `products:create`.
- Update/image: `products:update`.
- Delete: `products:delete`.
- BOM mutation: `products:bom-manage`.

Planned later:

- Lock: `products:lock`.
- Copy: `products:copy`.
- Routing: `products:routing-manage`.

Implementation note:

- Lock/copy/routing permissions are not seeded yet.
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
