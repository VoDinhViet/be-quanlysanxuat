# Trả hàng NCC từ IQC FAIL đến hoàn tất

Chặng nối `quality` → `inventory`: từ lúc QC chọn phương án xử lý một dòng IQC FAIL, tới lúc kho
xác nhận đã thật sự xuất hàng trả nhà cung cấp, và IQC gốc được hoàn tất. Mô hình `iqc_inspections`
ở `docs/domains/quality.md`, mô hình `supplier_returns`/bù trừ tồn ở `docs/domains/inventory.md`;
đây là trình tự đầy đủ nối hai domain đó.

## Trigger

- `POST /iqc/:iqcId/confirm` với `result = FAIL` và `disposition = SORT`/`RETURN` — tự sinh một
  dòng `supplier_returns` (`DRAFT`), **không** có route tạo tay riêng.
- `POST /supplier-returns/:supplierReturnId/post` — kho xác nhận đã thật sự xuất hàng trả NCC
  *(một lần)*.

## Actor

`iqc:update` cho bước tự sinh (đi kèm quyền lưu kết quả QC — người dùng không "tạo phiếu trả" như
một hành động riêng, nó là hệ quả của việc chọn disposition). `inventory:update` cho `post` — kho
là bên xác nhận vật lý, khác vai trò với QC.

## Preconditions

| Điều kiện | Tự sinh (trong `confirm`) | `post` |
| --- | --- | --- |
| Dòng IQC tồn tại, đang lưu được | `E138`/`E159` (đã kiểm ở đầu `confirm`) | — |
| Suy được kho trả (`receipt.warehouseId ?? purchaseOrder.receiptWarehouseId`) | `E163` | — |
| `disposition = SORT` phải có `sortOkQty`/`sortNgQty` hợp lệ | `E160`/`E161`/`E162` (đã kiểm ở `validateDecision`, xem `docs/domains/quality.md`) | — |
| Phiếu trả tồn tại | — | `E137` |
| Đúng trạng thái nguồn (`DRAFT`) | — | `E098` |
| Dòng IQC liên kết đang `WAITING_RETURN` | — | `E164` |

## Flow

### Tự sinh (trong transaction của `IqcService.confirmIqc`)

1. `confirmIqc` tính `status` mới từ `resolveIqcStatus(reqDto.result, reqDto.disposition)`. Ra
   `WAITING_RETURN` (`FAIL` + `SORT`/`RETURN`) thì, **trước** khi mở transaction, suy sẵn:
   - `warehouseId` — đọc phiếu nhập liên quan (`inspection.inventoryReceiptId`) trước, PO liên quan
     (`inspection.purchaseOrderId`) sau; không suy được cả hai → `E163`, dừng trước khi ghi bất cứ
     gì (dòng IQC tạo tay không gắn phiếu/PO nào rơi vào ca này).
   - `quantity` — `RETURN` lấy cả `inspection.quantity`; `SORT` lấy `reqDto.sortNgQty` (đã đảm bảo
     hợp lệ ở `validateDecision`, cộng đúng `quantity` cùng `sortOkQty`).
2. Trong transaction, sau khi `UPDATE` dòng IQC (khoá `WAITING_RETURN`) và replace-all 2 bộ file
   đính kèm, gọi `SupplierReturnsService.createFromIqcDisposition(tx, {...})`: sinh mã
   `PTNCC-{năm}-{đếm trong năm + 1, pad 5}` (đọc trong `tx`, vẫn đếm-rồi-cộng trên chính bảng — xem
   "Transaction boundary"), insert một dòng `status = DRAFT`,
   `iqcId` = dòng IQC vừa khoá.
3. Vì `WAITING_RETURN` khoá mọi lần `confirm` sau đó (`E159`), đây là lần **duy nhất** dòng IQC này
   chuyển sang trạng thái đó — không cần guard chống tạo phiếu trả trùng.

### `post` (trong transaction riêng của `SupplierReturnsService.postSupplierReturn`)

