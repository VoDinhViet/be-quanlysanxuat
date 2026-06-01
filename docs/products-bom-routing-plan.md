# Products, BOM, Routing Plan

## Mục Tiêu

Tạo nguồn dữ liệu sản xuất để định nghĩa sản phẩm, BOM nhiều cấp và routing công đoạn.

Dữ liệu này dùng cho:

- Tạo production job.
- Tự động tính vật tư theo BOM.
- Snapshot routing khi tạo job.
- Điều hành sản xuất theo công đoạn inhouse/outsource.

## Phạm Vi

Module gồm 2 phần:

- Backend API trong `src/api/products/`.
- Frontend UI trong `web-quanlysanxuat/features/products/` và route `/manage/products`.

Không làm trong bước plan này:

- Job creation tự động từ order.
- Material request/purchase request tự động.
- Warehouse inventory allocation.

Các phần trên dùng BOM/routing sau khi module sản phẩm ổn định.

## Hiện Trạng Schema Backend

Đã có schema nền:

- `products`: mã, tên, loại item, đơn vị, ảnh, trạng thái, ghi chú.
- `product_revisions`: revision sản phẩm dùng cho BOM/routing.
- `bom_lines`: quan hệ parent-child cho BOM nhiều cấp.
- `routing_steps`: routing theo item trong revision.
- `operations`: danh mục công đoạn.
- `units`: danh mục đơn vị.
- `product_files`: file/hình sản phẩm.

Cần bổ sung hoặc rà soát:

- `products.clientId` để hiển thị Khách hàng.
- Unique index cho `products.code`.
- Unique index cho `product_revisions(productId, revisionNo)`.
- `bom_lines.sortOrder` nếu tree-grid cần thứ tự ổn định.
- Seed dữ liệu `units`, `operations`, `product types` nếu chưa đủ.

## Data Rules

### Product Types

- `FG`: thành phẩm, có thể có BOM và routing.
- `WIP`: bán thành phẩm/part trung gian, có thể có BOM và routing.
- `RM`: vật tư/nguyên liệu, không có routing.
- `Consumable`: vật tư phụ, mặc định không có routing.

### Product Status

- `active`: được dùng để tạo BOM/job.
- `inactive`: không dùng cho dữ liệu mới.
- `locked`: khóa sửa thông tin, BOM và routing.

### Revision

- BOM và routing luôn gắn với một revision.
- Job đã tạo phải snapshot revision hiện tại.
- Khi copy hoặc tạo revision mới, copy BOM/routing từ revision nguồn nếu người dùng chọn.

### BOM

- FG/WIP được làm parent node.
- WIP/RM/Consumable được làm child node.
- RM/Consumable không được có routing.
- Không cho item tự làm con của chính nó.
- Không cho cycle, ví dụ `A -> A1 -> A`.
- WIP quantity nên là số nguyên.
- RM quantity cho phép số thập phân.
- Quantity là số lượng dùng cho 1 bộ parent.

### Routing

- Chỉ FG/WIP có routing.
- `stepNo` là thứ tự chạy công đoạn.
- `stepNo` không trùng trong cùng item + revision.
- `isOutsideProcess = true` cho công đoạn outsource.
- Outsource có thể có `defaultSupplierId`.

## Backend API Plan

### Module Setup

Tạo bằng Nest CLI:

```bash
pnpm nest generate module api/products
pnpm nest generate controller api/products
pnpm nest generate service api/products
```

Giữ file `*.spec.ts` do Nest CLI sinh ra, thay boilerplate bằng test case thật.

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

`GET /products` query:

```text
keyword
clientId
itemType
status
page
limit
sortBy
order
```

List response fields:

```text
id
imageUrl
client
code
name
itemType
unit
currentRevision
status
note
createdAt
updatedAt
```

Create product request:

```ts
{
  clientId?: string | null;
  code: string;
  name: string;
  itemType: 'fg' | 'wip' | 'rm' | 'consumable';
  unitId: string;
  revisionNo: string;
  imageUrl?: string | null;
  note?: string | null;
}
```

### Lookup Endpoints

```text
GET /products/options
GET /products/units/options
GET /products/types/options
GET /products/operations/options
```

### Image Endpoints

```text
POST   /products/:productId/image
DELETE /products/:productId/image
```

Có thể dùng `imageUrl` trước, file upload làm sau nếu chưa có upload standard.

### Revision Endpoints

```text
GET   /products/:productId/revisions
POST  /products/:productId/revisions
PATCH /products/:productId/revisions/:revisionId
```

Create revision request:

```ts
{
  revisionNo: string;
  copyFromRevisionId?: string;
  note?: string | null;
}
```

### BOM Endpoints

```text
GET    /products/:productId/revisions/:revisionId/bom-tree
POST   /products/:productId/revisions/:revisionId/bom-lines
PATCH  /products/:productId/revisions/:revisionId/bom-lines/:bomLineId
DELETE /products/:productId/revisions/:revisionId/bom-lines/:bomLineId
```

Create BOM line request:

```ts
{
  parentItemId: string;
  childItemId: string;
  qty: string;
  unitId: string;
  scrapRate?: string;
  note?: string | null;
}
```

BOM tree node response:

```ts
{
  id: string;
  bomLineId?: string;
  productId: string;
  parentItemId?: string;
  code: string;
  name: string;
  imageUrl?: string | null;
  itemType: 'fg' | 'wip' | 'rm' | 'consumable';
  qty: string;
  unit: { id: string; code: string; name: string };
  level: number;
  hasRouting: boolean;
  children: BomTreeNode[];
}
```

