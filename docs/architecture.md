# Kiến trúc miền dữ liệu

Bản đồ xuyên suốt các bảng chính và cách chúng nối với nhau — khác `docs/domains/<x>.md` (business
rules + API contract của từng module), file này chỉ trả lời "cái gì trỏ vào cái gì" và "ghi theo thứ
tự nào khi một thao tác chạm nhiều module". Đọc trước khi sửa bất kỳ luồng nào chạm ≥ 2 module.

## Sơ đồ ER theo cụm

```mermaid
erDiagram
    CLIENTS ||--o{ CLIENT_CONTACTS : has
    CLIENTS }o--|| CLIENT_GROUPS : "phân loại"
    SUPPLIERS }o--|| SUPPLIER_GROUPS : "phân loại"
    SUPPLIERS }o--|| COUNTRIES : "xuất xứ"
    MATERIALS }o--|| MATERIAL_GROUPS : "phân loại"
    MATERIALS }o--o| SUPPLIERS : "NCC chính"
    PRODUCTS }o--|| PRODUCT_GROUPS : "phân loại"
    PRODUCTS }o--o| PRODUCTS : "sourceProductId (bản clone từ)"

    PRODUCTS ||--o| BOMS : "1 BOM/product"
    BOMS ||--o{ BOM_ITEMS : "cây, self-ref"
    BOM_ITEMS }o--o| BOM_ITEMS : "parentId"
    BOM_ITEMS }o--o| PRODUCTS : "node PRODUCT"
    BOM_ITEMS }o--o| MATERIALS : "node MATERIAL"
    PRODUCTS ||--o{ ROUTING_STEPS : "routing Cấp 0 (productId)"
    BOM_ITEMS ||--o{ ROUTING_STEPS : "routing as-used (bomItemId)"
    ROUTING_STEPS }o--|| OPERATIONS : "công đoạn"

    CLIENTS ||--o{ ORDERS : đặt
    ORDERS ||--o{ ORDER_ITEMS : gồm
    ORDER_ITEMS }o--|| PRODUCTS : "sản phẩm đặt"
    ORDERS ||--o| PRODUCTION_ORDERS : "1 PO duyệt = 1 LSX"
    PRODUCTION_ORDERS ||--o{ PRODUCTION_ORDER_ITEMS : "quyết định SX"
    PRODUCTION_ORDER_ITEMS }o--|| ORDER_ITEMS : "1-1"
    PRODUCTION_ORDERS ||--o{ PRODUCTION_JOBS : "1 FG/LSX = 1 Job"
    PRODUCTION_JOBS }o--|| PRODUCTS : "sản phẩm FG"
    PRODUCTION_JOBS ||--o{ PRODUCTION_JOB_BOM_ITEMS : "snapshot cây BOM"
    PRODUCTION_JOB_BOM_ITEMS }o--o| PRODUCTION_JOB_BOM_ITEMS : "parentId"
    PRODUCTION_JOB_BOM_ITEMS ||--o{ PRODUCTION_JOB_OPERATIONS : "công đoạn as-used"
    PRODUCTION_JOBS ||--o{ PRODUCTION_JOB_MATERIALS : "snapshot vật tư"
    PRODUCTION_JOBS ||--o{ PRODUCTION_JOB_NOTES : "ghi chú"

    PRODUCTION_ORDERS ||--o{ PURCHASE_REQUESTS : "đề xuất mua vật tư (tuỳ chọn)"
    PURCHASE_REQUESTS ||--o{ PURCHASE_REQUEST_ITEMS : gồm
    PURCHASE_REQUEST_ITEMS }o--|| MATERIALS : "vật tư cần mua"

    STOCK_RECEIPTS ||--o{ STOCK_RECEIPT_ITEMS : gồm
    STOCK_RECEIPT_ITEMS }o--o| PRODUCTS : "dòng thành phẩm"
    STOCK_RECEIPT_ITEMS }o--o| MATERIALS : "dòng vật tư"
```

Master data (`client-groups`, `supplier-groups`, `material-groups`, `product-groups`, `countries`,
`departments`, `positions`, `units`, `operations`) chỉ được tham chiếu, không tham chiếu ngược — bỏ
khỏi sơ đồ trên cho gọn, xem `docs/domains/partners.md`.

## Thứ tự ghi của các luồng bắc cầu nhiều module

**Tạo sản phẩm** (`ProductsService.createProduct`): row `products` → `product_attachments` (nếu có),
cả hai trong một transaction. **`boms`/`bom_items` KHÔNG được tạo ở bước này** — BOM sinh ra lười
(get-or-create) ngay trong transaction ghi node đầu tiên qua `POST /products/:productId/bom/items`.
`routing_steps` viết riêng theo từng node qua `/products/:productId/bom/items/:itemId/operations*`.
`POST /products/:id/copy` đọc trước toàn bộ cây (đính kèm, BOM, routing Cấp 0 + as-used) rồi ghi lại
tất cả — kể cả header `boms` — trong một transaction, ghi `sourceProductId` vào bản clone. Chi tiết
từng bước: `docs/workflows/product-setup.md`.

