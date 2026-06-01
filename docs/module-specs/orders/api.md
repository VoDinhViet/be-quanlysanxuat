# Orders API Spec

## Data Rules

- Order status values: `pending_approval`, `approved`, `rejected`, `cancelled`.
- New orders always start as `pending_approval`.
- Order `code` is the customer PO code and must be unique.
- Order item `productCode`, `productName`, `unitPrice`, and `lineTotal` are snapshots.
- `unitPrice` comes from `products.defaultSalePrice` at create/update time.
- VAT rate must be `0`, `5`, `8`, or `10`.
- `subTotal`, `vatAmount`, and `totalAfterVat` are calculated by the backend.
- `pending_approval` and `rejected` orders can be updated/deleted.
- Updating a `rejected` order resets it to `pending_approval` and clears reject fields.
- `approved` orders cannot be updated or deleted.
- Production-safe endpoints only return approved orders and omit financial fields and PO PDFs.

## Commercial Endpoints

```text
GET    /orders
POST   /orders
GET    /orders/:orderId
PATCH  /orders/:orderId
DELETE /orders/:orderId
POST   /orders/:orderId/approve
POST   /orders/:orderId/reject
POST   /orders/:orderId/files/order-pdf
DELETE /orders/:orderId/files/:fileId
GET    /orders/product-options?q=
```

Permissions:

- `orders:create`: `POST /orders`.
- `orders:read`: `GET /orders`, `GET /orders/:orderId`, `GET /orders/product-options`.
- `orders:update`: `PATCH /orders/:orderId`, PO PDF upload/delete.
- `orders:delete`: `DELETE /orders/:orderId`.
- `orders:approve`: approve/reject endpoints.

## Production-Safe Endpoints

```text
GET /orders/production
GET /orders/production/:orderId
```

Permission: `orders:read-production`.

Rules:

- Only approved orders are returned.
- Response omits `unitPrice`, `lineTotal`, `subTotal`, `vatRate`, `vatAmount`, `totalAfterVat`, and order PO PDF files.
- Product technical files remain visible for production execution.

## File Rules

- PO PDF endpoint accepts PDF only, max 10 MB.
- PO PDF metadata is visible only through commercial order APIs.
- Product technical files use the products module endpoints and are separate from thumbnails.

## Dependencies

- Database tables: `orders`, `order_items`, `order_files`, `clients`, `products`, `product_files`, `units`.
- Static upload root: `/uploads`.

## Temporarily Out Of Scope

- Excel order import.