1. Khoá dòng phiếu trả (`SELECT … FOR UPDATE`, cùng lý do chống double-submit như
   `InventoryReceiptsService.lockReceipt`), kiểm `status = DRAFT` (`E098`).
2. **`shouldPostStock`** — hai ca bỏ qua trừ tồn, còn lại luôn trừ:
   - Phiếu trả sinh từ IQC của OS-IN (`outsourcingReceiptId` có giá trị) — hàng gia công ngoài chưa
     từng vào `inventory_balances` (`docs/decisions/wip-not-stocked.md`), kiểm ca này **trước**.
   - Còn lại, đọc phiếu nhập liên quan (nếu có): đã `POSTED` thì trừ tồn thật qua
     `InventoryPostingService.postDocument` (`referenceType: SUPPLIER_RETURN`, `signedQuantity` âm,
     `type: ISSUE`); còn `DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT` thì **bỏ qua** — hàng chưa từng
     thật sự vào `inventory_balances` (IQC chạy trước `post` phiếu nhập), trừ vào đó sẽ trừ vào tồn
     chưa từng có. Không có phiếu nhập/OS-IN liên quan (IQC tạo tay) → luôn trừ tồn bình thường.
3. Cập nhật `status = POSTED`, `postedBy`, `postedAt`.
4. Gọi `completeIqcAfterSupplierReturn(tx, row.iqcId)` (nếu có `iqcId`) — **cuối cùng**, sau khi
   trạng thái phiếu trả đã ổn định: kiểm dòng IQC còn `WAITING_RETURN` (`E164` nếu không), rồi
   `UPDATE status = COMPLETED`. Không đi qua `resolveIqcStatus`/`confirmIqc` — đây là transition
   riêng, chỉ hợp lệ đúng một lần, không có guard nào khác ngoài `E164`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `iqc_inspections.status` | `confirm` (disposition SORT/RETURN) | `PENDING`/`NOT_INSPECTED` | `WAITING_RETURN` |
| `supplier_returns` | `confirm` (disposition SORT/RETURN) | *(chưa có)* | 1 dòng `DRAFT` |
| `supplier_returns.status` | `post` | `DRAFT` | `POSTED` |
| `inventory_balances`/`inventory_transactions` | `post` (nếu `shouldPostStock`) | — | cập nhật (xem `docs/workflows/stock-movement.md`) |
| `iqc_inspections.status` | `post` (qua `completeIqcAfterSupplierReturn`) | `WAITING_RETURN` | `COMPLETED` |

## Side effects

- `confirm` (disposition SORT/RETURN): 1 dòng `supplier_returns` mới, mã `PTNCC-{năm}-xxxxx`.
  Không side effect nào khác ngoài đổi `status` dòng IQC.
- `post`: có thể **không** sinh bút toán nào (`shouldPostStock` = false) — vẫn hợp lệ, không phải
  lỗi. Luôn hoàn tất dòng IQC liên kết nếu có.
- `post` phiếu trả **không** đọc/ghi gì thêm về `inventory_receipts` — bù trừ SL diễn ra ở chiều
  ngược lại, khi `postInventoryReceipt` chạy (xem `docs/domains/inventory.md`, "Bù trừ SL đã trả").

## Transaction boundary

`confirm` mở transaction bao **hai module**: `iqc_inspections` (khoá + đổi `status`, replace-all 2
bộ file đính kèm) và `supplier_returns` (insert) — lý do
`SupplierReturnsService.createFromIqcDisposition` bắt buộc nhận `tx`, không tự mở transaction
(`.claude/rules/transactions.md`), cùng khuôn `IqcService.createInspectionsFromReceipt` ở
`docs/workflows/receipt-confirmation.md`. Chiều ngược lại (`post` → hoàn tất IQC) **không** đi qua
DI: `IqcModule` đã import `SupplierReturnsModule` (để `confirmIqc` gọi được
`createFromIqcDisposition`), nên `SupplierReturnsModule` import ngược `IqcModule` sẽ tạo vòng lặp
— repo hiện không dùng `forwardRef` ở đâu cả. `completeIqcAfterSupplierReturn`
(`src/api/iqc/iqc.write.ts`) là một hàm thuần nhận `tx`, sống trong module `iqc` nhưng được gọi
trực tiếp (import function, không qua service/DI) từ `postSupplierReturn` — cùng transaction với
việc trừ tồn, đảm bảo "đã trừ tồn (hoặc quyết định không trừ) + IQC hoàn tất" là một đơn vị nguyên
tử.

