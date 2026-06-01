# Products Module Spec

## Purpose

The products module owns production master data: products, revisions, BOM tree, and routing steps.

Source:

```text
src/api/products/
```

## Current Status

Product CRUD, lock/unlock, copy, option, revision, BOM tree/line, and routing endpoints are implemented.

Implemented in this chunk:

- Nest module/controller/service/spec scaffold.
- AppModule wiring.
- Product permission codes and RBAC seed entries for read/create/update/delete.
- Product CRUD endpoints.
- Product lock/unlock endpoints.
- Product copy endpoint.
- Product/unit/type/operation option endpoints.
- Product revision list/create/update endpoints.
- Product image upload/delete endpoints backed by `/uploads/products`.
- BOM tree endpoint.
- BOM line create/update/delete endpoints.
- Routing get/replace endpoints.
- Product `clientId` schema link.
- Unique indexes for product code and product revision number per product.
- `bomLines.sortOrder` schema field for stable tree-grid ordering.

## Planned Public API

### Product Endpoints

```text
GET    /products
POST   /products
GET    /products/:productId
PATCH  /products/:productId
PATCH  /products/:productId/lock
PATCH  /products/:productId/unlock
POST   /products/:productId/image
DELETE /products/:productId/image
POST   /products/:productId/copy
DELETE /products/:productId
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
- Product must not be locked.
- New code must be unique globally.
- Unit must exist and not be deleted when provided.
- Client must exist and not be deleted when provided.
- `locked` status must be set through `PATCH /products/:productId/lock`, not this generic update endpoint.

### PATCH /products/:productId/lock

Permission: `products:lock`.

Response DTO: `ProductResDto`.

Business rules:

- Product must exist and not be deleted.
- Endpoint sets product status to `locked`.
- Locked products reject product update, revision mutation, BOM mutation, and routing mutation.

### PATCH /products/:productId/unlock

Permission: `products:lock`.

Response DTO: `ProductResDto`.

Business rules:

- Product must exist and not be deleted.
- Endpoint restores product status to `active`.
- The system does not store the previous active/inactive status before lock, so unlock always returns the product to active.

### POST /products/:productId/copy

Permission: `products:copy`.

Request body: none.

Response DTO: `ProductResDto`.

Business rules:

- Source product must exist and not be deleted.
- Source product must have a current revision.
- Service creates a new active product with copied client, item type, unit, image URL, and note.
- Service generates a globally unique product code from the source code using the `-COPY` suffix.
- Service copies the source product's current revision number and note.
- Service copies active BOM lines and active routing steps from the source revision into the new revision.
- Root product references in copied BOM/routing are mapped to the new product. Child item references are reused.

### DELETE /products/:productId

Permission: `products:delete`.

Response DTO: `ProductResDto`.

Business rules:

- Product must exist and not be deleted.
- Endpoint soft-deletes the product.

### Product Image Endpoints

```text
POST   /products/:productId/image
DELETE /products/:productId/image
```

Permission: `products:update`.

`POST /products/:productId/image` request: multipart form-data with one `image` file.

Response DTO: `ProductResDto`.

Business rules:

- Product must exist and not be deleted.
- Product must not be locked.
- Only `image/jpeg`, `image/png`, `image/webp`, and `image/gif` are accepted.
- Maximum image size is 5 MB.
- Uploaded files are stored under `/uploads/products`.
- The product `imageUrl` is updated to the public `/uploads/products/<file>` URL.
- Existing active product file records are soft-deleted when a new image is uploaded.
- `DELETE /products/:productId/image` clears `imageUrl`, soft-deletes active product file records, and removes local files on a best-effort basis.

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
- Creating a revision can copy active BOM lines and routing steps from `copyFromRevisionId` when provided.
- `copyFromRevisionId` must belong to the same product and must not be deleted.

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
- Service defaults BOM `sortOrder` to the next sibling order when clients omit it.
- `sortOrder` can be supplied on BOM line create/update to keep tree-grid display order stable.
- Service rejects cycles before creating a BOM line.
- BOM tree root is the product. Child nodes are built from active `bomLines` for the selected revision.
- `hasRouting` is calculated from active `routingSteps` for the selected revision.

### Routing Endpoints

```text
GET /products/:productId/revisions/:revisionId/items/:itemId/routing
PUT /products/:productId/revisions/:revisionId/items/:itemId/routing
```

Routing endpoint rules:

- `GET /products/:productId/revisions/:revisionId/items/:itemId/routing` uses `products:read` and returns `RoutingStepResDto[]` ordered by `stepNo`.
- `PUT /products/:productId/revisions/:revisionId/items/:itemId/routing` uses `products:routing-manage` and accepts `UpdateRoutingReqDto`.
- PUT replaces active routing steps for the item in one transaction.
- Product and revision must exist, and revision must belong to product.
- Routing item must exist and be FG/WIP.
- Routing item must be the root product or already attached in the same revision BOM tree.
- RM/Consumable must not have routing.
- Operations must exist and not be deleted.
- Default supplier must exist and not be deleted when provided.
- Default supplier is allowed only on outside process steps.
- `stepNo` is provided by the client and must be unique in the submitted routing steps.

## Permissions

Planned permission codes:

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
- BOM mutation: `products:bom-manage`.
- Routing mutation: `products:routing-manage`.

## Dependencies

- Drizzle database client through `DRIZZLE`.
- `products`, `productRevisions`, `bomLines`, `routingSteps`, `operations`, and `units` schemas.
- `productFiles` schema for product image metadata.
- `clients` schema through nullable `products.clientId`.
- `suppliers` schema for outsource routing default supplier.
- RBAC permissions through global `RolesGuard`.
- Local static upload serving from `/uploads`.
- Latest Drizzle migration adds `bom_lines.sort_order`.

## Database Rules

- Product code is unique globally.
- Revision number is unique per product.
- BOM and routing are revision-scoped.
- BOM sibling display order is stored in `bom_lines.sort_order`.
- FG/WIP may have routing.
- RM/Consumable must not have routing.
- FG/WIP may be BOM parent nodes.
- Prevent BOM self-parent and cycles.
- Locking a product or revision prevents product, BOM, and routing mutations.
- Delete should soft-delete product records and reject unsafe deletion once order/job dependencies exist.
- Product image replacement stores one active public thumbnail URL on `products.image_url`; historical file records are soft-deleted in `product_files`.

## Security Rules

- Never expose internal file paths or storage secrets through image/file responses.
- Product image upload must validate MIME type and size before making the file active.
- Enforce permissions per endpoint.
- Validate all route params and request bodies.
- Whitelist list sorting fields.
- Do not trust BOM level or routing order from the client without service validation.

## Change Checklist

- Update this spec when endpoints, DTOs, permissions, database rules, or dependencies change.
- Keep this module spec current when products implementation behavior changes.
- Update `docs/system-flow.md` when products become part of job/material calculation flow.
- Add or update focused Jest/Supertest cases following `docs/standards/testing-standards.md`.
