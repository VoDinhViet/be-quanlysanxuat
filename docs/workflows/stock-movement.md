# Lập / post / cancel phiếu nhập / xuất kho

Con đường **chính** làm tồn kho thay đổi qua API — cùng qua `InventoryPostingService.postDocument`/
`reverseDocument` như `SupplierReturnsService.postSupplierReturn` (phiếu trả NCC,
`docs/workflows/supplier-return.md`), nhưng file này chỉ nói về nhập/xuất. Mô hình phiếu/sổ cái/tồn
ở `docs/domains/inventory.md`. Riêng phiếu nhập có thêm bước `confirm` (và nhánh IQC) — trình tự
đầy đủ ở `docs/workflows/receipt-confirmation.md`; file này vẫn là nguồn cho `post`/`cancel` chung
của cả nhập lẫn xuất.

## Trigger

Hai bộ route gần như đối xứng — phiếu nhập có thêm `confirm`, phiếu xuất không:

| Nhập | Xuất | Ý nghĩa |
| --- | --- | --- |
| `POST /inventory-receipts` | `POST /inventory-issues` | Lập phiếu, luôn ở `DRAFT` |
| `PATCH /inventory-receipts/:id` | `PATCH /inventory-issues/:id` | Sửa phiếu — chỉ khi `DRAFT` |
| `DELETE /inventory-receipts/:id` | `DELETE /inventory-issues/:id` | Xoá phiếu — chỉ khi `DRAFT` |
| `POST /inventory-receipts/:id/confirm` | *(không có)* | `DRAFT → PENDING_RECEIPT`/`PENDING_IQC` — xem `docs/workflows/receipt-confirmation.md` |
| `POST /inventory-receipts/:id/post` | `POST /inventory-issues/:id/post` | Đụng tồn kho — nhập nhận từ `PENDING_RECEIPT`/`PENDING_IQC` (có điều kiện), xuất vẫn nhận thẳng từ `DRAFT` |
| `POST /inventory-receipts/:id/cancel` | `POST /inventory-issues/:id/cancel` | Huỷ phiếu, xem State changes |

Tất cả do người dùng chủ động gọi, luôn là thao tác tay — không có nghiệp vụ nào khác trong hệ
thống tự động lập hay `post` phiếu ở giai đoạn này (`docs/decisions/stored-inventory-balances.md`).
Ngoại lệ duy nhất: `confirm` phiếu nhập có `requiresIqc = true` tự sinh phiếu IQC (vẫn là hệ quả
trực tiếp của một thao tác tay, không phải nghiệp vụ nền).

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
   dòng có `purchaseOrderItemId` phải tồn tại (`E123`) và thuộc đúng `purchaseOrderId` đó (`E127`);
   SL cộng dồn qua mọi phiếu đã `confirm` (kể cả phiếu đang sửa, trừ chính nó) không được vượt SL
   đặt của dòng PO đó (`E154`) — chỉ validate mức này, vẫn không đối chiếu NCC/vật tư khớp 3 chiều
   (`docs/domains/purchasing.md`).
5. **Không kiểm** loại kho khớp loại hàng — cố ý, xem `docs/domains/inventory.md`.

`PATCH`/`DELETE`/`confirm`/`post`/`cancel` đều mở đầu bằng kiểm phiếu tồn tại + đúng trạng thái cho
phép (`E096`/`E098`). Riêng phiếu nhập, `post` không chỉ kiểm `status` — xem nhánh `PENDING_IQC` ở
Flow bên dưới.

`confirm` (chỉ phiếu nhập) chạy lại kiểm tra #4 (SL vượt, `E154`) và chặn thêm phiếu rỗng dòng
(`E151`) — cùng transaction, xem `docs/workflows/receipt-confirmation.md`.

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

