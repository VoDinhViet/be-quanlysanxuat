# Lập / post / cancel phiếu nhập / xuất kho

Con đường **duy nhất** làm tồn kho thay đổi qua API. Mô hình phiếu/sổ cái/tồn ở
`docs/domains/inventory.md`.

## Trigger

Hai bộ route đối xứng, cùng khuôn:

| Nhập | Xuất | Ý nghĩa |
| --- | --- | --- |
| `POST /inventory-receipts` | `POST /inventory-issues` | Lập phiếu, luôn ở `DRAFT` |
| `PATCH /inventory-receipts/:id` | `PATCH /inventory-issues/:id` | Sửa phiếu — chỉ khi `DRAFT` |
| `DELETE /inventory-receipts/:id` | `DELETE /inventory-issues/:id` | Xoá phiếu — chỉ khi `DRAFT` |
| `POST /inventory-receipts/:id/post` | `POST /inventory-issues/:id/post` | `DRAFT → POSTED`, đụng tồn kho |
| `POST /inventory-receipts/:id/cancel` | `POST /inventory-issues/:id/cancel` | Huỷ phiếu, xem State changes |

Tất cả do người dùng chủ động gọi, luôn là thao tác tay — không có nghiệp vụ nào khác trong hệ
thống tự động lập hay `post` phiếu ở giai đoạn này (`docs/decisions/stored-inventory-balances.md`).

## Actor

`inventory:create` (lập phiếu) / `inventory:update` (sửa, `post`, `cancel`) /
`inventory:delete` (xoá phiếu `DRAFT`). Không có quyền duyệt riêng — `post` là xác nhận, không phải
phê duyệt hai cấp.

## Preconditions

Lập/sửa phiếu — chạy **trước** transaction:

1. Kho tồn tại và `ACTIVE` (`E092`/`E094`).
2. Mọi dòng có `itemId` trỏ tới một item còn sống (`E100`).
3. Tham chiếu tuỳ chọn (`supplierId`/`purchaseRequestId`/`productionOrderId`/`productionJobId`/
   `departmentId`/`requestedBy`/`orderItemId`) nếu có gửi phải tồn tại (`E107`).
4. Riêng phiếu nhập: `purchaseOrderId` (nếu gửi) phải tồn tại (`E121`) và đang `ORDERED` (`E145`);
   dòng có `purchaseOrderItemId` phải tồn tại (`E123`) và thuộc đúng `purchaseOrderId` đó (`E127`) —
   chỉ validate mức này, không đối chiếu NCC/vật tư hay chặn nhận vượt SL đặt
   (`docs/domains/purchasing.md`).
5. **Không kiểm** loại kho khớp loại hàng — cố ý, xem `docs/domains/inventory.md`.

`PATCH`/`DELETE`/`post`/`cancel` đều mở đầu bằng kiểm phiếu tồn tại + đúng trạng thái cho phép
(`E096`/`E098`).

`post` thêm một bước không nằm trong service phiếu: gọi `InventoryPostingService.postDocument`,
nơi duy nhất ghi `inventory_transactions`/`inventory_balances` — cả `InventoryReceiptsService` lẫn
`InventoryIssuesService` đều đi qua đây, không service nào tự ghi hai bảng đó.

## Flow

### Lập / sửa (`DRAFT`)

1. Validate ở trên (toàn bộ là đọc).
2. **Transaction**: ghi header + toàn bộ dòng phiếu (`PATCH` là replace-all items).
3. Đọc lại chi tiết phiếu để trả về.

Không đụng `inventory_transactions`/`inventory_balances` ở bước này.

### `post`

**Transaction** — khoá dòng phiếu bằng `SELECT … FOR UPDATE` trước rồi mới đọc/kiểm trạng thái, để
hai lệnh `post` gọi trùng lên cùng phiếu không cùng lọt qua và cộng tồn hai lần:

1. Khoá + đọc phiếu, kiểm `status = DRAFT` (`E098` nếu không).
2. Với mỗi dòng phiếu: `SELECT … FOR UPDATE` dòng `inventory_balances` khớp
   `(warehouseId, itemId)` (tạo dòng mới nếu chưa có) → cộng/trừ theo dấu bút toán
   tương ứng loại phiếu (xem bảng ánh xạ ở `docs/domains/inventory.md`) → nếu kết quả `< 0`, ném
   `E106` và rollback toàn bộ phiếu → `INSERT`/`UPDATE` balance → `INSERT` một dòng
   `inventory_transactions`.
3. Cập nhật phiếu: `status = POSTED`, `postedBy`, `postedAt`.
4. `204`, không trả nội dung.

### `cancel`

**Transaction** — cùng cách khoá dòng phiếu như `post`:

1. Khoá + đọc phiếu, kiểm chưa `CANCELLED` (`E098` nếu đã huỷ).
2. Nếu đang `POSTED`: đọc lại mọi bút toán đã sinh khi `post` (theo `referenceType`+`referenceId`),
   ghi bút toán **đảo dấu** cho từng dòng (append-only, không xoá bút toán cũ), cộng dồn ngược vào
   balance (khoá dòng bằng `FOR UPDATE` như lúc `post`). Nếu đang `DRAFT`: bỏ qua bước này — chưa
   từng post thì chưa có gì để đảo.
3. Đổi `status = CANCELLED`.

