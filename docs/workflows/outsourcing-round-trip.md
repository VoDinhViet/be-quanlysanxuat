# Gia công ngoài: OS-OUT → OS-IN → QC tuỳ chọn

Chặng nối `production` → `inventory` → `quality`: từ lúc lập phiếu gửi vật tư/WIP ra một NCC gia
công ngoài, tới lúc nhận hàng về, và (tuỳ chọn) kiểm chất lượng hàng nhận về giống hệt cách IQC xử
lý hàng nhập mua. Mô hình `outsourcing_orders`/`outsourcing_receipts` ở `docs/domains/inventory.md`,
mô hình `production_job_operations` (anchor) ở `docs/domains/production.md`, mô hình
`iqc_inspections` ở `docs/domains/quality.md`; đây là trình tự đầy đủ nối ba domain đó.

## Trigger

- `POST /outsourcing-orders` — lập phiếu gửi gia công ngoài (OS-OUT), tay.
- `POST /outsourcing-orders/:id/post` — xác nhận đã gửi hàng, trừ tồn kho.
- `POST /outsourcing-receipts` — lập phiếu nhận gia công ngoài (OS-IN) cho một OS-OUT đã `POSTED`,
  tay. Một OS-OUT nhận được nhiều lần (partial).
- `POST /outsourcing-receipts/:id/post` — xác nhận đã nhận hàng, cộng tồn kho; nếu `requiresIqc =
  true`, cùng transaction sinh 1 dòng `iqc_inspections`.
- (Nếu có IQC) `POST /iqc/:iqcId/confirm` với `result = FAIL` + `disposition = SORT`/`RETURN` — tự
  sinh `supplier_returns`, tiếp tục đúng luồng đã có ở `docs/workflows/supplier-return.md`.

## Actor

`outsourcing:create` để lập OS-OUT/OS-IN, `outsourcing:update` để `post`/`cancel` cả hai — tách
quyền xưởng (lập phiếu) khỏi quyền kho (`post`/`cancel`) tương tự các domain kho khác. `iqc:update`
cho bước `confirm` IQC (nếu có nhánh QC) — không khác gì luồng IQC trên phiếu nhập mua từ điểm này
trở đi.

## Preconditions

| Điều kiện | OS-OUT `create` | OS-OUT `post` | OS-IN `create` | OS-IN `post` |
| --- | --- | --- | --- | --- |
| Kho `ACTIVE` | `E094` | — | `E094` | — |
| NCC tồn tại, chưa xoá mềm | `E019` | — | — (copy từ OS-OUT) | — |
| `productionJobOperationId` tồn tại, snapshot `type = OUTSOURCE` | `E166` | — | — | — |
| `productionJob.status = IN_PROGRESS` | `E167` | — | — | — |
| BOM node snapshot suy được `itemId` | `E168` | — | — | — |
| Đúng trạng thái nguồn (`DRAFT`) | — | `E098` | — | `E098` |
| Đủ tồn kho gửi | — | `E106` | — | — |
| OS-OUT tồn tại, đang `POSTED` | — | — | `E165`/`E171` | — |
| SL nhận (cộng dồn) không vượt SL gửi | — | — | `E172` (tính `DRAFT`+`POSTED`) | `E172` (tính lại, chỉ `POSTED`) |
| Còn OS-IN chưa `CANCELLED` (chặn `cancel` OS-OUT) | — | — | — | *(xem `cancel`, không phải `post`)* |
| Đã có IQC trỏ vào (chặn `cancel` OS-IN) | — | — | — | *(xem `cancel`, không phải `post`)* |

## Flow

### Lập + gửi OS-OUT

1. `createOutsourcingOrder` — check đọc xong (bảng trên), suy `itemId`/`productionJobId`/
   `operationCode`/`operationName` từ `production_job_operations`/`production_job_bom_items`, sinh
   mã `OS-OUT-{đếm+1, pad 4}`, `INSERT` một dòng `DRAFT`. Một `INSERT` đơn — không mở transaction.
2. `postOutsourcingOrder` — transaction: khoá dòng (`FOR UPDATE`) → `DRAFT` else `E098` →
   `InventoryPostingService.postDocument(tx, { referenceType: OUTSOURCING_ORDER, lines: [{ itemId,
   signedQuantity: -quantity, type: ISSUE }] })` → `status = POSTED`.

