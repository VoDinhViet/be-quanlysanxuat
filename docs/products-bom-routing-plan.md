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
q
clientId
itemType
status
page
limit
```

Sorting is fixed by `createdAt` descending. Do not expose `sortBy` for this list API.

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

Đã dùng multipart upload cho field `image`, lưu file public dưới `/uploads/products` và cập nhật `products.imageUrl`.

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

Thiết kế permissions cho module products:

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

Implementation note:

- Chưa thêm product permissions vào `PermissionCode` hoặc RBAC seed ở bước scaffold.
- Chỉ thêm permission vào code/seed khi endpoint tương ứng được implement trong chunk đó.

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

1. Create `docs/module-specs/products/` docs folder.
2. Add permissions and seed updates.
3. Add DB migration for missing fields/indexes.
4. Generate backend products module/controller/service/spec files.
5. Implement product CRUD and options APIs.
6. Implement revision APIs.
7. Implement BOM tree and BOM line APIs.
8. Implement routing APIs.
9. Add backend tests.
10. Wire module into `AppModule`.
11. Update module specs and `docs/system-flow.md`.
12. Implement frontend product list page.
13. Implement create/edit product dialog.
14. Implement BOM tree-grid.
15. Implement add node dialog.
16. Implement routing dialog.
17. Run verification.

## Timeline Task Table

Timeline thực tế giả định bắt đầu từ `2026-06-01`, có AI hỗ trợ viết code/test/docs nhưng vẫn cần dev review, chạy kiểm tra và sửa lỗi tích hợp. Không tính thứ bảy/chủ nhật. Mỗi API là một task riêng. Mỗi button UI kèm xử lý logic là một task riêng để dễ estimate, review và nghiệm thu.

Giả định nguồn lực:

- `1 dev chính + AI hỗ trợ`: khoảng 10 ngày làm việc, từ `2026-06-01` đến `2026-06-12`.
- `2 dev + AI hỗ trợ`: có thể rút còn khoảng 7-8 ngày làm việc nếu backend và frontend chạy song song sau khi API contract ổn định.
- Timeline dưới đây dùng phương án `1 dev chính + AI hỗ trợ`, có buffer kiểm thử và sửa lỗi cuối module.

| Giai đoạn                   | Ngày bắt đầu | Ngày kết thúc |  Giờ | Nội dung                                                                                    | Ghi chú                                   |
| --------------------------- | ------------ | ------------- | ---: | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Backend core API            | 2026-06-01   | 2026-06-03    |   24 | Product CRUD, options, image, revision, copy, lock/unlock, BOM tree/add                     | Ưu tiên chốt contract cho FE.             |
| Backend BOM/Routing + tests | 2026-06-04   | 2026-06-05    |   18 | BOM update/delete, routing get/save, focused tests, docs                                    | Có buffer sửa rule lock/cycle/qty.        |
| Frontend list/form actions  | 2026-06-08   | 2026-06-09    |   15 | List, search/filter, create/edit, lock/unlock, copy, delete                                 | Dùng API đã chốt từ backend.              |
| Frontend detail/BOM/Routing | 2026-06-10   | 2026-06-11    | 19.5 | Detail, revision selector, revision dialogs, BOM tree, add/edit/delete node, routing dialog | Phần có rủi ro UI/logic cao nhất.         |
| Integration QA + polish     | 2026-06-12   | 2026-06-12    |    7 | Typecheck/lint, manual verification, fix edge cases, update docs                            | Không nhận thêm scope mới trong ngày này. |

| ID    | Nhóm          | Task                                                                                         | Ngày bắt đầu | Ngày kết thúc |  Giờ | Ghi chú                                                   |
| ----- | ------------- | -------------------------------------------------------------------------------------------- | ------------ | ------------- | ---: | --------------------------------------------------------- |
| BE-01 | Backend setup | Add product permissions and RBAC seed                                                        | 2026-06-01   | 2026-06-01    |  1.5 | `products:*` permission codes.                            |
| BE-02 | Backend setup | Add/verify product schema fields and indexes                                                 | 2026-06-01   | 2026-06-01    |    2 | `clientId`, unique code, revision unique, BOM sort order. |
| BE-03 | API           | `GET /products` list API                                                                     | 2026-06-01   | 2026-06-01    |    2 | Search/filter/pagination, fixed sort by `createdAt desc`. |
| BE-04 | API           | `POST /products` create API                                                                  | 2026-06-01   | 2026-06-01    |    2 | Create product and initial revision in one transaction.   |
| BE-05 | API           | `GET /products/:productId` detail API                                                        | 2026-06-01   | 2026-06-01    |    1 | Include client, unit, current revision.                   |
| BE-06 | API           | `PATCH /products/:productId` update API                                                      | 2026-06-01   | 2026-06-01    |  1.5 | Reject locked products and duplicate code.                |
| BE-07 | API           | `PATCH /products/:productId/lock` lock API                                                   | 2026-06-02   | 2026-06-02    |    1 | Lock product mutations.                                   |
| BE-08 | API           | `PATCH /products/:productId/unlock` unlock API                                               | 2026-06-02   | 2026-06-02    |    1 | Restore product status to active.                         |
| BE-09 | API           | `POST /products/:productId/copy` copy API                                                    | 2026-06-02   | 2026-06-02    |    3 | Copy product, current revision, BOM and routing.          |
| BE-10 | API           | `DELETE /products/:productId` delete API                                                     | 2026-06-02   | 2026-06-02    |    1 | Soft delete only.                                         |
| BE-11 | API           | `POST /products/:productId/image` upload image API                                           | 2026-06-02   | 2026-06-02    |    2 | Multipart upload, max 5 MB.                               |
| BE-12 | API           | `DELETE /products/:productId/image` delete image API                                         | 2026-06-02   | 2026-06-02    |    1 | Clear `imageUrl`, soft delete file records.               |
| BE-13 | API           | `GET /products/options` product options API                                                  | 2026-06-02   | 2026-06-02    | 0.75 | Used by BOM item search.                                  |
| BE-14 | API           | `GET /products/units/options` unit options API                                               | 2026-06-02   | 2026-06-02    |  0.5 | Used by forms and BOM.                                    |
| BE-15 | API           | `GET /products/types/options` product type options API                                       | 2026-06-02   | 2026-06-02    |  0.5 | Used by filters/forms.                                    |
| BE-16 | API           | `GET /products/operations/options` operation options API                                     | 2026-06-02   | 2026-06-02    |  0.5 | Used by routing dialog.                                   |
| BE-17 | API           | `GET /products/:productId/revisions` list revisions API                                      | 2026-06-03   | 2026-06-03    |    1 | Sort by created date.                                     |
| BE-18 | API           | `POST /products/:productId/revisions` create revision API                                    | 2026-06-03   | 2026-06-03    |    2 | Optional copy from source revision.                       |
| BE-19 | API           | `PATCH /products/:productId/revisions/:revisionId` update revision API                       | 2026-06-03   | 2026-06-03    |    1 | Update revision number and note.                          |
| BE-20 | API           | `GET /products/:productId/revisions/:revisionId/bom-tree` BOM tree API                       | 2026-06-03   | 2026-06-03    |    3 | Return nested tree with routing indicator.                |
| BE-21 | API           | `POST /products/:productId/revisions/:revisionId/bom-lines` add BOM line API                 | 2026-06-03   | 2026-06-03    |  2.5 | Validate parent type, child type, cycle and qty.          |
| BE-22 | API           | `PATCH /products/:productId/revisions/:revisionId/bom-lines/:bomLineId` update BOM line API  | 2026-06-04   | 2026-06-04    |  1.5 | Inline qty/unit/note updates.                             |
| BE-23 | API           | `DELETE /products/:productId/revisions/:revisionId/bom-lines/:bomLineId` delete BOM line API | 2026-06-04   | 2026-06-04    |  1.5 | Delete node and descendants.                              |
| BE-24 | API           | `GET /products/:productId/revisions/:revisionId/items/:itemId/routing` get routing API       | 2026-06-04   | 2026-06-04    |    1 | Sort by `stepNo`.                                         |
| BE-25 | API           | `PUT /products/:productId/revisions/:revisionId/items/:itemId/routing` replace routing API   | 2026-06-04   | 2026-06-04    |  2.5 | Validate FG/WIP only, duplicate step, outsource supplier. |
| BE-26 | Tests         | Backend focused tests                                                                        | 2026-06-05   | 2026-06-05    |    4 | Cover API business rules and locked state.                |
| BE-27 | Docs          | Update module spec and system flow                                                           | 2026-06-05   | 2026-06-05    |    1 | Keep API rules current for later agents.                  |
| FE-01 | Page          | Product list page shell                                                                      | 2026-06-08   | 2026-06-08    |    2 | Route `/manage/products`, table and toolbar.              |
| FE-02 | UI action     | `[+ Tạo sản phẩm]` button + create dialog logic                                              | 2026-06-08   | 2026-06-08    |    3 | TanStack form, image field, create action.                |
| FE-03 | UI action     | `[Tìm kiếm]` input + query param logic                                                       | 2026-06-08   | 2026-06-08    |    1 | Use `nuqs` and transition.                                |
| FE-04 | UI action     | `[Lọc]` filter controls + query param logic                                                  | 2026-06-08   | 2026-06-08    |  1.5 | Client, item type, status.                                |
| FE-05 | UI action     | `[Xem]` button + detail navigation                                                           | 2026-06-09   | 2026-06-09    |    1 | Link to product detail page.                              |
| FE-06 | UI action     | `[Sửa]` button + edit dialog logic                                                           | 2026-06-09   | 2026-06-09    |    2 | Update product, image and default revision.               |
| FE-07 | UI action     | `[Lock/Mở khóa]` button + confirm logic                                                      | 2026-06-09   | 2026-06-09    |  1.5 | Lock and unlock based on current status.                  |
| FE-08 | UI action     | `[Copy]` button + copy logic                                                                 | 2026-06-09   | 2026-06-09    |  1.5 | Copy product and refresh/redirect.                        |
| FE-09 | UI action     | `[Xóa]` button + delete dialog logic                                                         | 2026-06-09   | 2026-06-09    |  1.5 | Confirm dialog and soft delete action.                    |
| FE-10 | Detail        | Product detail layout                                                                        | 2026-06-10   | 2026-06-10    |    2 | Full page layout with back button and product summary.    |
| FE-11 | UI action     | Revision selector + URL state logic                                                          | 2026-06-10   | 2026-06-10    |  1.5 | Use `nuqs` and `useTransition`.                           |
| FE-12 | UI action     | `[Tạo revision]` button + create revision dialog logic                                       | 2026-06-10   | 2026-06-10    |    2 | Optional copy from source revision.                       |
| FE-13 | UI action     | `[Sửa revision]` button + update revision dialog logic                                       | 2026-06-10   | 2026-06-10    |  1.5 | Edit revision number/note.                                |
| FE-14 | Component     | BOM tree-grid render                                                                         | 2026-06-10   | 2026-06-10    |    3 | Tree indentation, image/icon, routing indicator.          |
| FE-15 | UI action     | BOM `[+]` button + add node dialog logic                                                     | 2026-06-11   | 2026-06-11    |    3 | Search child product/material, qty/unit validation.       |
| FE-16 | UI action     | BOM `SL` inline edit + save logic                                                            | 2026-06-11   | 2026-06-11    |    2 | WIP integer, RM decimal.                                  |
| FE-17 | UI action     | BOM `[X]` button + delete node dialog logic                                                  | 2026-06-11   | 2026-06-11    |  1.5 | Confirm delete and refresh tree.                          |
| FE-18 | UI action     | `[Routing]` button + routing dialog open logic                                               | 2026-06-11   | 2026-06-11    |  1.5 | Hidden/disabled for RM and consumable.                    |
| FE-19 | UI action     | `[Thêm công đoạn]` button + add row logic                                                    | 2026-06-11   | 2026-06-11    |  1.5 | Auto next `stepNo`.                                       |
| FE-20 | UI action     | Routing `[Lưu]` button + replace routing logic                                               | 2026-06-12   | 2026-06-12    |    2 | Save full routing step list.                              |
| FE-21 | UI action     | Routing `[Xóa dòng]` button + remove row logic                                               | 2026-06-12   | 2026-06-12    |    1 | Local remove before save.                                 |
| FE-22 | UI action     | Product image click + preview dialog logic                                                   | 2026-06-12   | 2026-06-12    |    1 | Large image preview with fallback icon.                   |
| FE-23 | Verification  | Frontend lint/typecheck/manual verification                                                  | 2026-06-12   | 2026-06-12    |    3 | Product list, form, BOM, routing, lock/copy/delete.       |

## Open Questions

- `clientId` bắt buộc hay optional cho sản phẩm?
- Product code unique toàn hệ thống hay unique theo khách hàng?
- Lock theo product hay theo revision?
- RM có cho quản lý như product bình thường trong cùng màn hình không?
- Image upload dùng multipart upload ngay, URL public được backend trả trong `imageUrl`.