Không có đường `CANCELLED → *`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `inventory_receipts`/`inventory_issues` | lập | *(chưa có)* | `DRAFT` |
| `inventory_receipts`/`inventory_issues` | `post` | `DRAFT` | `POSTED` |
| `inventory_receipts`/`inventory_issues` | `cancel` | `DRAFT`/`POSTED` | `CANCELLED` |
| `inventory_balances` | `post` | — | tăng/giảm theo dấu bút toán |
| `inventory_balances` | `cancel` (từ `POSTED`) | — | đảo ngược đúng phần đã `post` |

Không route nào khác đổi trạng thái đơn hàng, LSX hay Job.

## Side effects

- `post`: N dòng `inventory_transactions` mới (append-only), `inventory_balances` cập nhật.
- `cancel` từ `POSTED`: thêm N dòng `inventory_transactions` đảo dấu — **không** xoá bút toán cũ.
- Không log riêng, không thông báo, không đụng đơn hàng/LSX/Job dù có gắn `productionOrderId`/
  `productionJobId`/`orderItemId` — các cột đó chỉ là liên kết tham khảo.

Hai điều **không** xảy ra dù trực giác nghiệp vụ mong đợi:

- Giao đủ hàng cho một đơn **không** tự đẩy đơn sang `COMPLETED` — vẫn phải `PATCH` tay.
- Nhập mua vật tư có `supplierId`/`purchaseRequestId` nhưng hệ thống **không có** đơn mua hàng thật
  — xem `docs/decisions/no-procurement.md`.

## Transaction boundary

`post`/`cancel` bao đúng: khoá dòng phiếu (`FOR UPDATE`) + cập nhật `inventory_balances` (khoá
`FOR UPDATE`) + ghi `inventory_transactions` + đổi `status` phiếu — toàn bộ trong một transaction,
kể cả bước đọc/kiểm trạng thái phiếu (khác thiết kế cũ đọc trạng thái ngoài transaction). Khoá dòng
phiếu chặn hai lệnh `post` (hoặc hai lệnh `cancel`) gọi trùng lên cùng phiếu cộng/trừ tồn hai lần.
Khoá dòng balance tương tự chặn hai phiếu khác nhau `post` song song cùng một mặt hàng — cả hai giới
hạn race đều là giới hạn đã biết của thiết kế cũ, nay được xử lý (xem
`docs/decisions/stored-inventory-balances.md`).

Sinh mã (`PNK`/`PXK`) vẫn đếm-rồi-cộng-1 lúc lập phiếu, ngoài transaction `post` — unique constraint
trên `code` là chốt chặn thật, cùng giới hạn TOCTOU đã chấp nhận chung trong repo.

## Failure cases

| Tình huống | Mã | HTTP |
| --- | --- | --- |
| Phiếu không tồn tại | `E096` | 404 |
| Kho không tồn tại | `E092` | 404 |
| Kho không `ACTIVE` | `E094` | 400 |
| Mặt hàng trên dòng không tồn tại | `E100` | 404 |
| Tham chiếu tuỳ chọn không tồn tại | `E107` | 400 |
| (Phiếu nhập) `purchaseOrderId` không tồn tại | `E121` | 404 |
| (Phiếu nhập) `purchaseOrderId` không phải `ORDERED` | `E145` | 400 |
| (Phiếu nhập) `purchaseOrderItemId` không tồn tại | `E123` | 404 |
| (Phiếu nhập) `purchaseOrderItemId` không thuộc `purchaseOrderId` gửi kèm | `E127` | 400 |
| `PATCH`/`DELETE`/`post` gọi trên phiếu không còn `DRAFT` | `E098` | 409 |
| `cancel` gọi trên phiếu đã `CANCELLED` | `E098` | 409 |
| `post` làm tồn một mặt hàng xuống âm | `E106` | 409 |
| `cancel` một phiếu `POSTED` mà đảo bút toán làm tồn xuống âm (hàng đã bị tiêu đi sau khi `post`) | `E106` | 409 |

## Business rules

- Vì sao loại kho không ràng buộc loại hàng, vì sao chỉ `POSTED` mới đụng tồn →
  `docs/domains/inventory.md`.
- Vì sao `reserved`/`bomDemand` của vật tư luôn bằng 0 → cùng file.

## Related domains

`inventory` là chủ; đọc `orders` (qua `orderItemId`), `production` (qua `productionOrderId`/
`productionJobId`, chỉ liên kết tham khảo), `purchase-requests` (qua `purchaseRequestId`),
`suppliers` (qua `supplierId`), `product-structure` (`items`, mặt hàng). Không domain nào ghi
ngược vào đây.

Code: `InventoryReceiptsService`/`InventoryIssuesService` (`createInventoryReceipt`/`createInventoryIssue`,
`updateInventoryReceipt`/`updateInventoryIssue`, `deleteInventoryReceipt`/`deleteInventoryIssue`,
`postInventoryReceipt`/`postInventoryIssue`, `cancelInventoryReceipt`/`cancelInventoryIssue`),
`InventoryPostingService.postDocument`/`reverseDocument`,
`InventoryService.getInventory`/`getMaterialInventory`/`getStockLevels`/`getMaterialStockLevels`.
Ba module riêng — `warehouses`, `inventory` (đọc + `InventoryPostingService`), `inventory-receipts`/
`inventory-issues` (mỗi loại phiếu một module, import `InventoryModule`+`WarehousesModule`).