**Duyệt đơn hàng** (`OrdersService.approveOrder`, chỉ hợp lệ từ `PENDING_CONFIRMATION` — `E074` nếu
không, `DRAFT` chưa gửi duyệt thì chưa duyệt được): đọc `InventoryService.getStockLevels` (chỉ đọc,
chạy trước transaction) → trong transaction: update `orders.status = AWAITING_PRODUCTION` →
`ProductionOrdersService.seedPlan` tạo `production_orders` (header, `PENDING`) +
`production_order_items` (1-1 với `order_items`, Đề xuất SX = onHand − reserved, trừ demand của
chính PO này). Chi tiết từng bước: `docs/workflows/order-approval.md`.

**Duyệt LSX** (`ProductionOrdersService.approveProductionOrder`, `PENDING` → `APPROVED`): đọc
`production_order_items`, gộp SL theo `productId` (chỉ giữ SL > 0) → trong transaction: sinh mã
`LSXxxxx`, update `production_orders.status` → update `orders.status = IN_PROGRESS` →
`ProductionJobsService.createJobs` tạo 1 `production_jobs` row/sản phẩm, rồi nhân bản cây BOM sang
`production_job_bom_items`, copy routing as-used của từng node sang `production_job_operations`, và
BOM (gộp theo vật tư × SL Job) sang `production_job_materials` — cùng trong transaction này.

## Chuỗi import module (NestJS DI)

Không vòng phụ thuộc nào trong chuỗi dưới — mỗi mũi tên là một chiều `imports` duy nhất:

`OrdersModule → ProductionOrdersModule → ProductionJobsModule`. `ProductionOrdersModule` chỉ
import `AuthModule`/`InventoryModule` (không import ngược `OrdersModule`), nên
`OrdersService.approveOrder` gọi thẳng `ProductionOrdersService` mà không vòng. Tương tự
`ProductionOrdersService.approveProductionOrder` gọi `ProductionJobsService.createJobs` — chỉ vì
`ProductionJobsModule` không import ngược `ProductionOrdersModule`.

`BomsModule`/`RoutingModule` không import `ProductsModule` — cả hai truy vấn
`products`/`boms`/`bom_items`/`routing_steps`/`operations` thẳng qua `DRIZZLE`, không qua service
của module khác. `BomsModule` import `FilesModule` để link/xoá file bản vẽ của node;
`RoutingModule` không cần vì routing không mang file riêng.

## Bất biến xuyên module

Những sự thật này không nằm trọn trong một `docs/domains/<x>.md` nào — mỗi cái nối ≥ 2 module.

- **`orders` snapshot liên hệ, không FK.** `contactName`/`contactPhone`/`contactEmail` trên
  `orders` là bản chụp một dòng `client_contacts` tại thời điểm submit, không phải FK — vì
  `ClientsService.replaceContacts` xoá+chèn lại toàn bộ contact mỗi lần sửa client, nên id contact
  không ổn định để tham chiếu lâu dài.
- **`routing_steps` khoá theo đúng một trong `productId`/`bomItemId`** (CHECK
  `chk_routing_steps_target`). Cùng một WIP xuất hiện ở 2 vị trí cha khác nhau trong 2 cây BOM khác
  nhau có thể mang routing khác nhau — routing là "as-used" theo node, không phải thuộc tính của
  sản phẩm.
- **`bom_items` cũng khoá theo đúng một trong `productId`/`materialId`** — cùng nguyên tắc trên,
  một node lá là PRODUCT (đệ quy xuống BOM con) hoặc MATERIAL, không bao giờ cả hai.
- **`stock_receipts.subject` (`FINISHED_GOOD`/`MATERIAL`) quyết định `stock_receipt_items` dùng
  `productId` hay `materialId`** (CHECK `chk_stock_receipt_items_target` chỉ đảm bảo "đúng một
  trong hai" ở tầng dòng — khớp đúng `subject` của header là trách nhiệm của
  `StockReceiptsService.ensureItemsValid`, DB không tự kiểm được vì CHECK không đọc được row cha).
- **1 PO duyệt = 1 LSX** (`production_orders.orderId` unique, `onDelete: 'restrict'`) — không có
  khái niệm nhiều LSX cho một đơn.
- **1 sản phẩm FG = 1 Job trong một LSX**, gộp mọi dòng `production_order_items` cùng `productId`
  trong cùng LSX đó — Job là đơn vị công việc thực tế của xưởng, không phải đơn vị kế toán kho nên
  không giữ 1-1 với `orderItemId`.
- **File đính kèm luôn qua registry `files`**, không bao giờ là URL trần — ngoại lệ duy nhất là
  `countries.logoUrl` (danh mục nhỏ, không cần registry). Sáu bảng khác (`products`, `materials`,
  `orders`, `suppliers`, `boms` — `drawingFileId` trên `bom_items`, `users` — `avatarFileId`) dùng
  `*_attachment_file_ids`/`*FileId` trỏ `files.id`. Chi tiết: `docs/decisions/files-registry.md`.
- **Mọi FK "ai đã làm việc này"** (`createdBy`, `approvedBy`, `startedBy`, `orders.staffId`, ...) trỏ
  `users.id`, không phải `credentials.id` (đảo lại 2026-08-01 — `orders.staffId` từng là ngoại lệ duy
  nhất, giờ mọi cột audit dùng chung một quy ước). Xem `docs/domains/identity-access.md`.

## Xem thêm

- `docs/workflows/<flow>.md` — trình tự chạy của từng luồng nghiệp vụ đầu-cuối.
- `.claude/rules/database.md` — quy ước viết schema (naming, timestamp, enum).