Sinh mã phiếu trả nằm **trong** transaction `confirm` nhưng **chưa** chuyển sang bảng đếm dùng chung
`document_sequences` như phần lớn chứng từ khác (`docs/architecture.md`, mục "Bất biến xuyên
module") — vẫn đếm-rồi-cộng, nên hai lượt `confirm` song song (hai dòng IQC khác nhau, cùng
disposition SORT/RETURN) có thể trùng mã, unique constraint trên `code` là chốt chặn thật.

## Failure cases

`E138` (dòng IQC không tồn tại), `E159` (lưu lại kết quả QC khi đã `WAITING_RETURN`), `E163`
(không suy được kho trả), `E137` (phiếu trả không tồn tại), `E098` (`post` khi không còn `DRAFT`),
`E106` (thiếu tồn — chỉ có thể xảy ra khi `shouldPostStock = true` mà tồn thực tế đã bị tiêu bởi
giao dịch khác từ lúc phiếu nhập `post`; **không bao giờ** xảy ra ở nhánh sinh từ OS-IN vì
`shouldPostStock` luôn `false` ở đó), `E164` (hoàn tất IQC khi không còn `WAITING_RETURN` — về
lý thuyết không tự xảy ra vì `post` là transition duy nhất gọi hàm này, nhưng vẫn giữ làm chốt chặn
cuối phòng gọi sai).

## Business rules

- Vì sao `postSupplierReturn` không phải lúc nào cũng trừ tồn, và vì sao `postInventoryReceipt` tự
  bù trừ → `docs/domains/inventory.md`, mục Business rules ("`shouldPostStock` bỏ qua trừ tồn ở 2
  ca").
- Quy tắc suy `status` của một dòng IQC, và vì sao `WAITING_RETURN` khoá `confirm` →
  `docs/domains/quality.md`.
- **Chưa có `cancel`** cho `supplier_returns` — huỷ một phiếu đã `POSTED` cần đường "un-complete"
  IQC (`COMPLETED → WAITING_RETURN`), trong khi phiếu nhập gốc rất có thể đã `post` dựa trên đó
  rồi; để đợt sau.

## Related domains

`quality` (chủ, tự sinh) → `inventory` (một chiều lúc tạo). Chiều `post` → hoàn tất IQC đi ngược
lại nhưng **không** qua service injection — xem "Transaction boundary". Không đụng `purchasing`
ở luồng này ngoài việc trace `purchaseOrderId` (thuần copy từ dòng IQC, không validate lại).

Bước trước: `POST /iqc/:iqcId/confirm` với disposition SORT/RETURN (xem `docs/domains/quality.md`).
Bước sau: không có — phiếu trả `POSTED` là điểm cuối (chưa có `cancel`); dòng IQC `COMPLETED` mở
khoá cho phiếu nhập gốc (nếu có) được `post` khi mọi IQC liên quan cũng `COMPLETED`
(`docs/workflows/receipt-confirmation.md`).

Code: `IqcService.confirmIqc` (điểm tự sinh),
`SupplierReturnsService.createFromIqcDisposition`/`postSupplierReturn`,
`src/api/iqc/iqc.write.ts#completeIqcAfterSupplierReturn`,
`src/api/supplier-returns/supplier-returns.query.ts#getReturnedQuantityByReceiptItemId`.