### Routing Endpoints

```text
GET /products/:productId/revisions/:revisionId/items/:itemId/routing
PUT /products/:productId/revisions/:revisionId/items/:itemId/routing
```

Put routing request:

```ts
{
  steps: Array<{
    operationId: string;
    stepNo: number;
    isOutsideProcess: boolean;
    defaultSupplierId?: string | null;
    note?: string | null;
  }>;
}
```

## Permissions

Thêm permissions:

```text
products:read
products:create
products:update
products:delete
products:lock
products:copy
products:bom-manage
products:routing-manage
```

Áp dụng:

- List/detail/options: `products:read`.
- Create/copy: `products:create` hoặc `products:copy`.
- Update/image: `products:update`.
- BOM: `products:bom-manage`.
- Routing: `products:routing-manage`.
- Lock: `products:lock`.
- Delete: `products:delete`.

## Frontend UI Plan

### Routes

```text
/manage/products
```

### Feature Files

```text
features/products/actions/
features/products/components/products-table.tsx
features/products/components/product-form-dialog.tsx
features/products/components/product-image-preview.tsx
features/products/components/product-bom-routing-tabs.tsx
features/products/components/bom-tree-grid.tsx
features/products/components/add-bom-node-dialog.tsx
features/products/components/routing-dialog.tsx
features/products/schemas/product.schema.ts
features/products/types/product.type.ts
```

### Product List Screen

Columns:

```text
Hình ảnh | Khách hàng | Mã SP | Tên | Loại | Rev | Trạng thái | Ghi chú | Thao tác
```

Actions:

```text
[+ Tạo sản phẩm] [Tìm kiếm] [Lọc]
[Xem] [Sửa] [Lock] [Copy] [Xóa]
```

### Create/Edit Product Dialog

Tab 1: Thông tin sản phẩm

Fields:

```text
Tải hình ảnh
Khách hàng
Mã SP
Tên
Loại
Đơn vị
Rev
Ghi chú
```

Actions:

```text
[Lưu] [X]
```

Tab 2: BOM - Routing

- Hiển thị tree-grid.
- Root là sản phẩm/revision hiện tại.
- Chỉ mở sau khi product đã được tạo.

### BOM Tree Grid

Columns:

```text
Hình | Mã | Tên (Tree) | Loại | SL | ĐV | Routing | Action
```

Row actions:

```text
[+] [Routing] [X]
```

UI rules:

- Click hình mở preview lớn.
- Dòng FG/WIP có nút `[+]` và `[Routing]`.
- Dòng RM không có `[Routing]`.
- `SL` edit inline.
- WIP quantity dùng integer input.
- RM quantity dùng decimal input.

### Add Node Dialog

Fields:

```text
Loại: WIP / RM / Consumable
Mã: search product/material
Tên: auto
SL
ĐV
```

Actions:

```text
[Thêm]
```

Flow:

- Chọn A -> thêm A1.
- Chọn A1 -> thêm A11.
- Chọn A11 -> thêm vật tư S5/S3/B10.

### Routing Dialog

Columns:

```text
STT | Công đoạn | Loại | Nhà cung cấp | Ghi chú | Action
```

Actions:

```text
[Thêm công đoạn] [Lưu] [X]
```

Rules:

- Chỉ mở cho FG/WIP.
- RM show disabled hoặc ẩn action.
- `Loại = Inhouse / Outsource`.
- Outsource cho chọn supplier.

## Backend Test Plan

Theo `docs/standards/testing-standards.md`.

Test cases:

- List products with keyword/filter/pagination.
- Create product creates default revision.
- Reject duplicate product code.
- Reject duplicate revision number.
- Add BOM child success.
- Reject BOM cycle.
- Reject self-child BOM.
- Reject child under RM parent.
- Update BOM qty validates WIP integer and RM decimal.
- Get BOM tree returns nested structure.
- Save routing for FG/WIP success.
- Reject routing for RM.
- Reject duplicate routing stepNo.
- Lock product prevents product/BOM/routing updates.
- Copy product copies base info, revision, BOM, and routing.
- Delete product soft deletes when allowed.

## Frontend Verification Plan

- Run `pnpm lint`.
- Run `pnpm typecheck`.
- Manually verify product list.
- Manually verify create product.
- Manually verify tree add/edit/delete.
- Manually verify routing dialog.
- Manually verify lock/copy/delete actions.

## Implementation Order

1. Create `docs/module-specs/products.md`.
2. Add permissions and seed updates.
3. Add DB migration for missing fields/indexes.
4. Generate backend products module/controller/service/spec files.
5. Implement product CRUD and options APIs.
6. Implement revision APIs.
7. Implement BOM tree and BOM line APIs.
8. Implement routing APIs.
9. Add backend tests.
10. Wire module into `AppModule`.
11. Update `docs/module-progress.md` and `docs/system-flow.md`.
12. Implement frontend product list page.
13. Implement create/edit product dialog.
14. Implement BOM tree-grid.
15. Implement add node dialog.
16. Implement routing dialog.
17. Run verification.

## Open Questions

- `clientId` bắt buộc hay optional cho sản phẩm?
- Product code unique toàn hệ thống hay unique theo khách hàng?
- Lock theo product hay theo revision?
- RM có cho quản lý như product bình thường trong cùng màn hình không?
- Image upload dùng URL trước hay multipart upload ngay?