### Lập + nhận OS-IN (lặp lại nếu nhận nhiều đợt)

3. `createOutsourcingReceipt` — check OS-OUT tồn tại + `POSTED`, kho nhận `ACTIVE`, trần SL sớm
   (`Σ` OS-IN `DRAFT`+`POSTED` hiện có + SL mới ≤ SL gửi). Copy `supplierId`/`itemId` từ OS-OUT,
   sinh mã `OS-IN-{đếm+1, pad 4}`, `INSERT` một dòng `DRAFT`.
4. `postOutsourcingReceipt` — transaction: khoá dòng → `DRAFT` else `E098` → **kiểm lại trần SL**
   (chỉ tính OS-IN `POSTED`, loại trừ chính nó — chốt chặn thật) → `postDocument(tx, {
   referenceType: OUTSOURCING_RECEIPT, lines: [{ itemId, signedQuantity: +quantity, type: RECEIPT
   }] })` → `status = POSTED` → nếu `requiresIqc`, gọi
   `IqcService.createInspectionFromOutsourcingReceipt(tx, {...})` — sinh 1 dòng `iqc_inspections`
   (`NOT_INSPECTED`), **không** gate bước `post` này (hàng đã về kho vật lý ngay lúc lập OS-IN).

### QC (chỉ khi `requiresIqc = true`)

5. Từ đây đúng luồng `POST /iqc/:iqcId/confirm` đã có — QC chọn `result`/`disposition`.
   `result = PASS` hoặc `disposition = CONCESSION` → `COMPLETED` ngay, không có gì thêm. `result =
   FAIL` + `disposition = SORT`/`RETURN` → `WAITING_RETURN`, tự sinh `supplier_returns` (`DRAFT`,
   `outsourcingReceiptId` trỏ về dòng OS-IN này) — `resolveReturnWarehouseId` suy kho trả từ
   `outsourcingReceipt.warehouseId` (nguồn thứ 2 trong 3, xem `docs/domains/quality.md`).
6. `postSupplierReturn` — đúng khuôn `docs/workflows/supplier-return.md`, nhưng
   **`shouldPostStock` luôn `true`** ở nhánh này: `inventoryReceiptId` của dòng `supplier_returns`
   sinh ra từ OS-IN luôn `null` (không phải trace về phiếu nhập mua), và điều kiện "bỏ qua nếu phiếu
   nhập gốc chưa `POSTED`" chỉ áp dụng khi có `inventoryReceiptId` — hàng OS-IN đã thật sự vào kho
   ở bước 4 nên trừ tồn ngay là đúng, không có ca "hàng chưa từng vào tồn" như IQC-trên-phiếu-nhập.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `outsourcing_orders` | `create` | *(chưa có)* | 1 dòng `DRAFT` |
| `outsourcing_orders.status` | `post` | `DRAFT` | `POSTED` |
| `inventory_balances`/`inventory_transactions` | `post` OS-OUT | — | trừ tồn kho gửi (`ISSUE`) |
| `outsourcing_receipts` | `create` | *(chưa có)* | 1 dòng `DRAFT` |
| `outsourcing_receipts.status` | `post` | `DRAFT` | `POSTED` |
| `inventory_balances`/`inventory_transactions` | `post` OS-IN | — | cộng tồn kho nhận (`RECEIPT`) |
| `iqc_inspections` | `post` OS-IN (nếu `requiresIqc`) | *(chưa có)* | 1 dòng `NOT_INSPECTED` |
| ...(từ đây giống `docs/workflows/supplier-return.md`, "State changes") | | | |

## Side effects

- `post` OS-OUT/OS-IN: đúng 1 bút toán mỗi lần, không side effect nào khác.
- `post` OS-IN với `requiresIqc = true`: thêm 1 dòng `iqc_inspections`, mã `IQC-{năm}-xxxxx` — dùng
  chung bộ đếm với IQC sinh từ phiếu nhập mua (cùng bảng, cùng hàm `generateIqcCodes`).
- Nhánh QC (nếu FAIL + SORT/RETURN): xem "Side effects" ở `docs/workflows/supplier-return.md` —
  không có gì khác nguồn OS-IN so với nguồn phiếu nhập mua từ bước `confirm` IQC trở đi.

## Transaction boundary

Bốn transaction rời, không transaction nào bắc cầu quá 2 module:

1. `postOutsourcingOrder` — chỉ `outsourcing_orders` + `InventoryPostingService` (module
   `inventory`).
2. `postOutsourcingReceipt` — `outsourcing_receipts` + `InventoryPostingService` + (tuỳ chọn)
   `IqcService.createInspectionFromOutsourcingReceipt` (module `iqc`, gọi trực tiếp qua DI —
   `OutsourcingReceiptsModule` import `IqcModule`; chiều ngược lại không tồn tại, `IqcService` đọc
   bảng `outsourcing_receipts` thẳng qua `tx`, không cần DI ngược nên **không** phát sinh vòng lặp
   module như cặp `IqcModule`/`SupplierReturnsModule`).
3. `confirmIqc` — `iqc_inspections` + `SupplierReturnsService.createFromIqcDisposition` (đã có từ
   trước, không đổi cơ chế — chỉ thêm 1 field `outsourcingReceiptId` truyền qua).
4. `postSupplierReturn` — `supplier_returns` + `InventoryPostingService` +
   `completeIqcAfterSupplierReturn` (plain function, như luồng gốc).

Sinh mã (`OS-OUT-xxxx`/`OS-IN-xxxx`) nằm **ngoài** transaction (một `INSERT` đơn ở bước `create`,
không cần `tx`) — khác `PTNCC`/`IQC` (sinh trong transaction `confirm`, vì đi kèm ghi khác cùng
transaction đó). Cùng giới hạn đếm-rồi-cộng đã chấp nhận chung trong repo — hai lượt `create` song
song có thể trùng mã, unique constraint trên `code` là chốt chặn thật.

## Failure cases

`E094` (kho `INACTIVE`), `E019` (NCC không tồn tại), `E098` (sai trạng thái nguồn khi `post`),
`E106` (thiếu tồn khi `post` OS-OUT), `E165`/`E170` (không tìm thấy OS-OUT/OS-IN), `E166` (công
đoạn không phải `OUTSOURCE`), `E167` (Job không `IN_PROGRESS`), `E168` (BOM node snapshot mất
`itemId`), `E169` (huỷ OS-OUT còn OS-IN chưa `CANCELLED`), `E171` (tạo OS-IN khi OS-OUT chưa
`POSTED`/đã `CANCELLED`), `E172` (SL nhận vượt SL gửi), `E173` (huỷ OS-IN đã có IQC trỏ vào). Nhánh
QC (nếu có) dùng lại nguyên bộ lỗi ở `docs/workflows/supplier-return.md`.

## Business rules

- Vì sao OS-OUT bắt buộc gắn `productionJobOperationId` của một Job `IN_PROGRESS`, và vì sao không
  ép nhóm NCC → `docs/domains/inventory.md`.
- Vì sao IQC trên OS-IN không gate `post` (khác phiếu nhập mua), và vì sao `shouldPostStock` luôn
  đúng cho nhánh này → `docs/domains/inventory.md`, "Gia công ngoài" ở Cross-domain dependencies.
- Quy tắc suy `status`/`disposition` của một dòng IQC, không đổi gì cho nguồn OS-IN →
  `docs/domains/quality.md`.
- **Chưa có** gating/block tiến độ Job hay công đoạn kế tiếp theo trạng thái OS-OUT/OS-IN — để đợt
  sau, xem `docs/domains/production.md`.

## Related domains

`inventory` (chủ cả hai chứng từ) ↔ `production` (đọc-một-chiều, anchor) ↔ `quality` (tuỳ chọn, tự
sinh khi `requiresIqc`). Không đụng `purchasing`/`suppliers` ngoài việc `outsourcing_orders.
supplierId` trỏ `suppliers` (thuần FK, không validate nhóm).

Bước trước: `production_job_operations` snapshot `type = OUTSOURCE` đã có sẵn từ lúc duyệt LSX
(`docs/domains/production.md`) — không phải bước của luồng này, chỉ là điều kiện cần.
Bước sau: nếu có nhánh QC FAIL + SORT/RETURN, tiếp tục đúng
`docs/workflows/supplier-return.md` từ bước `post` phiếu trả.

Code: `OutsourcingOrdersService`, `OutsourcingReceiptsService`,
`src/api/outsourcing-receipts/outsourcing-receipts.query.ts#getReceivedQuantityByOutsourcingOrderId`,
`IqcService.createInspectionFromOutsourcingReceipt`.