1. Khoá + đọc phiếu, kiểm trạng thái nguồn hợp lệ, khác nhau giữa hai loại phiếu:
   - Phiếu xuất: `status = DRAFT` (`E098` nếu không) — không đổi. Riêng `issueType = PRODUCTION`,
     chạy thêm gate IQC **trước** khi gọi `postDocument`: còn ≥1 phiếu IQC chưa `COMPLETED` của cùng
     `(itemId, warehouseId)` với bất kỳ dòng nào của phiếu → `E203`
     (`hasPendingIqcForItems`, `src/api/iqc/iqc.query.ts`) — vật tư chưa qua IQC (hoặc còn FAIL
     chưa xử lý) không được xuất cho sản xuất, xem `docs/decisions/qc-gates-on-stock-moves.md`.
   - Phiếu nhập: `status = PENDING_RECEIPT` cho qua thẳng; `status = PENDING_IQC` thì đếm thêm
     `iqc_inspections` gắn với phiếu — còn dòng nào `status !== COMPLETED` (kể cả **chưa có dòng
     nào**) thì ném `E153`, không rollback bút toán vì bước 2 chưa chạy; mọi trạng thái khác
     (`DRAFT`/`POSTED`/`CANCELLED`) → `E098`. Xem `docs/workflows/receipt-confirmation.md`.
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
| `inventory_receipts` | `confirm` | `DRAFT` | `PENDING_RECEIPT` (`requiresIqc=false`) hoặc `PENDING_IQC` (`requiresIqc=true`) |
| `iqc_inspections` | `confirm` phiếu nhập (`requiresIqc=true`) | *(chưa có)* | N dòng mới `NOT_INSPECTED` (N = số dòng phiếu) |
| `inventory_issues` | `post` | `DRAFT` | `POSTED` |
| `inventory_receipts` | `post` | `PENDING_RECEIPT` hoặc `PENDING_IQC` (mọi IQC `COMPLETED`) | `POSTED` |
| `inventory_receipts`/`inventory_issues` | `cancel` | `DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED` (tuỳ loại phiếu) | `CANCELLED` |
| `inventory_balances` | `post` | — | tăng/giảm theo dấu bút toán |
| `inventory_balances` | `cancel` (từ `POSTED`) | — | đảo ngược đúng phần đã `post` |

Không route nào khác đổi trạng thái đơn hàng, LSX hay Job. `confirm` không đụng
`inventory_transactions`/`inventory_balances` — chỉ `post` mới ghi hai bảng đó.

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
| (Phiếu nhập) SL cộng dồn các phiếu đã `confirm` vượt SL đặt của dòng PO | `E154` | 400 |
| (Phiếu nhập) `confirm` một phiếu không có dòng nào | `E151` | 400 |
| (Phiếu nhập) `confirm` với `requiresIqc=true` mà không suy được `supplierId` (cả header lẫn PO đều thiếu) | `E152` | 400 |
| `PATCH`/`DELETE`/`confirm` gọi trên phiếu không còn `DRAFT` | `E098` | 409 |
| (Phiếu xuất) `post` gọi trên phiếu không còn `DRAFT` | `E098` | 409 |
| (Phiếu xuất `PRODUCTION`) `post` khi còn IQC chưa `COMPLETED` của cùng (item, kho) | `E203` | 409 |
| (Phiếu nhập) `post` gọi trên phiếu không phải `PENDING_RECEIPT`/`PENDING_IQC` | `E098` | 409 |
| (Phiếu nhập) `post` một phiếu `PENDING_IQC` còn phiếu IQC chưa `COMPLETED` (kể cả chưa có phiếu IQC nào) | `E153` | 409 |
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
`purchasing` (qua `purchaseOrderId`/`purchaseOrderItemId`, hai chiều — validate PO lúc `confirm`,
bị `purchase-orders` đọc lại để tính `progress`/`receivedQuantity`), `suppliers` (qua `supplierId`),
`product-structure` (`items`, mặt hàng), `quality` — hai chiều, khác nhau giữa nhập/xuất: phiếu
**nhập** `confirm` ghi sang `iqc_inspections`, `post` đọc lại (`E153`); phiếu **xuất**
(`issueType = PRODUCTION`) chỉ **đọc** `iqc_inspections` lúc `post` (`E203`, gate mới — xem
`docs/decisions/qc-gates-on-stock-moves.md`), không ghi gì. Không domain nào khác ghi ngược vào đây.

Code: `InventoryReceiptsService`/`InventoryIssuesService` (`createInventoryReceipt`/`createInventoryIssue`,
`updateInventoryReceipt`/`updateInventoryIssue`, `deleteInventoryReceipt`/`deleteInventoryIssue`,
`confirmInventoryReceipt` (chỉ phiếu nhập), `postInventoryReceipt`/`postInventoryIssue`,
`cancelInventoryReceipt`/`cancelInventoryIssue`), `InventoryPostingService.postDocument`/
`reverseDocument`, `IqcService.createInspectionsFromReceipt` (gọi từ `confirmInventoryReceipt`),
`hasPendingIqcForItems` (`src/api/iqc/iqc.query.ts`, gọi từ `postInventoryIssue`),
`InventoryService.getInventory`/`getStockLevels`/`getMaterialStockLevels`.
Bốn module riêng — `warehouses`, `inventory` (đọc + `InventoryPostingService`), `inventory-receipts`
(import `InventoryModule`+`WarehousesModule`+`IqcModule`), `inventory-issues` (import
`InventoryModule`+`WarehousesModule` — gate IQC qua plain function, không cần import `IqcModule`).
